import { readdir, readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import { ProjectError } from '../records/errors.js'
import { parseRecord } from '../records/frontmatter.js'
import { RESERVED_DIR, type ProjectRoot } from '../records/paths.js'
import type { ReviewRecord } from './review.js'

/**
 * Where review snapshots live on disk.
 *
 * Review history is part of the project's own files, so a person reading the
 * repository should be able to find the history of one ticket or one document
 * without decoding anything. Snapshots are therefore written under
 * `reviews/tickets/<ticket id>/` and `reviews/documents/<the document's own
 * path>/`, as real nested folders.
 *
 * An earlier layout put every record in one flat folder named after a
 * percent-encoded record id (`reviews/ticket%3A...`, `reviews/document%3Adocs%2F...`).
 * Those folders are still read, never moved, renamed or rewritten: a project
 * that has history from before this change keeps it, and opening a project
 * still writes nothing at all.
 */

const REVIEWS_DIR = 'reviews'
const TICKET_PREFIX = 'ticket:'
const DOCUMENT_PREFIX = 'document:'

/** A ticket id has to be one plain folder name; it is a UUID in practice. */
const PLAIN_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

function refuse(recordId: string, why: string): never {
  throw new ProjectError(
    'invalid_record',
    `Cannot store review history for ${JSON.stringify(recordId)}: ${why}`,
  )
}

/**
 * The folder segments under `reviews/` for a record. Every segment is checked
 * here rather than trusted, because a record id reaches this from a stored file
 * and is untrusted input like any other path.
 */
function segmentsFor(recordId: string): string[] {
  if (recordId.startsWith(TICKET_PREFIX)) {
    const id = recordId.slice(TICKET_PREFIX.length)
    if (!PLAIN_SEGMENT.test(id)) {
      refuse(recordId, 'a ticket id must be a single plain folder name')
    }
    return ['tickets', id]
  }

  if (recordId.startsWith(DOCUMENT_PREFIX)) {
    const path = recordId.slice(DOCUMENT_PREFIX.length)
    if (path === '' || isAbsolute(path)) {
      refuse(recordId, 'a document path must be relative to the project')
    }

    const segments = path.split('/')
    for (const segment of segments) {
      if (segment === '' || segment === '.' || segment === '..' || segment.includes('\\')) {
        refuse(recordId, `${JSON.stringify(segment)} is not a usable folder name`)
      }
    }
    return ['documents', ...segments]
  }

  refuse(recordId, 'it names neither a ticket nor a document')
}

/**
 * The folder new snapshots are written to. It is not created here: section 8
 * writes the snapshot itself first, and merely reading review status must not
 * leave folders behind.
 */
export function snapshotWriteDir(root: ProjectRoot, recordId: string): string {
  const segments = segmentsFor(recordId)
  const kindDir = join(root.path, RESERVED_DIR, REVIEWS_DIR, segments[0]!)
  const directory = join(kindDir, ...segments.slice(1))

  // Belt and braces over the per-segment checks: whatever the segments were,
  // the result has to stay under the folder for its kind.
  const back = relative(kindDir, directory)
  if (back === '' || back.startsWith('..') || isAbsolute(back)) {
    refuse(recordId, `it resolves outside ${REVIEWS_DIR}/${segments[0]}/`)
  }
  return directory
}

/** The legacy flat folder, named after the percent-encoded record id. */
function legacyDir(root: ProjectRoot, recordId: string): string {
  return join(root.path, RESERVED_DIR, REVIEWS_DIR, encodeURIComponent(recordId))
}

export interface Snapshot {
  readonly review: ReviewRecord
  /** The reviewed content itself, retained in full inside the snapshot. */
  readonly body: string
  /** Sorted on when the two layouts hold snapshots with the same timestamp. */
  readonly file: string
}

/**
 * Snapshots read for one record, plus how many snapshot files could not be. The
 * count is kept so a comparison can say history exists but is unreadable,
 * rather than presenting that record as if it had never been reviewed.
 */
export interface SnapshotHistory {
  readonly snapshots: Snapshot[]
  readonly unreadable: number
}

async function readFrom(directory: string, into: Snapshot[]): Promise<number> {
  let files: string[]
  try {
    files = await readdir(directory)
  } catch {
    return 0
  }

  let unreadable = 0
  for (const file of files.filter((name) => name.endsWith('.md')).sort()) {
    try {
      const record = parseRecord(await readFile(join(directory, file), 'utf8'))
      const reviewedAt = record.data.get('reviewed_at')
      const reviewedRevision = record.data.get('reviewed_revision')
      const fingerprint = record.data.get('content_fingerprint')
      const note = record.data.get('note')
      if (typeof reviewedAt !== 'string' || typeof reviewedRevision !== 'string') {
        unreadable += 1
        continue
      }

      into.push({
        review: {
          reviewedAt,
          reviewedRevision,
          contentFingerprint: typeof fingerprint === 'string' ? fingerprint : '',
          note: typeof note === 'string' ? note : '',
        },
        body: record.body,
        file,
      })
    } catch {
      // An unreadable snapshot is skipped, never deleted or repaired.
      unreadable += 1
    }
  }
  return unreadable
}

/**
 * Every valid snapshot for a record, oldest first, across both layouts. Ordering
 * is by the recorded review time rather than by folder, so a review taken before
 * this change and one taken after it compare correctly.
 */
export async function readSnapshots(root: ProjectRoot, recordId: string): Promise<Snapshot[]> {
  return (await readSnapshotHistory(root, recordId)).snapshots
}

/** As readSnapshots, also counting the snapshot files that could not be read. */
export async function readSnapshotHistory(
  root: ProjectRoot,
  recordId: string,
): Promise<SnapshotHistory> {
  const snapshots: Snapshot[] = []
  const unreadable =
    (await readFrom(snapshotWriteDir(root, recordId), snapshots)) +
    (await readFrom(legacyDir(root, recordId), snapshots))

  snapshots.sort((a, b) => {
    if (a.review.reviewedAt !== b.review.reviewedAt) {
      return a.review.reviewedAt < b.review.reviewedAt ? -1 : 1
    }
    return a.file < b.file ? -1 : a.file > b.file ? 1 : 0
  })
  return { snapshots, unreadable }
}

/** Project-relative, for messages and tests. Always uses forward slashes. */
export function snapshotWritePath(root: ProjectRoot, recordId: string): string {
  return relative(root.path, snapshotWriteDir(root, recordId)).split(sep).join('/')
}
