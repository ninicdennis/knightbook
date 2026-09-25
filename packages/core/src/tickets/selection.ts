import { describeReason, evaluateReadiness, type IneligibilityReason } from './dependencies.js'
import type { Project } from '../records/project.js'
import { listTicketRecords, type Ticket, type TicketProblem } from './tickets.js'
import type { TicketFrontmatter } from '../records/schema.js'

/**
 * Next-ticket selection for product decision D-013. Technical design section 5:
 * the query returns the first eligible Backlog ticket in manual order. It does
 * not reserve or start anything, and eligibility is revalidated at the mutation
 * that moves it to In progress.
 */

export interface Candidate {
  readonly ticket: Ticket
  readonly reasons: IneligibilityReason[]
}

export interface SelectionResult {
  readonly next: Ticket | null
  /** Why each backlog ticket ahead of, or instead of, the answer is not eligible. */
  readonly ineligible: Candidate[]
  /** A sentence the agent can report when nothing is eligible. */
  readonly explanation: string
  /** Ticket files that could not be read. They are never chosen, and are reported. */
  readonly problems: TicketProblem[]
}

export async function selectNextTicket(project: Project): Promise<SelectionResult> {
  const { tickets, problems } = await listTicketRecords(project)
  const unreadable = new Set(problems.map((problem) => problem.id))
  const byId = new Map<string, TicketFrontmatter>(
    tickets.map((t) => [t.frontmatter.id, t.frontmatter]),
  )

  const ineligible: Candidate[] = []
  for (const ticket of tickets) {
    if (ticket.frontmatter.status !== 'backlog') continue
    /*
     * An archived ticket is off the board, so it is not work to pick up next.
     * It is skipped rather than listed as ineligible: the ineligible list
     * explains what is standing in the way of work the user can see, and
     * filling it with tickets they have deliberately put away would bury that.
     */
    if (ticket.frontmatter.archived) continue

    const readiness = evaluateReadiness(ticket.frontmatter, byId, unreadable)
    if (readiness.ready) {
      return { next: ticket, ineligible, explanation: '', problems }
    }
    ineligible.push({ ticket, reasons: readiness.reasons })
  }

  return { next: null, ineligible, explanation: explain(tickets, ineligible, problems), problems }
}

function explain(all: Ticket[], ineligible: Candidate[], problems: TicketProblem[]): string {
  const unreadable =
    problems.length === 0
      ? ''
      : `\n${problems.length} ticket file(s) could not be read and were skipped: ` +
        problems.map((problem) => problem.file).join(', ')

  if (all.length === 0) return `This project has no tickets yet.${unreadable}`
  if (ineligible.length === 0) {
    return `No ticket is in Backlog. Everything is in progress, awaiting verification, or done.${unreadable}`
  }
  const lines = ineligible.map(
    (c) => `- "${c.ticket.frontmatter.title}" ${c.reasons.map(describeReason).join('; ')}`,
  )
  return `No backlog ticket is eligible to start:\n${lines.join('\n')}${unreadable}`
}
