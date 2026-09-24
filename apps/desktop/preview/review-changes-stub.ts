import type {
  ChangedLineView,
  ChangeSectionView,
  Result,
  ReviewChangesView,
} from '../src/shared/contract.js'
import { SAMPLE_DOCUMENT } from './sample-document.js'

/**
 * Changes since review for the design preview. The real comparison runs in the
 * host with the core library, which cannot load in a browser, so this builds
 * the same shape from a long sample with a few known edits.
 *
 * Add ?changes=none|identical|large|unreadable|error to the preview URL to
 * review each of the other states.
 */

const FILLER = Array.from(
  { length: 40 },
  (_, index) => `Paragraph ${index + 1} of background notes that did not change since review.`,
)

const REVIEWED = SAMPLE_DOCUMENT.replace('owner: denny', 'owner: denny\nstatus: backlog').concat(
  '\n',
  FILLER.join('\n\n'),
  '\n',
)

const CURRENT = REVIEWED.replace('status: backlog', 'status: verification')
  .replace('owner: denny', 'owner: sam')
  .replace(
    '- Every prerequisite must reach `verification` or `done`.',
    '- Every prerequisite must reach `done`; verification alone no longer counts.',
  )
  .replace('Paragraph 30 of', 'Paragraph 30, rewritten, of')

/** Pairs lines one to one. Enough for edits that replace lines in place. */
function section(
  part: ChangeSectionView['part'],
  before: string[],
  after: string[],
  first: number,
) {
  const lines: ChangedLineView[] = []
  let added = 0
  let removed = 0
  before.forEach((text, index) => {
    const number = first + index
    const next = after[index] ?? ''
    if (text === next) {
      lines.push({
        kind: 'context',
        text,
        oldNumber: number,
        newNumber: number,
        bookkeeping: false,
      })
      return
    }
    const bookkeeping = part === 'metadata' && text.startsWith('status:')
    lines.push({ kind: 'removed', text, oldNumber: number, newNumber: null, bookkeeping })
    lines.push({ kind: 'added', text: next, oldNumber: null, newNumber: number, bookkeeping })
    added += 1
    removed += 1
  })
  return { part, lines, added, removed }
}

function changedView(): ReviewChangesView {
  const before = REVIEWED.trimEnd().split('\n')
  const after = CURRENT.trimEnd().split('\n')
  const bodyStart = before.indexOf('---', 1) + 1

  return {
    state: 'changed',
    reviewedAt: '2026-09-18T09:00:00Z',
    currentRevision: 'rev-doc',
    unreadableSnapshots: 0,
    substantive: true,
    sections: [
      section('metadata', before.slice(0, bodyStart), after.slice(0, bodyStart), 1),
      section('body', before.slice(bodyStart), after.slice(bodyStart), bodyStart + 1),
    ],
    notes: ['Line endings changed from LF to CRLF.'],
    tooLarge: null,
  }
}

export function stubReviewChanges(revision: string): Result<ReviewChangesView> {
  const variant = new URLSearchParams(window.location.search).get('changes')
  const base: ReviewChangesView = { ...changedView(), currentRevision: revision }

  switch (variant) {
    case 'error':
      return { ok: false, code: 'not_found', message: 'That file is no longer in the project.' }
    case 'none':
      return {
        ok: true,
        value: {
          ...base,
          state: 'no_baseline',
          reviewedAt: null,
          sections: [],
          notes: [],
          substantive: null,
        },
      }
    case 'identical':
      return { ok: true, value: { ...base, state: 'identical', sections: [], notes: [] } }
    case 'large':
      return {
        ok: true,
        value: {
          ...base,
          state: 'too_large',
          sections: [],
          notes: [],
          tooLarge:
            'One version is over 20,000 lines or 1,000,000 characters, so it was not compared line by line.',
        },
      }
    case 'unreadable':
      return { ok: true, value: { ...base, unreadableSnapshots: 2 } }
    default:
      return { ok: true, value: base }
  }
}
