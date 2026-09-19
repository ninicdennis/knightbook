import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { call, callExpectingError, connect } from './client.js'
import { stageResources, type StagedResources } from './stage.js'

/**
 * The "Independent packaging" row of technical design section 11: invoke the
 * bundled Node and server through the saved client command, with no system Node
 * and no GUI, read and write a fixture project, and confirm the configured path
 * survives an app update.
 *
 * Only the Windows runtime is exercised here, because that is the machine this
 * ran on. The layout and launch command are platform-independent; macOS and
 * Linux need the same test run on those machines before the row is complete.
 */

let workspace: string
let resources: StagedResources
let projectRoot: string
/** Somewhere unrelated to both the repo and the project, as a real client would be. */
let unrelatedCwd: string

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'projectspace-packaging-'))
  resources = await stageResources(join(workspace, 'resources'))
  projectRoot = join(workspace, 'fixture-project')
  unrelatedCwd = workspace
})

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true })
})

describe('the shipped runtime starts without a system Node', () => {
  it('stages a Node runtime beside the bundled server', async () => {
    expect((await stat(resources.nodePath)).size).toBeGreaterThan(1_000_000)
    expect((await stat(resources.serverPath)).size).toBeGreaterThan(100_000)
  })

  it('serves MCP over stdio when launched by its installed path', async () => {
    const connection = await connect(resources, projectRoot, unrelatedCwd)
    try {
      const { tools } = await connection.client.listTools()
      const names = tools.map((t) => t.name).sort()
      expect(names).toContain('project_initialize')
      expect(names).toContain('ticket_record_user_completion')
      expect(names).toContain('ticket_next')
    } finally {
      await connection.close()
    }
  })

  it('tells a connecting client the rules, without any skill installed', async () => {
    const connection = await connect(resources, projectRoot, unrelatedCwd)
    try {
      const instructions = connection.client.getInstructions() ?? ''
      expect(instructions).toMatch(/only the user decides done/i)
      expect(instructions).toContain('project_get')
    } finally {
      await connection.close()
    }
  })

  it('runs on the runtime we shipped, not one found on PATH', async () => {
    const connection = await connect(resources, projectRoot, unrelatedCwd)
    try {
      // The server announces its root on stderr at startup, proving it is our build.
      await new Promise((r) => setTimeout(r, 150))
      expect(connection.stderr()).toContain('projectspace')
    } finally {
      await connection.close()
    }
  })
})

describe('a full ticket lifecycle through the packaged server', () => {
  let ticketId: string
  let revision: string

  it('initializes a project in the bound folder', async () => {
    const connection = await connect(resources, projectRoot, unrelatedCwd)
    try {
      const created = await call(connection, 'project_initialize', { name: 'Smoke Test' })
      expect(created['name']).toBe('Smoke Test')

      const manifest = await readFile(join(projectRoot, '.projectspace', 'project.md'), 'utf8')
      expect(manifest).toContain('schema_version: 1')
      expect(manifest).toContain('"Smoke Test"')
    } finally {
      await connection.close()
    }
  })

  it('creates a ticket and moves it to Verification', async () => {
    const connection = await connect(resources, projectRoot, unrelatedCwd)
    try {
      const created = await call(connection, 'ticket_create', { title: 'Implement the board' })
      ticketId = created['id'] as string
      revision = created['revision'] as string

      const started = await call(connection, 'ticket_update', {
        id: ticketId,
        expected_revision: revision,
        status: 'in_progress',
      })
      const verifying = await call(connection, 'ticket_update', {
        id: ticketId,
        expected_revision: started['revision'],
        status: 'verification',
      })

      expect(verifying['status']).toBe('verification')
      revision = verifying['revision'] as string
    } finally {
      await connection.close()
    }
  })

  it('refuses to reach Done through a general update', async () => {
    const connection = await connect(resources, projectRoot, unrelatedCwd)
    try {
      const message = await callExpectingError(connection, 'ticket_update', {
        id: ticketId,
        expected_revision: revision,
        status: 'done',
      })
      // Rejected by the tool schema before it ever reaches the write path.
      expect(message.length).toBeGreaterThan(0)
    } finally {
      await connection.close()
    }
  })

  it('refuses completion when the user has not instructed it, even from Verification', async () => {
    const connection = await connect(resources, projectRoot, unrelatedCwd)
    try {
      const message = await callExpectingError(connection, 'ticket_record_user_completion', {
        id: ticketId,
        expected_revision: revision,
        user_instructed_completion: false,
        instruction: 'All checks passed and I reviewed the diff myself.',
      })
      expect(message).toContain('invalid_transition')
      expect(message).toContain('not the user')
    } finally {
      await connection.close()
    }
  })

  it('records Done on an explicit user instruction, with honest provenance', async () => {
    const connection = await connect(resources, projectRoot, unrelatedCwd)
    try {
      const done = await call(connection, 'ticket_record_user_completion', {
        id: ticketId,
        expected_revision: revision,
        user_instructed_completion: true,
        instruction: 'User checked it in their editor and said it is complete.',
      })

      expect(done['status']).toBe('done')
      const completion = done['completion'] as Record<string, unknown>
      expect(completion['decision_source']).toBe('reported_user_instruction')
      expect(completion['recorded_by']).toBe('agent')

      const file = await readFile(
        join(projectRoot, '.projectspace', 'tickets', `${ticketId}.md`),
        'utf8',
      )
      expect(file).toContain('decision_source: reported_user_instruction')
      expect(file).toContain('recorded_by: agent')
    } finally {
      await connection.close()
    }
  })

  it('rejects a write based on a revision read before the completion', async () => {
    const connection = await connect(resources, projectRoot, unrelatedCwd)
    try {
      const message = await callExpectingError(connection, 'ticket_update', {
        id: ticketId,
        expected_revision: revision,
        title: 'Renamed from a stale read',
      })
      expect(message).toContain('revision_conflict')
    } finally {
      await connection.close()
    }
  })
})

describe('state persists across connections and an app update', () => {
  it('a fresh connection sees what the previous one wrote', async () => {
    const connection = await connect(resources, projectRoot, unrelatedCwd)
    try {
      const project = await call(connection, 'project_get')
      expect(project['initialized']).toBe(true)
      expect(project['name']).toBe('Smoke Test')
      expect((project['ticket_counts'] as Record<string, number>)['done']).toBe(1)
    } finally {
      await connection.close()
    }
  })

  it('the saved client command still works after the resources are replaced', async () => {
    // An app update rewrites the installed resources at the same path. The
    // command the client saved must keep working without being reconfigured.
    const restaged = await stageResources(resources.resourcesDir)
    expect(restaged.nodePath).toBe(resources.nodePath)
    expect(restaged.serverPath).toBe(resources.serverPath)

    const connection = await connect(restaged, projectRoot, unrelatedCwd)
    try {
      const project = await call(connection, 'project_get')
      expect(project['initialized']).toBe(true)
      expect((project['ticket_counts'] as Record<string, number>)['done']).toBe(1)
    } finally {
      await connection.close()
    }
  })

  it('reports an uninitialized folder instead of creating one implicitly', async () => {
    const empty = join(workspace, 'not-a-project')
    const connection = await connect(resources, empty, unrelatedCwd)
    try {
      const project = await call(connection, 'project_get')
      expect(project['initialized']).toBe(false)
    } finally {
      await connection.close()
    }
  })
})
