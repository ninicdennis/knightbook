import type { TicketStatus } from '../records/schema.js'
import { isArchived } from '../tickets/archive.js'
import { isUnattributedCompletion } from '../tickets/completion.js'
import type { TicketListing } from '../tickets/tickets.js'

/**
 * A routine's runs and completions, read from the tickets that point at it
 * (D-051). Nothing here is stored: a run counts as completed only while its
 * ticket is Done with an acceptance some write path recorded, so a run in
 * Verification, a reopened one, or a Done ticket with no recorded decision is
 * never shown as completed.
 */

export interface RoutineRun {
  readonly id: string
  readonly title: string
  readonly status: TicketStatus
  readonly archived: boolean
  readonly createdAt: string
  /** When the user's acceptance was recorded, or null when the run is not accepted. */
  readonly acceptedAt: string | null
  /** Done with no trustworthy acceptance: shown as it is, never as completed. */
  readonly completionUnattributed: boolean
}

export interface RoutineHistory {
  /** Every run, newest first. */
  readonly runs: RoutineRun[]
  /** Runs still on the board and not Done, newest first. These block an accidental second start. */
  readonly openRuns: RoutineRun[]
  /** Accepted runs, most recently accepted first. */
  readonly completions: RoutineRun[]
  readonly lastCompletedAt: string | null
  /**
   * Ticket files that could not be read. Any of them might be a run, so a
   * history beside a non-zero count may be missing runs and should say so.
   */
  readonly unreadableTickets: number
}

export function routineHistory(routineId: string, listing: TicketListing): RoutineHistory {
  const runs: RoutineRun[] = listing.tickets
    .filter((ticket) => ticket.frontmatter.routine?.id === routineId)
    .map((ticket) => {
      const unattributed = isUnattributedCompletion(ticket)
      const accepted =
        ticket.frontmatter.status === 'done' && !unattributed ? ticket.frontmatter.completion : null
      return {
        id: ticket.frontmatter.id,
        title: ticket.frontmatter.title,
        status: ticket.frontmatter.status,
        archived: isArchived(ticket),
        createdAt: ticket.frontmatter.created_at,
        acceptedAt: accepted?.recorded_at ?? null,
        completionUnattributed: unattributed,
      }
    })
    .sort((a, b) => newestFirst(a.createdAt, b.createdAt) || a.id.localeCompare(b.id))

  const completions = runs
    .filter((run) => run.acceptedAt !== null)
    .sort((a, b) => newestFirst(a.acceptedAt!, b.acceptedAt!))

  return {
    runs,
    openRuns: runs.filter((run) => run.status !== 'done' && !run.archived),
    completions,
    lastCompletedAt: completions[0]?.acceptedAt ?? null,
    unreadableTickets: listing.problems.length,
  }
}

function newestFirst(a: string, b: string): number {
  return a === b ? 0 : a < b ? 1 : -1
}
