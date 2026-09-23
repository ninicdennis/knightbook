import { randomUUID } from 'node:crypto'
import { cp, mkdir, mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { call, callExpectingError, connect, connectShared, type Connection } from './client.js'
import { stageResources, type StagedResources } from './stage.js'

/**
 * One shared MCP configuration for every project the user enabled, exercised the
 * way a real client runs it: the staged runtime and bundled server, launched with
 * `--registry`, no system Node, no GUI.
 *
 * The registry is written here the way the desktop app writes it. Its shape is
 * the contract between the two processes, so writing it by hand is what proves
 * the server needs nothing from the app but that file.
 */

interface ProjectInfo {
  id: string
  name: string
  path: string
}

interface RegistryEntry {
  checkout_id: string
  path: string
  project_id: string
  name: string
  enabled_at: string
}

let workspace: string
let resources: StagedResources
let registryPath: string
let alpha: ProjectInfo
let clone: ProjectInfo
let beta: ProjectInfo
const entries = new Map<string, RegistryEntry>()

async function writeRegistry(): Promise<void> {
  const registry = { schema_version: 1, checkouts: [...entries.values()] }
  await writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf8')
}

function enable(project: ProjectInfo): string {
  const checkoutId = randomUUID()
  entries.set(project.path, {
    checkout_id: checkoutId,
    path: project.path,
    project_id: project.id,
    name: project.name,
    enabled_at: new Date().toISOString(),
  })
  return checkoutId
}

/** Sets a project up through a root-bound connection, which is still how one is created from MCP. */
async function initialize(folder: string, name: string): Promise<ProjectInfo> {
  const connection = await connect(resources, join(workspace, folder), workspace)
  try {
    const created = await call(connection, 'project_initialize', { name })
    return { id: String(created.id), name, path: String(created.checkout_path) }
  } finally {
    await connection.close()
  }
}

async function projectInfoAt(path: string): Promise<ProjectInfo> {
  const connection = await connect(resources, path, workspace)
  try {
    const got = await call(connection, 'project_get')
    return { id: String(got.id), name: String(got.name), path: String(got.checkout_path) }
  } finally {
    await connection.close()
  }
}

let alphaId: string
let cloneId: string

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'knightbook-shared-'))
  resources = await stageResources(join(workspace, 'resources'))
  registryPath = join(workspace, 'app-data', 'mcp-access.json')

  alpha = await initialize('alpha', 'Alpha')
  beta = await initialize('beta', 'Beta')
  // A clone carries the same project.md, so the same project id and name.
  await cp(alpha.path, join(workspace, 'alpha-clone'), { recursive: true })
  clone = await projectInfoAt(join(workspace, 'alpha-clone'))

  alphaId = enable(alpha)
  cloneId = enable(clone)
  await mkdir(join(workspace, 'app-data'), { recursive: true })
  await writeRegistry()
})

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true })
})

async function withShared<T>(run: (connection: Connection) => Promise<T>): Promise<T> {
  const connection = await connectShared(resources, registryPath, workspace)
  try {
    return await run(connection)
  } finally {
    await connection.close()
  }
}

