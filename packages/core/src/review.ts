import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ProjectError } from './errors.js'
import { parseRecord } from './frontmatter.js'
import { reservedPaths, resolveInRoot, toProjectRelative } from './paths.js'
import type { Project } from './project.js'
import { readSnapshots, snapshotWriteDir, type Snapshot } from './review-storage.js'
import { revisionOf, type Revision } from './revision.js'
import { writeRecord } from './write.js'

/**
 * Human review, per decisions D-003, D-004 and D-016.
 *
 * Review is informational: nothing here blocks implementation, and a ticket can
 * be worked on and completed while its content is unreviewed. What it does
 * provide is an honest answer to "has a person actually read this?", which
 * matters most for content an AI generated while documenting an existing
 * application.
 *
 * Technical design section 7 asks for two separate comparisons. The raw revision
 * in write.ts detects stale writes on exact bytes. This module does the other
 * one: comparing structured content against the last reviewed snapshot, so that
 * reformatting does not invalidate a review but a changed acceptance criterion
 * does.
 */

export type ReviewState = 'unreviewed' | 'reviewed' | 'changed_since_review'

export interface ReviewRecord {
  readonly reviewedAt: string
  /** The raw revision of the content at the moment it was reviewed. */
  readonly reviewedRevision: Revision
  /** Fingerprint of the structured content, used to classify later edits. */
  readonly contentFingerprint: string
  readonly note: string
}

export interface ReviewStatus {
  readonly state: ReviewState
  /** The most recent review, retained even when content changed after it. */
  readonly lastReview: ReviewRecord | null
  /**
   * Set when the state is `changed_since_review`. Says what the comparison could
   * establish, which is never the same as knowing whether the meaning changed.
   */
  readonly changeSummary: string | null
}

/**
 * Frontmatter that only tracks lifecycle does not invalidate a review of the
 * work the ticket describes. The changes view uses the same list to label those
 * lines, so what it calls bookkeeping is exactly what review ignores.
 *
 * `archived` belongs here for the same reason as `status`: taking a ticket off
 * the board says nothing about the work its text describes, so it must not raise
 * "changed since review" and cost a real review its evidence.
 */
export const BOOKKEEPING_FIELDS: ReadonlySet<string> = new Set([
  'status',
  'updated_at',
  'created_at',
  'completion',
  'blocker',
  'archived',
])

/**
 * Reduces Markdown to the parts whose change is meaningful, dropping the parts
 * that are only representation. Section 7 is explicit that this can identify
 * formatting equivalence but cannot reliably tell a typo fix from a change of
 * intent, so an unclassified change is surfaced rather than decided.
 */
export function contentFingerprint(source: string): string {
  const record = parseRecord(normalizeLineEndings(source))

  const substantive: Record<string, unknown> = {}
  const data = record.data.toJS() as Record<string, unknown> | null
  for (const [key, value] of Object.entries(data ?? {})) {
    if (!BOOKKEEPING_FIELDS.has(key)) substantive[key] = value
  }

  const normalizedBody = record.body
    // Collapse runs of whitespace, but keep block boundaries: a merged paragraph
    // is a real change, and losing that distinction would hide one.
    .split(/\n{2,}/)
    .map((block) =>
      block
        .replace(/[ \t]+/g, ' ')
        .replace(/\s*\n\s*/g, '\n')
        .trim(),
    )
    .filter((block) => block.length > 0)
    .join('\n\n')

  return revisionOf(
    `${JSON.stringify(substantive, Object.keys(substantive).sort())}\n${normalizedBody}`,
  )
}

/**
 * Line endings are representation, not content (decision D-025). Git for Windows
 * rewrites committed files to CRLF on checkout by default, so a record reviewed
 * as LF can come back as CRLF with nobody having edited it.
 */
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

/**
 * Whether current content still counts as the reviewed content. Review status
 * and the changes view both ask this, so they cannot disagree.
 *
 * The stored revision stays byte-exact because it is also what ties a review to
 * the exact bytes a person saw. The comparison here is looser: it accepts the
 * same content in either line ending, then falls back to the fingerprint. The
 * fingerprint is recomputed from the retained snapshot as well as read from it,
 * because snapshots recorded before D-025 stored one computed over CRLF bytes,
 * which no LF version of the same content can match.
 */
export function unchangedSinceReview(snapshot: Snapshot, currentSource: string): boolean {
  if (revisionOf(currentSource) === snapshot.review.reviewedRevision) return true

  const current = normalizeLineEndings(currentSource)
  if (revisionOf(current) === snapshot.review.reviewedRevision) return true
  if (normalizeLineEndings(snapshot.body) === current) return true

  const fingerprint = contentFingerprint(current)
  return (
    fingerprint === snapshot.review.contentFingerprint ||
    fingerprint === contentFingerprint(snapshot.body)
  )
}

/**
 * Writes a self-contained snapshot. Section 8: the snapshot is written first and
 * the latest review is derived from valid snapshots, so no atomic pointer update
 * elsewhere is needed.
 */
