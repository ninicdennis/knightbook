import { diffArrays } from 'diff'
import type { Project } from '../records/project.js'
import { BOOKKEEPING_FIELDS, unchangedSinceReview, type ReviewRecord } from './review.js'
import { readSnapshotHistory, type Snapshot } from './review-storage.js'
import { revisionOf, type Revision } from '../records/revision.js'

/**
 * What changed since the last human review, as a line comparison of the
 * reviewed source against the current one.
 *
 * This is the "compare against the retained snapshot" step that review status
 * points people to. It reads only: it never records a review, never touches the
 * record, and never changes what counts as a change for review status. That
 * classification stays in review.ts; this module only reports it alongside the
 * lines so the two cannot disagree about which edits matter.
 *
 * The baseline is the most recent valid snapshot, not Git HEAD or the previous
 * save. A record with no snapshot has no baseline, which is its own state: it is
 * never compared against an empty document.
 */

export type ChangesState = 'no_baseline' | 'identical' | 'changed' | 'too_large'

export interface ChangedLine {
  readonly kind: 'context' | 'added' | 'removed'
  readonly text: string
  /** Line number in the reviewed version; null for an added line. */
  readonly oldNumber: number | null
  /** Line number in the current version; null for a removed line. */
  readonly newNumber: number | null
  /** A changed frontmatter line under a lifecycle field review ignores, such as status. */
  readonly bookkeeping: boolean
}

export interface ChangeSection {
  /** Frontmatter and body are compared separately so metadata cannot hide in prose. */
  readonly part: 'metadata' | 'body'
  readonly lines: ChangedLine[]
  readonly added: number
  readonly removed: number
}

export interface SourceComparison {
  readonly state: Exclude<ChangesState, 'no_baseline'>
  readonly sections: ChangeSection[]
  /** Differences a line comparison cannot show, such as line endings. */
  readonly notes: string[]
  /** Why no line comparison was produced, when the state is `too_large`. */
  readonly tooLarge: string | null
}

export interface ReviewChanges extends Omit<SourceComparison, 'state'> {
  readonly state: ChangesState
  readonly lastReview: ReviewRecord | null
  /** The revision compared, so a later review can be tied to exactly this content. */
  readonly currentRevision: Revision
  /** Snapshot files that exist but could not be read. They are left untouched. */
  readonly unreadableSnapshots: number
  /**
   * Whether review status counts these edits, using its own rule. False when
   * only formatting or bookkeeping moved; null when that could not be decided.
   */
  readonly substantive: boolean | null
}

/*
 * Bounds on the work one comparison may do. A reviewed file is project content
 * and can be arbitrarily large or rewritten wholesale; past these, the view says
 * why it has no line comparison rather than freezing the host.
 */
const MAX_CHARACTERS = 1_000_000
const MAX_LINES = 20_000
const MAX_EDIT_LENGTH = 5_000
const TIMEOUT_MS = 1_500

