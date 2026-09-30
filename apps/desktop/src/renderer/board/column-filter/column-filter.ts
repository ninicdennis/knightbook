import type { ReviewState, TicketStatus, TicketType, TicketView } from '../../../shared/contract.js'

/**
 * What one board column is narrowed to (ticket 0addbe6b).
 *
 * Three independent groups. Within a group any ticked option matches; across
 * groups every group with something ticked must match. An empty group does not
 * narrow anything, so an empty filter is the unfiltered column.
 *
 * "State" here means the ticket's condition, not its status: the status is the
 * column itself.
 */

export type TypeOption = TicketType | 'untyped'

/**
 * Readiness only decides what can start next, so "waiting" and "ready" are
 * offered in Backlog only, matching the badges on the cards.
 */
export type ConditionOption = 'blocked' | 'waiting' | 'ready' | 'flagged'

export interface ColumnFilter {
  types: TypeOption[]
  conditions: ConditionOption[]
  review: ReviewState[]
}

export type ColumnFilters = Record<TicketStatus, ColumnFilter>

export const EMPTY_FILTER: ColumnFilter = { types: [], conditions: [], review: [] }

export const NO_FILTERS: ColumnFilters = {
  backlog: EMPTY_FILTER,
  in_progress: EMPTY_FILTER,
  verification: EMPTY_FILTER,
  done: EMPTY_FILTER,
}

export const TYPE_OPTIONS: TypeOption[] = [
  'feature',
  'bug',
  'research',
  'documentation',
  'task',
  'untyped',
]

export const REVIEW_OPTIONS: ReviewState[] = ['unreviewed', 'reviewed', 'changed_since_review']

export function conditionOptions(status: TicketStatus): ConditionOption[] {
  return status === 'backlog' ? ['blocked', 'waiting', 'ready', 'flagged'] : ['blocked', 'flagged']
}

export const CONDITION_LABEL: Record<ConditionOption, string> = {
  blocked: 'Blocked',
  waiting: 'Waiting on prerequisites',
  ready: 'Ready to start',
  flagged: 'Affected by a failed prerequisite',
}

export const REVIEW_LABEL: Record<ReviewState, string> = {
  unreviewed: 'Unreviewed',
  reviewed: 'Reviewed',
  changed_since_review: 'Changed since review',
}

export function isFiltered(filter: ColumnFilter): boolean {
  return filter.types.length + filter.conditions.length + filter.review.length > 0
}

/** Each condition read the way the card's badges read it, so a filter never disagrees with a card. */
function hasCondition(ticket: TicketView, condition: ConditionOption): boolean {
  switch (condition) {
    case 'blocked':
      return ticket.blocker !== null
    case 'waiting':
      return ticket.unmetPrerequisites.length > 0
    case 'ready':
      // What "next up" would accept: nothing holding it back and nothing failed upstream.
      return (
        ticket.dependencyReady &&
        ticket.blocker === null &&
        ticket.dependencyCycle === null &&
        ticket.affectedBy.length === 0
      )
    case 'flagged':
      return ticket.affectedBy.length > 0
  }
}

export function ticketMatchesColumnFilter(ticket: TicketView, filter: ColumnFilter): boolean {
  const type: TypeOption = ticket.type ?? 'untyped'
  if (filter.types.length > 0 && !filter.types.includes(type)) return false
  if (
    filter.conditions.length > 0 &&
    !filter.conditions.some((condition) => hasCondition(ticket, condition))
  ) {
    return false
  }
  if (filter.review.length > 0 && !filter.review.includes(ticket.review.state)) return false
  return true
}

/**
 * Reads a remembered value defensively: storage is outside the app's control,
 * so anything unrecognised is dropped rather than trusted.
 */
export function decodeColumnFilters(value: string | null): ColumnFilters {
  if (!value) return NO_FILTERS
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return NO_FILTERS
  }
  if (typeof parsed !== 'object' || parsed === null) return NO_FILTERS
  const record = parsed as Record<string, unknown>

  const decoded = { ...NO_FILTERS }
  for (const status of Object.keys(NO_FILTERS) as TicketStatus[]) {
    const column = record[status]
    if (typeof column !== 'object' || column === null) continue
    const fields = column as Record<string, unknown>
    decoded[status] = {
      types: pick(fields.types, TYPE_OPTIONS),
      conditions: pick(fields.conditions, conditionOptions(status)),
      review: pick(fields.review, REVIEW_OPTIONS),
    }
  }
  return decoded
}

function pick<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return []
  return allowed.filter((option) => value.includes(option))
}
