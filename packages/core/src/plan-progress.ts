import { isUnattributedCompletion } from './completion.js'
import type { PlanFrontmatter } from './schema.js'
import { TICKET_STATUSES, type TicketStatus } from './schema.js'
import type { TicketListing } from './tickets.js'

/**
 * Where a plan's work stands, read from the canonical tickets every time.
 *
 * Missing data must not look like progress. A reference to a ticket that does
 * not exist, or whose file cannot be read, still counts toward the total and
 * never as done, so a plan with a broken link can never read as complete. A
 * plan or phase with no tickets is `empty`, not finished.
 */

export type ProgressState = 'empty' | 'in_progress' | 'complete'

export interface Progress {
  /** Distinct tickets referenced, including ones that could not be found or read. */
  readonly total: number
  readonly byStatus: Record<TicketStatus, number>
  /** Done tickets whose completion has no trustworthy record; still counted as done. */
  readonly unattributedDone: number
  /** Referenced ids with no ticket file. */
  readonly missing: string[]
  /** Referenced ids whose file exists but could not be read as a ticket. */
  readonly unreadable: string[]
  readonly state: ProgressState
}

export interface PlanProgress extends Progress {
  readonly phases: Array<Progress & { readonly phaseId: string }>
}

function zeroCounts(): Record<TicketStatus, number> {
  return Object.fromEntries(TICKET_STATUSES.map((status) => [status, 0])) as Record<
    TicketStatus,
    number
  >
}

function measure(ids: Iterable<string>, listing: TicketListing): Progress {
  const byId = new Map(listing.tickets.map((ticket) => [ticket.frontmatter.id, ticket]))
  const broken = new Set(listing.problems.map((problem) => problem.id))
  const byStatus = zeroCounts()
  const missing: string[] = []
  const unreadable: string[] = []
  let unattributedDone = 0
  let total = 0

  for (const id of new Set(ids)) {
    total += 1
    const ticket = byId.get(id)
    if (ticket) {
      byStatus[ticket.frontmatter.status] += 1
      if (isUnattributedCompletion(ticket)) unattributedDone += 1
    } else if (broken.has(id)) {
      unreadable.push(id)
    } else {
      missing.push(id)
    }
  }

  const state: ProgressState =
    total === 0 ? 'empty' : byStatus.done === total ? 'complete' : 'in_progress'
  return { total, byStatus, unattributedDone, missing, unreadable, state }
}

/** Per phase, and for the plan as a whole with each ticket counted once. */
export function planProgress(plan: PlanFrontmatter, listing: TicketListing): PlanProgress {
  return {
    ...measure(
      plan.phases.flatMap((phase) => phase.tickets),
      listing,
    ),
    phases: plan.phases.map((phase) => ({ phaseId: phase.id, ...measure(phase.tickets, listing) })),
  }
}
