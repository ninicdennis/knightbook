import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import { access, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { RESERVED_DIR, reservedPaths, type ProjectRoot } from './paths.js'

/**
 * Evidence that an MCP server is running for a project, and whether a client has
 * actually opened a connection to it.
 *
 * The desktop window cannot observe this any other way. Technical design section
 * 1 has the AI client launch the server over stdio and own the process, so the
 * window never sees it, has no handle on it, and shares no channel with it. The
 * only thing the two processes reliably share is the project folder, so the
 * server records its own liveness there and the window reads it.
 *
 * This is coordination state rather than project content, so it lives beside the
 * write lock under the reserved folder and is excluded from Git.
 *
 * What a record proves is deliberately narrow. `startedAt` says a server process
 * began; `connectedAt` says a client completed an opening handshake; `lastSeenAt`
 * says the process was still alive at that moment. A record whose heartbeat has
 * stopped proves only that it stopped — never that a connection is healthy.
 */

/** How often a running server refreshes `lastSeenAt`. */
export const SESSION_HEARTBEAT_MS = 10_000

/**
 * A heartbeat older than this is no longer evidence of a running process. Wide
 * enough that a busy or briefly suspended machine is not reported as dead on a
 * single missed write.
 */
export const SESSION_STALE_MS = 45_000

export interface McpSessionRecord {
  readonly sessionId: string
  readonly pid: number
  readonly startedAt: string
  /** When a client completed an opening handshake, or null if none has. */
  readonly connectedAt: string | null
  readonly lastSeenAt: string
}

export interface McpSessionReading {
  /** Records whose heartbeat is recent enough to be evidence of a live process. */
  readonly live: McpSessionRecord[]
  /** Records left behind by a process that stopped without cleaning up. */
  readonly stale: McpSessionRecord[]
  /** Set when the folder could not be read at all: the state is unknown, not empty. */
  readonly unreadable: string | null
}

function sessionsDir(root: ProjectRoot): string {
  return join(root.path, RESERVED_DIR, 'runtime', 'sessions')
}

function isRecord(value: unknown): value is McpSessionRecord {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<McpSessionRecord>
  return (
    typeof candidate.sessionId === 'string' &&
    typeof candidate.pid === 'number' &&
    typeof candidate.startedAt === 'string' &&
    typeof candidate.lastSeenAt === 'string' &&
    (candidate.connectedAt === null || typeof candidate.connectedAt === 'string')
  )
}

/**
 * Reads every session record written for this project and sorts them by whether
 * their heartbeat is still current.
 *
 * Liveness is judged by the heartbeat alone. Checking whether the recorded pid
 * still exists looks stronger but is not: pids are reused, and a project folder
 * on a shared drive may hold records from a different machine entirely, where
 * any local pid answer would be meaningless.
 */
export async function readMcpSessions(
  root: ProjectRoot,
  now: number = Date.now(),
): Promise<McpSessionReading> {
  const dir = sessionsDir(root)

  let names: string[]
  try {
    names = await readdir(dir)
  } catch (error) {
    // Never created means no server has run here, which is a real answer.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { live: [], stale: [], unreadable: null }
    }
    return { live: [], stale: [], unreadable: describe(error) }
  }

  const live: McpSessionRecord[] = []
  const stale: McpSessionRecord[] = []

  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const record = await readOne(join(dir, name))
    // An unparseable record is not evidence of anything, so it is dropped rather
    // than counted as either a connection or an absence of one.
    if (!record) continue

    const seen = Date.parse(record.lastSeenAt)
    if (Number.isFinite(seen) && now - seen <= SESSION_STALE_MS) live.push(record)
    else stale.push(record)
  }

  return { live, stale, unreadable: null }
}

async function readOne(path: string): Promise<McpSessionRecord | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The running server's own record, which it refreshes until the process ends. */
export interface McpSessionHandle {
  readonly sessionId: string
  /** Records that a client completed an opening handshake. */
  markConnected(): Promise<void>
  /** Refreshes `lastSeenAt`. Called on a timer by the server. */
  beat(): Promise<void>
  /** Removes the record on a clean shutdown. */
  end(): Promise<void>
  /**
   * The same cleanup, synchronously, for the one place it has to be: a process
   * `exit` handler, where the loop has stopped and a promise will never settle.
   */
  endSync(): void
}

/**
 * Starts recording a session for this process. Failure to write is deliberately
 * not fatal: a read-only or unwritable project folder must still serve MCP, and
 * the cost is only that the desktop window cannot observe this connection. Every
 * method resolves quietly for the same reason.
 */
export async function startMcpSession(
  root: ProjectRoot,
  pid: number = process.pid,
): Promise<McpSessionHandle> {
  const sessionId = randomUUID()
  const dir = sessionsDir(root)
  const path = join(dir, `${sessionId}.json`)
  const startedAt = new Date().toISOString()
  let connectedAt: string | null = null
  let ended = false

  const save = async (): Promise<void> => {
    if (ended) return
    try {
      /**
       * A folder with no project in it is not ours to write into. Creating the
       * heartbeat directory there would leave `.projectspace/` non-empty and
       * make `project_initialize` refuse the folder, so a server bound to a
       * folder the user has not set up yet records nothing. Checking on every
       * beat rather than once means a project created through MCP starts being
       * observable within one heartbeat, without a separate retry path.
       */
      if (!(await projectFileExists())) return

      await mkdir(dir, { recursive: true })
      const record: McpSessionRecord = {
        sessionId,
        pid,
        startedAt,
        connectedAt,
        lastSeenAt: new Date().toISOString(),
      }
      await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
    } catch {
      // Unobservable, not broken. The server keeps serving.
    }
  }

  const projectFileExists = async (): Promise<boolean> => {
    try {
      await access(reservedPaths.projectFile(root))
      return true
    } catch {
      return false
    }
  }

  await sweepAbandoned(dir)
  await save()

  return {
    sessionId,
    markConnected: async () => {
      connectedAt ??= new Date().toISOString()
      await save()
    },
    beat: save,
    end: async () => {
      ended = true
      try {
        await rm(path, { force: true })
      } catch {
        // A leftover record reads as stale, which is still honest.
      }
    },
    endSync: () => {
      ended = true
      try {
        rmSync(path, { force: true })
      } catch {
        // A hard kill leaves the record behind; the next server sweeps it.
      }
    },
  }
}

/**
 * Clears records left by processes that were killed before they could clean up.
 * Done by a starting server rather than by the window, because reading status
 * must never write to the user's project.
 */
async function sweepAbandoned(dir: string, now: number = Date.now()): Promise<void> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return
  }

  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const path = join(dir, name)
    const record = await readOne(path)
    const seen = record ? Date.parse(record.lastSeenAt) : NaN
    if (Number.isFinite(seen) && now - seen <= SESSION_STALE_MS) continue
    try {
      await rm(path, { force: true })
    } catch {
      // Another process may have removed it first.
    }
  }
}
