import {
  describeReason,
  evaluateReadiness,
  failedPrerequisites,
  isUnattributedCompletion,
  listTicketRecords,
  type Project,
  type Ticket,
  type TicketFrontmatter,
  type TicketProblem,
} from '@knightbook/core'

/**
 * How a ticket is described to an AI, shared by every tool that returns one.
 * Kept in one place so a field added here reaches ticket_list, ticket_read and
 * ticket_next alike.
 */

/** Every ticket that loaded, plus the files that did not, indexed for readiness checks. */
export interface TicketIndex {
  readonly tickets: Ticket[]
  readonly problems: TicketProblem[]
  readonly byId: ReadonlyMap<string, TicketFrontmatter>
  readonly unreadable: ReadonlySet<string>
}

export async function indexTickets(project: Project): Promise<TicketIndex> {
  const { tickets, problems } = await listTicketRecords(project)
  return {
    tickets,
    problems,
    byId: new Map(tickets.map((t) => [t.frontmatter.id, t.frontmatter])),
    unreadable: new Set(problems.map((problem) => problem.id)),
  }
}

export function summarize(ticket: Ticket, index: TicketIndex) {
  const readiness = evaluateReadiness(ticket.frontmatter, index.byId, index.unreadable)
  return {
    id: ticket.frontmatter.id,
    title: ticket.frontmatter.title,
    status: ticket.frontmatter.status,
    /**
     * Archiving takes a ticket off the working board without changing where the
     * work stands, so `status` above is still its real status and is what
     * restoring puts it back to. Null means active.
     */
    archived: ticket.frontmatter.archived?.archived_at ?? null,
    /** Optional work type. Null means untyped, which is not a kind of work. */
    type: ticket.frontmatter.type ?? null,
    revision: ticket.revision,
    /**
     * The routine this ticket is a run of, or null. A run is an ordinary ticket;
     * read the routine with routine_read.
     */
    routine_id: ticket.frontmatter.routine?.id ?? null,
    depends_on: ticket.frontmatter.depends_on,
    /** Project-relative paths of the documents this ticket points at; read them with document_read. */
    related_documents: ticket.frontmatter.related_documents,
    dependency_ready: readiness.ready,
    dependency_notes: readiness.reasons.map(describeReason),
    /** D-017: this ticket's own failed verification, kept on its own record. */
    verification_issue: ticket.frontmatter.verification_issue ?? null,
    /**
     * D-017: prerequisites that failed verification, derived on every read. A
     * non-empty list means this ticket is affected work; its status has not been
     * changed, and deciding what to rework is the user's call.
     */
    affected_by: failedPrerequisites(ticket.frontmatter, index.byId).map((failed) => ({
      ticket_id: failed.ticketId,
      title: failed.title,
      issue: failed.issue,
      direct: failed.direct,
    })),
    /**
     * Section 6: a Done status with no provenance is shown, not silently
     * trusted. Only a Done ticket has a current acceptance — a record that
     * carries one beside another status was edited outside these operations,
     * and repeating its claim would present the work as accepted when the board
     * says it is not. A block no write path could have produced is withheld for
     * the same reason, and the app does the same.
     */
    completion:
      ticket.frontmatter.status === 'done' && !isUnattributedCompletion(ticket)
        ? (ticket.frontmatter.completion ?? null)
        : null,
    completion_unattributed: isUnattributedCompletion(ticket),
    /**
     * Acceptances taken back by moving the ticket out of Done, oldest first.
     * History: it says a decision was made and when it stopped applying. Do not
     * describe a ticket as accepted because this is non-empty.
     */
    previous_completions: ticket.frontmatter.previous_completions ?? [],
  }
}
