import { describe, expect, it } from 'vitest'
import { ticket } from '../../test/test-fixtures.js'
import {
  decodeColumnFilters,
  EMPTY_FILTER,
  NO_FILTERS,
  ticketMatchesColumnFilter,
  type ColumnFilter,
} from './column-filter.js'

const filter = (overrides: Partial<ColumnFilter>): ColumnFilter => ({
  ...EMPTY_FILTER,
  ...overrides,
})

describe('matching a column filter', () => {
  it('matches everything when nothing is ticked', () => {
    expect(ticketMatchesColumnFilter(ticket({ type: 'bug' }), EMPTY_FILTER)).toBe(true)
  })

  it('matches any ticked type, and treats untyped as its own option', () => {
    const bugsOrUntyped = filter({ types: ['bug', 'untyped'] })
    expect(ticketMatchesColumnFilter(ticket({ type: 'bug' }), bugsOrUntyped)).toBe(true)
    expect(ticketMatchesColumnFilter(ticket({ type: null }), bugsOrUntyped)).toBe(true)
    expect(ticketMatchesColumnFilter(ticket({ type: 'feature' }), bugsOrUntyped)).toBe(false)
    expect(
      ticketMatchesColumnFilter(ticket({ type: 'research' }), filter({ types: ['research'] })),
    ).toBe(true)
  })

  it('reads each condition the way the card badges do', () => {
    const blocked = ticket({ blocker: 'Waiting on legal', dependencyReady: false })
    const waiting = ticket({ unmetPrerequisites: ['waiting on X'], dependencyReady: false })
    const flagged = ticket({
      affectedBy: [{ ticketId: 'x', title: 'X', issue: 'Broke', direct: true }],
    })
    const ready = ticket()
    const cycle = ticket({ dependencyCycle: 'A → B → A', dependencyReady: false })

    const only = (condition: ColumnFilter['conditions'][number]) =>
      [blocked, waiting, flagged, ready, cycle].map((t) =>
        ticketMatchesColumnFilter(t, filter({ conditions: [condition] })),
      )

    expect(only('blocked')).toEqual([true, false, false, false, false])
    expect(only('waiting')).toEqual([false, true, false, false, false])
    expect(only('flagged')).toEqual([false, false, true, false, false])
    // Flagged work is dependency-ready but must not read as ready to start.
    expect(only('ready')).toEqual([false, false, false, true, false])
  })

  it('never calls a blocked ticket or one in a cycle ready, whatever dependencyReady says', () => {
    const ready = filter({ conditions: ['ready'] })
    expect(ticketMatchesColumnFilter(ticket({ blocker: 'Stuck' }), ready)).toBe(false)
    expect(ticketMatchesColumnFilter(ticket({ dependencyCycle: 'A → B → A' }), ready)).toBe(false)
  })

  it('matches review state', () => {
    const stale = ticket({
      review: { state: 'changed_since_review', lastReviewedAt: null, changeSummary: null },
    })
    expect(ticketMatchesColumnFilter(stale, filter({ review: ['changed_since_review'] }))).toBe(
      true,
    )
    expect(ticketMatchesColumnFilter(stale, filter({ review: ['unreviewed'] }))).toBe(false)
    const reviewed = ticket({
      review: { state: 'reviewed', lastReviewedAt: '2026-09-30', changeSummary: null },
    })
    expect(ticketMatchesColumnFilter(reviewed, filter({ review: ['reviewed'] }))).toBe(true)
  })

  it('requires every group that has something ticked', () => {
    const blockedBug = ticket({ type: 'bug', blocker: 'Stuck' })
    expect(
      ticketMatchesColumnFilter(blockedBug, filter({ types: ['bug'], conditions: ['blocked'] })),
    ).toBe(true)
    expect(
      ticketMatchesColumnFilter(blockedBug, filter({ types: ['bug'], review: ['reviewed'] })),
    ).toBe(false)
  })
})

describe('reading remembered filters', () => {
  it('falls back to no filters for anything unreadable', () => {
    expect(decodeColumnFilters(null)).toEqual(NO_FILTERS)
    expect(decodeColumnFilters('not json')).toEqual(NO_FILTERS)
    expect(decodeColumnFilters('42')).toEqual(NO_FILTERS)
  })

  it('keeps known options and drops the rest', () => {
    const decoded = decodeColumnFilters(
      JSON.stringify({
        backlog: { types: ['bug', 'epic'], conditions: ['ready'], review: 'reviewed' },
        // Readiness is a Backlog concept; it is not offered, or kept, elsewhere.
        done: { conditions: ['ready', 'blocked'] },
        nonsense: { types: ['bug'] },
      }),
    )
    expect(decoded.backlog).toEqual({ types: ['bug'], conditions: ['ready'], review: [] })
    expect(decoded.done).toEqual({ types: [], conditions: ['blocked'], review: [] })
    expect(decoded.in_progress).toEqual(EMPTY_FILTER)
  })
})