describe('the shared connection', () => {
  it('offers projects_list and no project creation', async () => {
    await withShared(async (connection) => {
      const names = (await connection.client.listTools()).tools.map((tool) => tool.name)
      expect(names).toContain('projects_list')
      expect(names).not.toContain('project_initialize')
      expect(connection.client.getInstructions()).toMatch(/projects_list/)
    })
  })

  it('lists clones separately even though their project id and name match', async () => {
    await withShared(async (connection) => {
      const { projects } = (await call(connection, 'projects_list')) as {
        projects: Array<Record<string, unknown>>
      }
      expect(projects).toHaveLength(2)
      expect(clone.id).toBe(alpha.id)
      const byId = new Map(projects.map((p) => [p.checkout_id, p]))
      expect(byId.get(alphaId)).toMatchObject({ checkout_path: alpha.path, available: true })
      expect(byId.get(cloneId)).toMatchObject({ checkout_path: clone.path, available: true })
      expect(byId.get(alphaId)?.same_project_as).toEqual([cloneId])
    })
  })

  it('keeps two concurrent clients on their own targets', async () => {
    const first = await connectShared(resources, registryPath, workspace)
    const second = await connectShared(resources, registryPath, workspace)
    try {
      const results = await Promise.all(
        Array.from({ length: 4 }, (_, index) =>
          index % 2 === 0
            ? call(first, 'ticket_create', { checkout_id: alphaId, title: `Alpha ${index}` })
            : call(second, 'ticket_create', { checkout_id: cloneId, title: `Clone ${index}` }),
        ),
      )
      for (const [index, result] of results.entries()) {
        const expected = index % 2 === 0 ? alpha.path : clone.path
        expect((result.project as { checkout_path: string }).checkout_path).toBe(expected)
      }

      const titles = async (connection: Connection, checkoutId: string) =>
        (
          (await call(connection, 'ticket_list', { checkout_id: checkoutId })).tickets as Array<{
            title: string
          }>
        )
          .map((ticket) => ticket.title)
          .sort()
      expect(await titles(second, alphaId)).toEqual(['Alpha 0', 'Alpha 2'])
      expect(await titles(first, cloneId)).toEqual(['Clone 1', 'Clone 3'])
    } finally {
      await first.close()
      await second.close()
    }
  })

  it('refuses a call with no checkout_id or an unknown one, instead of picking a project', async () => {
    await withShared(async (connection) => {
      expect(await callExpectingError(connection, 'ticket_list', {})).toMatch(/checkout_id/)
      expect(
        await callExpectingError(connection, 'ticket_list', { checkout_id: randomUUID() }),
      ).toMatch(/^checkout_not_enabled/)
      expect(
        await callExpectingError(connection, 'ticket_list', { checkout_id: alpha.path }),
      ).toMatch(/^checkout_not_enabled/)
    })
  })

  it('reaches a newly enabled project, and loses a revoked one, without reconnecting', async () => {
    await withShared(async (connection) => {
      const betaId = enable(beta)
      expect(await callExpectingError(connection, 'project_get', { checkout_id: betaId })).toMatch(
        /^checkout_not_enabled/,
      )

      await writeRegistry()
      const got = await call(connection, 'project_get', { checkout_id: betaId })
      expect(got).toMatchObject({ name: 'Beta', checkout_path: beta.path })

      entries.delete(beta.path)
      await writeRegistry()
      expect(await callExpectingError(connection, 'project_get', { checkout_id: betaId })).toMatch(
        /^checkout_not_enabled/,
      )
    })
  })

  it('still refuses a stale revision after resolving the target', async () => {
    await withShared(async (connection) => {
      const created = await call(connection, 'ticket_create', { checkout_id: alphaId, title: 'R' })
      expect(
        await callExpectingError(connection, 'ticket_update', {
          checkout_id: alphaId,
          id: created.id,
          expected_revision: 'stale',
          title: 'R2',
        }),
      ).toMatch(/^revision_conflict/)
    })
  })

  it('works again from a fresh process with the same id: nothing depends on the window', async () => {
    const first = await withShared(
      async (c) => await call(c, 'project_get', { checkout_id: alphaId }),
    )
    const second = await withShared(
      async (c) => await call(c, 'project_get', { checkout_id: alphaId }),
    )
    expect(second.checkout_path).toBe(first.checkout_path)
  })

  it('records its own liveness beside the registry and activity in the project it used', async () => {
    await withShared(async (connection) => {
      await call(connection, 'project_get', { checkout_id: alphaId })
      const shared = await readdir(join(workspace, 'app-data', 'mcp-runtime', 'sessions'))
      expect(shared.filter((name) => name.endsWith('.json')).length).toBeGreaterThan(0)
      const activity = await readdir(join(alpha.path, '.projectspace', 'runtime', 'activity'))
      expect(activity.length).toBeGreaterThan(0)
      // Not a per-project session: a shared server must not read as "connected to this project".
      const perProject = await readdir(
        join(alpha.path, '.projectspace', 'runtime', 'sessions'),
      ).catch(() => [] as string[])
      expect(perProject.filter((name) => name.endsWith('.json'))).toEqual([])
    })
  })

  it('reports a moved folder and does not rebind it to its clone', async () => {
    await withShared(async (connection) => {
      const moved = join(workspace, 'alpha-clone-moved')
      await rename(clone.path, moved)
      try {
        const { projects } = (await call(connection, 'projects_list')) as {
          projects: Array<Record<string, unknown>>
        }
        const entry = projects.find((p) => p.checkout_id === cloneId)
        expect(entry).toMatchObject({ available: false })
        expect(String(entry?.unavailable_reason)).toMatch(/not found/)
        expect(
          await callExpectingError(connection, 'ticket_list', { checkout_id: cloneId }),
        ).toMatch(/^checkout_unavailable/)
        // The original is untouched and still reachable by its own id.
        await call(connection, 'ticket_list', { checkout_id: alphaId })
      } finally {
        await rename(moved, clone.path)
      }
    })
  })

  it('reaches nothing while the registry is corrupt, and leaves the file alone', async () => {
    await withShared(async (connection) => {
      await writeFile(registryPath, '{ not json', 'utf8')
      try {
        expect(await callExpectingError(connection, 'projects_list')).toMatch(
          /^registry_unreadable/,
        )
        expect(
          await callExpectingError(connection, 'project_get', { checkout_id: alphaId }),
        ).toMatch(/^registry_unreadable/)
      } finally {
        await writeRegistry()
      }
      await call(connection, 'project_get', { checkout_id: alphaId })
    })
  })
})

describe('a root-bound connection alongside it', () => {
  it('stays bound to its own folder and ignores a checkout_id', async () => {
    const connection = await connect(resources, beta.path, workspace)
    try {
      const names = (await connection.client.listTools()).tools.map((tool) => tool.name)
      expect(names).not.toContain('projects_list')
      const got = await call(connection, 'project_get', { checkout_id: alphaId })
      expect(got).toMatchObject({ name: 'Beta', checkout_path: beta.path })
      expect(got.project).toBeUndefined()
    } finally {
      await connection.close()
    }
  })
})
