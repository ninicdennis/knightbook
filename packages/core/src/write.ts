import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { ProjectError } from './errors.js'
import { assertRealPathInRoot, RESERVED_DIR, type ProjectRoot } from './paths.js'
import { revisionOf, type Revision } from './revision.js'

/**
 * The single write path from technical design section 8. Every desktop-host and
 * MCP mutation goes through here so the two processes cannot race each other
 * into a lost update.
 *
 * External editors and Git do not honor this lock. It coordinates our own two
 * processes; it is not a filesystem transaction, and the revision check is what
 * actually prevents overwriting someone else's newer content.
 */

const LOCK_TIMEOUT_MS = 5_000
const LOCK_RETRY_MS = 25
/** A lock older than this is treated as abandoned by a crashed process. */
const LOCK_STALE_MS = 30_000

export interface ReadResult {
  readonly content: string
  readonly revision: Revision
}

export interface WriteResult {
  readonly revision: Revision
}

function lockPath(root: ProjectRoot): string {
  // Kept inside the reserved folder but excluded from Git: it is coordination
  // state, not project content.
  return join(root.path, RESERVED_DIR, '.write-lock')
}

async function acquireLock(root: ProjectRoot): Promise<() => Promise<void>> {
  const path = lockPath(root)
  await mkdir(dirname(path), { recursive: true })
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  const token = `${process.pid}:${randomUUID()}`

  for (;;) {
    try {
      const handle = await open(path, 'wx')
      await handle.writeFile(`${token}\n${Date.now()}`, 'utf8')
      await handle.close()
      return async () => {
        await rm(path, { force: true })
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error

      const age = await lockAge(path)
      if (age !== null && age > LOCK_STALE_MS) {
        await rm(path, { force: true })
        continue
      }
      if (Date.now() > deadline) {
        throw new ProjectError(
          'locked',
          'Another Projectspace process is writing to this project. Try again.',
        )
      }
      await new Promise((r) => setTimeout(r, LOCK_RETRY_MS))
    }
  }
}

async function lockAge(path: string): Promise<number | null> {
  try {
    const [, written] = (await readFile(path, 'utf8')).split('\n')
    const at = Number(written)
    return Number.isFinite(at) ? Date.now() - at : null
  } catch {
    return null
  }
}

export async function readRecord(root: ProjectRoot, absolutePath: string): Promise<ReadResult> {
  await assertRealPathInRoot(root, absolutePath)
  try {
    const content = await readFile(absolutePath, 'utf8')
    return { content, revision: revisionOf(content) }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ProjectError('not_found', `No such record: ${absolutePath}`)
    }
    throw error
  }
}

export interface WriteOptions {
  /** Revision the caller last read. Omit only when creating. */
  readonly expectedRevision?: Revision
  /** True for create operations: the path must not already exist. */
  readonly mustNotExist?: boolean
}

/**
 * Re-reads under the lock, compares the exact revision, then replaces the file
 * through a temporary file in the same directory so a failure cannot truncate
 * the original.
 */
export async function writeRecord(
  root: ProjectRoot,
  absolutePath: string,
  content: string,
  options: WriteOptions = {},
): Promise<WriteResult> {
  await assertRealPathInRoot(root, absolutePath)
  const release = await acquireLock(root)
  try {
    const current = await currentRevision(absolutePath)

    if (options.mustNotExist && current !== null) {
      throw new ProjectError('already_exists', `Record already exists: ${absolutePath}`)
    }
    if (!options.mustNotExist) {
      if (current === null) {
        throw new ProjectError('not_found', `No such record: ${absolutePath}`)
      }
      if (options.expectedRevision === undefined) {
        throw new ProjectError('revision_conflict', 'A write to an existing record needs expectedRevision', current)
      }
      if (options.expectedRevision !== current) {
        throw new ProjectError(
          'revision_conflict',
          'The record changed since it was read. Re-read it and reapply the change.',
          current,
        )
      }
    }

    await mkdir(dirname(absolutePath), { recursive: true })
    const temporary = `${absolutePath}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`
    try {
      await writeFile(temporary, content, 'utf8')
      await rename(temporary, absolutePath)
    } catch (error) {
      await rm(temporary, { force: true })
      throw error
    }

    return { revision: revisionOf(content) }
  } finally {
    await release()
  }
}

async function currentRevision(absolutePath: string): Promise<Revision | null> {
  try {
    return revisionOf(await readFile(absolutePath, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}
