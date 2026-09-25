import { rmSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { RESERVED_DIR, type ProjectRoot } from '../records/paths.js'

/**
 * Evidence that a shared multi-project server actually worked on this project.
 *
 * A shared server being connected proves only that some AI client can reach
 * every enabled project, not that it is using this one. So the server leaves a
 * separate, small record in a project each time a call targets it, and the
 * window reports "last used" from that — never "connected" — for a project it
 * reaches through the shared connection.
 *
 * Like session heartbeats this is coordination state under the Git-ignored
 * runtime folder, and it is written best-effort: failing to record activity must
 * never fail the operation it describes.
 */

export interface McpActivityRecord {
  /** The shared server session that made the call; matches its heartbeat record. */
  readonly sessionId: string
  readonly lastActivityAt: string
}

/** Records older than this are removed by the next server to write here. */
const ACTIVITY_RETENTION_MS = 24 * 60 * 60 * 1000

function activityDir(root: ProjectRoot): string {
  return join(root.path, RESERVED_DIR, 'runtime', 'activity')
}

export async function recordMcpActivity(root: ProjectRoot, sessionId: string): Promise<void> {
  try {
    const dir = activityDir(root)
    await mkdir(dir, { recursive: true })
    const record: McpActivityRecord = { sessionId, lastActivityAt: new Date().toISOString() }
    await writeFile(join(dir, `${sessionId}.json`), `${JSON.stringify(record)}\n`, 'utf8')
    await sweepOldActivity(dir)
  } catch {
    // Unrecorded activity makes the window less informed, not the call wrong.
  }
}

/** Synchronous cleanup for a process `exit` handler, where promises never settle. */
export function clearMcpActivitySync(root: ProjectRoot, sessionId: string): void {
  try {
    rmSync(join(activityDir(root), `${sessionId}.json`), { force: true })
  } catch {
    // Left behind, it is ignored once its session stops heartbeating.
  }
}

/** Every activity record here. Callers decide which sessions are still alive. */
export async function readMcpActivity(root: ProjectRoot): Promise<McpActivityRecord[]> {
  let names: string[]
  try {
    names = await readdir(activityDir(root))
  } catch {
    return []
  }
  const records: McpActivityRecord[] = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    try {
      const parsed = JSON.parse(await readFile(join(activityDir(root), name), 'utf8')) as unknown
      if (isActivity(parsed)) records.push(parsed)
    } catch {
      // Unparseable is not evidence of anything.
    }
  }
  return records
}

function isActivity(value: unknown): value is McpActivityRecord {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<McpActivityRecord>
  return typeof candidate.sessionId === 'string' && typeof candidate.lastActivityAt === 'string'
}

async function sweepOldActivity(dir: string, now: number = Date.now()): Promise<void> {
  for (const name of await readdir(dir)) {
    const path = join(dir, name)
    try {
      if (now - (await stat(path)).mtimeMs > ACTIVITY_RETENTION_MS) await rm(path, { force: true })
    } catch {
      // Another process may have removed it first.
    }
  }
}
