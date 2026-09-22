import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ProjectError } from './errors.js'
import { parseRecord } from './frontmatter.js'
import { reservedPaths, resolveInRoot, toProjectRelative } from './paths.js'
import type { Project } from './project.js'
import { readSnapshots, snapshotWriteDir } from './review-storage.js'
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
 * Reduces Markdown to the parts whose change is meaningful, dropping the parts
 * that are only representation. Section 7 is explicit that this can identify
 * formatting equivalence but cannot reliably tell a typo fix from a change of
 * intent, so an unclassified change is surfaced rather than decided.
 */
export function contentFingerprint(source: string): string {
  const record = parseRecord(source)

  // Frontmatter that only tracks lifecycle does not invalidate a review of the
  // work the ticket describes.
  // `archived` belongs here for the same reason as `status`: taking a ticket
  // off the board says nothing about the work its text describes, so it must
  // not raise "changed since review" and cost a real review its evidence.
  const bookkeeping = new Set([
    'status',
    'updated_at',
    'created_at',
    'completion',
    'blocker',
    'archived',
  ])
  const substantive: Record<string, unknown> = {}
  const data = record.data.toJS() as Record<string, unknown> | null
  for (const [key, value] of Object.entries(data ?? {})) {
    if (!bookkeeping.has(key)) substantive[key] = value
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
 * Writes a self-contained snapshot. Section 8: the snapshot is written first and
 * the latest review is derived from valid snapshots, so no atomic pointer update
 * elsewhere is needed.
 */
export async function recordReview(
  project: Project,
  recordId: string,
  source: string,
  options: { note?: string } = {},
): Promise<ReviewRecord> {
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
  const review = await lastReview(project, recordId)
  if (!review) {
    return { state: 'unreviewed', lastReview: null, changeSummary: null }
  }

  const currentRevision = revisionOf(currentSource)
  if (currentRevision === review.reviewedRevision) {
    return { state: 'reviewed', lastReview: review, changeSummary: null }
  }

  if (contentFingerprint(currentSource) === review.contentFingerprint) {
    // Bytes moved but nothing substantive did: reformatting, or a status change.
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
): Promise<ReviewRecord> {
  assertHumanReviewer(reviewer)
  const source = await readFile(reservedPaths.ticketFile(project.root, ticketId), 'utf8')
  return await recordReview(project, ticketRecordId(ticketId), source, { note })
}
