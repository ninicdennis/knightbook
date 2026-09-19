import { access, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { call, callExpectingError, connect } from './client.js'
import { REPO_ROOT, type StagedResources } from './stage.js'

/**
 * The same checks as packaging.test.ts, but against the output of a real
 * `electron-builder --dir` build rather than a staged copy. This is what
 * technical design section 11 actually asks for: the installed resources path,
 * the saved client command, and no GUI.
 *
 * Skipped when the packaged build is absent, so the suite still runs on a
 * machine that has not built the app. Produce it with
 * `pnpm --filter @projectspace/desktop pack:dir`.
 *
 * CI sets REQUIRE_PACKAGED_APP=1, which turns "absent" into a failure: a check
 * that quietly skips is not a check.
 */

const RELEASE_DIR = join(REPO_ROOT, 'apps', 'desktop', 'release')
const NODE_BINARY = process.platform === 'win32' ? 'node.exe' : 'node'

/** Where electron-builder --dir leaves the resources folder on each platform. */
const RESOURCE_DIR_CANDIDATES: Record<string, string[]> = {
  win32: [join('win-unpacked', 'resources')],
  linux: [join('linux-unpacked', 'resources')],
  darwin: [
    join('mac-arm64', 'Projectspace.app', 'Contents', 'Resources'),
    join('mac', 'Projectspace.app', 'Contents', 'Resources'),
  ],
}

async function packagedResources(): Promise<StagedResources | null> {
  for (const candidate of RESOURCE_DIR_CANDIDATES[process.platform] ?? []) {
    const resourcesDir = join(RELEASE_DIR, candidate)
    const mcpDir = join(resourcesDir, 'mcp')
    try {
      await access(join(mcpDir, NODE_BINARY))
      await access(join(mcpDir, 'server.mjs'))
    } catch {
      continue
    }
    return {
      resourcesDir,
      nodePath: join(mcpDir, NODE_BINARY),
      serverPath: join(mcpDir, 'server.mjs'),
    }
  }
  return null
}

const resources = await packagedResources()
if (!resources && process.env['REQUIRE_PACKAGED_APP']) {
  throw new Error(
    'REQUIRE_PACKAGED_APP is set but no packaged app was found under apps/desktop/release. ' +
      'Run pnpm pack:dir first.',
  )
}
const describePackaged = resources ? describe : describe.skip

let workspace: string
let projectRoot: string

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'projectspace-packaged-'))
  projectRoot = join(workspace, 'project')
})

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true })
})

describePackaged('the installed application', () => {
  it('keeps the MCP runtime outside the ASAR archive', async () => {
    const asar = await stat(join(resources!.resourcesDir, 'app.asar'))
    const runtime = await stat(resources!.nodePath)
    expect(asar.isFile()).toBe(true)
    expect(runtime.isFile()).toBe(true)
  })

  it('drives a full lifecycle with no Node on PATH and no GUI running', async () => {
    const connection = await connect(resources!, projectRoot, workspace)
    try {
      const project = await call(connection, 'project_initialize', { name: 'Packaged' })
      expect(project['name']).toBe('Packaged')

      const created = await call(connection, 'ticket_create', { title: 'Ship it' })
      const id = created['id'] as string

      const started = await call(connection, 'ticket_update', {
        id,
        expected_revision: created['revision'],
        status: 'in_progress',
      })
      const verifying = await call(connection, 'ticket_update', {
        id,
        expected_revision: started['revision'],
        status: 'verification',
      })

      // Reaching Verification with passing checks is still not the user decision.
      const refused = await callExpectingError(connection, 'ticket_record_user_completion', {
        id,
        expected_revision: verifying['revision'],
        user_instructed_completion: false,
        instruction: 'Tests are green.',
      })
      expect(refused).toContain('invalid_transition')

      const done = await call(connection, 'ticket_record_user_completion', {
        id,
        expected_revision: verifying['revision'],
        user_instructed_completion: true,
        instruction: 'User confirmed completion in chat.',
      })
      expect(done['status']).toBe('done')

      const file = await readFile(join(projectRoot, '.projectspace', 'tickets', `${id}.md`), 'utf8')
      expect(file).toContain('decision_source: reported_user_instruction')
    } finally {
      await connection.close()
    }
  })

  it('shows the same records to a second, independent connection', async () => {
    const connection = await connect(resources!, projectRoot, workspace)
    try {
      const project = await call(connection, 'project_get')
      expect(project['name']).toBe('Packaged')
      expect((project['ticket_counts'] as Record<string, number>)['done']).toBe(1)
    } finally {
      await connection.close()
    }
  })
})
