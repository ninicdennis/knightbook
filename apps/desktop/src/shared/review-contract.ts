/**
 * What the window is told about human review: a record's review state, and the
 * comparison of its current source against the last reviewed one. Part of the
 * renderer contract in contract.ts, which re-exports it.
 *
 * Nothing here records a review. Showing changes is read-only; the only way to
 * record one is the user's own review operation, which takes the revision they
 * were shown so it cannot approve edits made after that.
 */

import type { Result } from './contract.js'

export type ReviewState = 'unreviewed' | 'reviewed' | 'changed_since_review'

export interface ReviewView {
  state: ReviewState
  lastReviewedAt: string | null
  /** Present only when review is stale; says what the comparison established. */
  changeSummary: string | null
}

export interface ChangedLineView {
  kind: 'context' | 'added' | 'removed'
  /** The source line exactly as written. Always rendered as text, never as HTML. */
  text: string
  /** Line number in the reviewed version; null for an added line. */
  oldNumber: number | null
  /** Line number in the current version; null for a removed line. */
  newNumber: number | null
  /** A changed frontmatter line under a lifecycle field review ignores, such as status. */
  bookkeeping: boolean
}

export interface ChangeSectionView {
  part: 'metadata' | 'body'
  lines: ChangedLineView[]
  added: number
  removed: number
}

export interface ReviewChangesView {
  /**
   * `no_baseline` means there is no readable review to compare against. It is
   * never shown as a comparison against an empty document.
   */
  state: 'no_baseline' | 'identical' | 'changed' | 'too_large'
  /** When the baseline was reviewed, or null when there is none. */
  reviewedAt: string | null
  /** The exact revision compared. A review from this view must name it. */
  currentRevision: string
  /** Snapshot files that exist but could not be read. They are left untouched. */
  unreadableSnapshots: number
  /** Whether review status counts these edits; null when it could not be decided. */
  substantive: boolean | null
  sections: ChangeSectionView[]
  /** Byte changes a line view cannot show, such as line endings. */
  notes: string[]
  /** Why there is no line comparison, when the state is `too_large`. */
  tooLarge: string | null
}

export interface ReviewChangesApi {
  /** The current document against its last human review. Reads only. */
  documentChanges(rootPath: string, path: string): Promise<Result<ReviewChangesView>>
  /** The current ticket file against its last human review. Reads only. */
  ticketChanges(rootPath: string, id: string): Promise<Result<ReviewChangesView>>
}
