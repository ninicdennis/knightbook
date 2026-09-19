import { describeReason, evaluateReadiness, type IneligibilityReason } from './dependencies.js'
import type { Project } from './project.js'
import { listTickets, type Ticket } from './tickets.js'
import type { TicketFrontmatter } from './schema.js'

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
}

export async function selectNextTicket(project: Project): Promise<SelectionResult> {
  const tickets = await listTickets(project)
  const byId = new Map<string, TicketFrontmatter>(
    tickets.map((t) => [t.frontmatter.id, t.frontmatter]),
  )

  const ineligible: Candidate[] = []
  for (const ticket of tickets) {
    if (ticket.frontmatter.status !== 'backlog') continue

    const readiness = evaluateReadiness(ticket.frontmatter, byId)
    if (readiness.ready) {
      return { next: ticket, ineligible, explanation: '' }
    }
    ineligible.push({ ticket, reasons: readiness.reasons })
  }

  return { next: null, ineligible, explanation: explain(tickets, ineligible) }
}

function explain(all: Ticket[], ineligible: Candidate[]): string {
  if (all.length === 0) return 'This project has no tickets yet.'
  if (ineligible.length === 0) {
    return 'No ticket is in Backlog. Everything is in progress, awaiting verification, or done.'
  }
  const lines = ineligible.map(
    (c) => `- "${c.ticket.frontmatter.title}" ${c.reasons.map(describeReason).join('; ')}`,
  )
  return `No backlog ticket is eligible to start:\n${lines.join('\n')}`
}