export async function recordReview(
  project: Project,
  recordId: string,
  source: string,
  options: { note?: string; expectedRevision?: Revision } = {},
): Promise<ReviewRecord> {
  assertShownRevision(source, options.expectedRevision)
  const now = new Date().toISOString()
  const review: ReviewRecord = {
    reviewedAt: now,
    reviewedRevision: revisionOf(source),
    contentFingerprint: contentFingerprint(source),
    note: options.note?.trim() ?? '',
  }

  const directory = snapshotWriteDir(project.root, recordId)
  await mkdir(directory, { recursive: true })
  const path = join(directory, `${now.replace(/[:.]/g, '-')}.md`)

  const snapshot = [
    '---',
    'schema_version: 1',
    `record_id: ${JSON.stringify(recordId)}`,
    `reviewed_at: ${review.reviewedAt}`,
    `reviewed_revision: ${review.reviewedRevision}`,
    `content_fingerprint: ${review.contentFingerprint}`,
    `note: ${JSON.stringify(review.note)}`,
    '---',
    '',
    source,
  ].join('\n')

  await writeRecord(project.root, path, snapshot, { mustNotExist: true })
  return review
}

/**
 * A review records the content as it is on disk when the user confirms. When
 * the caller says which revision the user was looking at, content that changed
 * since then is refused, so a review can never approve edits nobody saw.
 */
function assertShownRevision(source: string, expectedRevision: Revision | undefined): void {
  if (expectedRevision === undefined) return
  const current = revisionOf(source)
  if (current !== expectedRevision) {
    throw new ProjectError(
      'revision_conflict',
      'The content changed after it was shown to you, so the review was not recorded. ' +
        'Reload it and review what is there now.',
      current,
    )
  }
}

/**
 * The most recent valid snapshot, across both storage layouts. Invalid ones are
 * skipped, not deleted.
 */
export async function lastReview(project: Project, recordId: string): Promise<ReviewRecord | null> {
  return (await readSnapshots(project.root, recordId)).at(-1)?.review ?? null
}

/**
 * Classifies current content against the last review. The three states are
 * deliberately distinct: content that was never reviewed must not look the same
 * as content whose review is now stale.
 */
export async function reviewStatus(
  project: Project,
  recordId: string,
  currentSource: string,
): Promise<ReviewStatus> {
  const snapshot = (await readSnapshots(project.root, recordId)).at(-1)
  if (!snapshot) {
    return { state: 'unreviewed', lastReview: null, changeSummary: null }
  }

  const review = snapshot.review
  if (unchangedSinceReview(snapshot, currentSource)) {
    // Bytes may have moved, but nothing substantive did: line endings,
    // reformatting, or a status change.
    return { state: 'reviewed', lastReview: review, changeSummary: null }
  }

  return {
    state: 'changed_since_review',
    lastReview: review,
    changeSummary:
      'The content changed in a way that is not only formatting or status. ' +
      'Whether the meaning changed has not been determined; compare against the ' +
      'retained snapshot to decide.',
  }
}

/** Retrieves the reviewed source for comparison, from whichever layout holds it. */
export async function reviewedSource(project: Project, recordId: string): Promise<string | null> {
  return (await readSnapshots(project.root, recordId)).at(-1)?.body ?? null
}

/** An AI must never record human validation of its own content (D-003). */
export function assertHumanReviewer(reviewer: 'user' | 'agent'): void {
  if (reviewer !== 'user') {
    throw new ProjectError(
      'invalid_transition',
      'Only the user can mark content as human-reviewed. An AI tool cannot validate its own output.',
    )
  }
}

/**
 * The id a document's review snapshots are stored under. Validating the path
 * first means a traversal attempt cannot reach a snapshot directory outside the
 * project, and normalizing separators keeps the id stable across platforms.
 */
export function documentRecordId(project: Project, path: string): string {
  const absolute = resolveInRoot(project.root, path)
  return `document:${toProjectRelative(project.root, absolute)}`
}

export function ticketRecordId(id: string): string {
  return `ticket:${id}`
}

/**
 * Convenience wrappers so callers do not have to know that review compares the
 * file as written. Both the desktop host and the MCP surface use these, which
 * keeps them from computing the fingerprint over different inputs.
 */
export async function ticketReviewStatus(
  project: Project,
  ticketId: string,
): Promise<ReviewStatus> {
  const source = await readFile(reservedPaths.ticketFile(project.root, ticketId), 'utf8')
  return await reviewStatus(project, ticketRecordId(ticketId), source)
}

/** Records a human review of a ticket. `reviewer` must be the user (D-003). */
export async function recordTicketReview(
  project: Project,
  ticketId: string,
  reviewer: 'user' | 'agent',
  note = '',
  expectedRevision?: Revision,
): Promise<ReviewRecord> {
  assertHumanReviewer(reviewer)
  const source = await readFile(reservedPaths.ticketFile(project.root, ticketId), 'utf8')
  return await recordReview(project, ticketRecordId(ticketId), source, {
    note,
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  })
}
