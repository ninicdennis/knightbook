import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { withFixtureProject } from '../test/fixture-project.js'
import { initializeProject } from '../records/project.js'
import { readMcpSessions, startMcpSession, SESSION_STALE_MS } from './mcp-sessions.js'
import { RESERVED_DIR } from '../records/paths.js'

/**
 * The desktop window reports a connection status entirely from these records, so
 * what they do and do not prove is the whole point of the tests below.
 */

function sessionsDir(rootPath: string): string {
  return join(rootPath, RESERVED_DIR, 'runtime', 'sessions')
}

describe('MCP session records', () => {
  it('records a running server before any client has connected', async () => {
    await withFixtureProject(async (project) => {
      await startMcpSession(project.root, 1234)

      const reading = await readMcpSessions(project.root)
      expect(reading.live).toHaveLength(1)
      expect(reading.live[0]!.pid).toBe(1234)
      // Running is not connected. Claiming otherwise is the failure this guards.
      expect(reading.live[0]!.connectedAt).toBeNull()
    })
  })

  it('records a client connection only once one has opened', async () => {
    await withFixtureProject(async (project) => {
      const session = await startMcpSession(project.root, 1234)
      await session.markConnected()

      const reading = await readMcpSessions(project.root)
      expect(reading.live[0]!.connectedAt).not.toBeNull()
    })
  })

  it('keeps the first connection time when a later beat happens', async () => {
    await withFixtureProject(async (project) => {
      const session = await startMcpSession(project.root, 1234)
      await session.markConnected()
      const first = (await readMcpSessions(project.root)).live[0]!.connectedAt

      await session.beat()

      expect((await readMcpSessions(project.root)).live[0]!.connectedAt).toBe(first)
    })
  })

  it('reports a record whose heartbeat stopped as stale, not live', async () => {
    await withFixtureProject(async (project) => {
      await startMcpSession(project.root, 1234)

      const later = Date.now() + SESSION_STALE_MS + 1_000
      const reading = await readMcpSessions(project.root, later)

      expect(reading.live).toHaveLength(0)
      expect(reading.stale).toHaveLength(1)
    })
  })

  it('removes its record on a clean shutdown', async () => {
    await withFixtureProject(async (project) => {
      const session = await startMcpSession(project.root, 1234)
      await session.end()

      const reading = await readMcpSessions(project.root)
      expect(reading.live).toHaveLength(0)
      expect(reading.stale).toHaveLength(0)
    })
  })

  it('removes its record synchronously, for the process exit handler', async () => {
    await withFixtureProject(async (project) => {
      const session = await startMcpSession(project.root, 1234)

      // An awaited removal never completes once the event loop has closed, so
      // shutdown cleanup has to work without one.
      session.endSync()

      const reading = await readMcpSessions(project.root)
      expect(reading.live).toHaveLength(0)
      expect(reading.stale).toHaveLength(0)
    })
  })

  it('stops writing after it has ended, so a late beat cannot resurrect it', async () => {
    await withFixtureProject(async (project) => {
      const session = await startMcpSession(project.root, 1234)
      await session.end()

      await session.beat()

      expect((await readMcpSessions(project.root)).live).toHaveLength(0)
    })
  })

  it('reports no sessions for a project no server has ever served', async () => {
    await withFixtureProject(async (project) => {
      const reading = await readMcpSessions(project.root)
      expect(reading).toEqual({ live: [], stale: [], unreadable: null })
    })
  })

  it('ignores a record it cannot parse rather than counting it either way', async () => {
    await withFixtureProject(async (project) => {
      const dir = sessionsDir(project.root.path)
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'broken.json'), '{ not json', 'utf8')
      await writeFile(join(dir, 'wrong-shape.json'), '{"sessionId":1}', 'utf8')

      const reading = await readMcpSessions(project.root)
      expect(reading.live).toHaveLength(0)
      expect(reading.stale).toHaveLength(0)
      expect(reading.unreadable).toBeNull()
    })
  })

  it('clears records abandoned by a killed process when a new server starts', async () => {
    await withFixtureProject(async (project) => {
      const dir = sessionsDir(project.root.path)
      await mkdir(dir, { recursive: true })
      const abandoned = new Date(Date.now() - SESSION_STALE_MS - 60_000).toISOString()
      await writeFile(
        join(dir, 'ghost.json'),
        JSON.stringify({
          sessionId: 'ghost',
          pid: 999,
          startedAt: abandoned,
          connectedAt: abandoned,
          lastSeenAt: abandoned,
        }),
        'utf8',
      )

      await startMcpSession(project.root, 1234)

      expect(await readdir(dir)).not.toContain('ghost.json')
      const reading = await readMcpSessions(project.root)
      expect(reading.live).toHaveLength(1)
      expect(reading.stale).toHaveLength(0)
    })
  })

  it('writes nothing into a folder that is not a project yet', async () => {
    // A server bound to a folder before setup must leave `.projectspace/` empty,
    // or `project_initialize` will refuse the folder as somebody else's.
    const dir = await mkdtemp(join(tmpdir(), 'knightbook-unset-'))
    try {
      const session = await startMcpSession({ path: dir }, 1234)
      await session.beat()

      await expect(readdir(join(dir, RESERVED_DIR))).rejects.toThrow()
      // Initialization must still be possible afterwards.
      await expect(initializeProject(dir, { name: 'Later' })).resolves.toBeTruthy()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('starts recording once the project it is bound to exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'knightbook-late-'))
    try {
      const session = await startMcpSession({ path: dir }, 1234)
      expect((await readMcpSessions({ path: dir })).live).toHaveLength(0)

      await initializeProject(dir, { name: 'Created through MCP' })
      // The next heartbeat is what makes the connection observable.
      await session.beat()

      expect((await readMcpSessions({ path: dir })).live).toHaveLength(1)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('leaves another live server alone when one starts beside it', async () => {
    await withFixtureProject(async (project) => {
      await startMcpSession(project.root, 1111)
      await startMcpSession(project.root, 2222)

      const pids = (await readMcpSessions(project.root)).live.map((s) => s.pid).sort()
      expect(pids).toEqual([1111, 2222])
    })
  })
})