const FRONTMATTER = /^---\n(?:[\s\S]*?\n)?---[^\S\n]*(?:\n|$)/
const FIELD_KEY = /^([^\s#:-][^:]*):/
const DELIMITER = /^---\s*$/

export async function reviewChanges(
  project: Project,
  recordId: string,
  currentSource: string,
): Promise<ReviewChanges> {
  const history = await readSnapshotHistory(project.root, recordId)
  const latest = history.snapshots.at(-1)
  const common = {
    lastReview: latest?.review ?? null,
    currentRevision: revisionOf(currentSource),
    unreadableSnapshots: history.unreadable,
  }

  if (!latest) {
    return {
      ...common,
      state: 'no_baseline',
      sections: [],
      notes: [],
      tooLarge: null,
      substantive: null,
    }
  }

  return {
    ...common,
    ...compareSources(latest.body, currentSource),
    substantive: countsForReview(latest, currentSource),
  }
}

/** The same test reviewStatus applies, so the two never disagree. */
function countsForReview(snapshot: Snapshot, currentSource: string): boolean | null {
  try {
    return !unchangedSinceReview(snapshot, currentSource)
  } catch {
    // Frontmatter that does not parse cannot be classified; say so, not "no".
    return null
  }
}

/** Pure line comparison of two sources. Exported for tests. */
export function compareSources(reviewed: string, current: string): SourceComparison {
  if (reviewed === current) {
    return { state: 'identical', sections: [], notes: [], tooLarge: null }
  }

  const notes = describeInvisibleChanges(reviewed, current)
  const before = splitParts(normalizeEndings(reviewed))
  const after = splitParts(normalizeEndings(current))

  const oversized = [reviewed, current].some((text) => text.length > MAX_CHARACTERS)
  const tooManyLines = [before, after].some(
    (parts) => parts.metadata.length + parts.body.length > MAX_LINES,
  )
  if (oversized || tooManyLines) {
    return {
      state: 'too_large',
      sections: [],
      notes,
      tooLarge:
        `One version is over ${MAX_LINES.toLocaleString('en')} lines or ` +
        `${MAX_CHARACTERS.toLocaleString('en')} characters, so it was not compared line by line.`,
    }
  }

  const metadata = compareLines('metadata', before.metadata, after.metadata, 1, 1)
  const body = compareLines(
    'body',
    before.body,
    after.body,
    before.metadata.length + 1,
    after.metadata.length + 1,
  )
  if (!metadata || !body) {
    return {
      state: 'too_large',
      sections: [],
      notes,
      tooLarge:
        'The two versions differ in too many places to compare line by line in reasonable time.',
    }
  }

  return {
    state: 'changed',
    sections: [metadata, body].filter((section) => section.lines.length > 0),
    notes,
    tooLarge: null,
  }
}

function normalizeEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

/** Line endings and the final newline are real byte changes a line view cannot show. */
function describeInvisibleChanges(reviewed: string, current: string): string[] {
  const notes: string[] = []
  const reviewedCrlf = reviewed.includes('\r\n')
  const currentCrlf = current.includes('\r\n')
  if (reviewedCrlf !== currentCrlf) {
    notes.push(
      `Line endings changed from ${reviewedCrlf ? 'CRLF' : 'LF'} to ${currentCrlf ? 'CRLF' : 'LF'}.`,
    )
  }

  const reviewedNewline = /\n$/.test(reviewed)
  const currentNewline = /\n$/.test(current)
  if (reviewedNewline !== currentNewline) {
    notes.push(
      currentNewline
        ? 'A newline was added at the end of the file.'
        : 'The newline at the end of the file was removed.',
    )
  }
  return notes
}

function splitParts(text: string): { metadata: string[]; body: string[] } {
  const frontmatter = FRONTMATTER.exec(text)?.[0] ?? ''
  return { metadata: toLines(frontmatter), body: toLines(text.slice(frontmatter.length)) }
}

/** One final newline ends the last line rather than starting an empty one. */
function toLines(text: string): string[] {
  if (text === '') return []
  return (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n')
}

/**
 * The frontmatter field each line belongs to. A continuation line (an indented
 * value or a list item) belongs to the field above it.
 */
function fieldOfEachLine(lines: string[]): (string | null)[] {
  let current: string | null = null
  return lines.map((line) => {
    if (DELIMITER.test(line)) {
      current = null
      return null
    }
    const key = FIELD_KEY.exec(line)?.[1]
    if (key !== undefined) current = key.trim()
    return current
  })
}

function compareLines(
  part: ChangeSection['part'],
  before: string[],
  after: string[],
  firstOld: number,
  firstNew: number,
): ChangeSection | null {
  const changes = diffArrays(before, after, {
    maxEditLength: MAX_EDIT_LENGTH,
    timeout: TIMEOUT_MS,
  })
  if (!changes) return null

  const isBookkeeping = (field: string | null | undefined): boolean =>
    part === 'metadata' && field != null && BOOKKEEPING_FIELDS.has(field)
  const beforeFields = fieldOfEachLine(before)
  const afterFields = fieldOfEachLine(after)

  const lines: ChangedLine[] = []
  let oldIndex = 0
  let newIndex = 0
  let added = 0
  let removed = 0
  for (const change of changes) {
    for (const text of change.value) {
      if (change.added) {
        lines.push({
          kind: 'added',
          text,
          oldNumber: null,
          newNumber: firstNew + newIndex,
          bookkeeping: isBookkeeping(afterFields[newIndex]),
        })
        newIndex += 1
        added += 1
      } else if (change.removed) {
        lines.push({
          kind: 'removed',
          text,
          oldNumber: firstOld + oldIndex,
          newNumber: null,
          bookkeeping: isBookkeeping(beforeFields[oldIndex]),
        })
        oldIndex += 1
        removed += 1
      } else {
        lines.push({
          kind: 'context',
          text,
          oldNumber: firstOld + oldIndex,
          newNumber: firstNew + newIndex,
          bookkeeping: false,
        })
        oldIndex += 1
        newIndex += 1
      }
    }
  }
  return { part, lines, added, removed }
}
