import {
  describeReason,
  evaluateReadiness,
  listTicketRecords,
  ProjectError,
  ticketReviewStatus,
  type Project,
  type Ticket,
  type TicketFrontmatter,
  type TicketListing,
} from '@projectspace/core'
import type { DependencyView, TicketDetailView, TicketView } from '../shared/contract.js'

/**
 * Turns core tickets into the plain shapes the renderer receives. Shared by the
 * board and the detail view so the two can never describe the same ticket
 * differently.
 */

const SATISFYING_STATUSES = new Set(['verification', 'done'])

/** What is known about the other tickets, including files that could not be read. */
export interface TicketLookup {
  readonly byId: ReadonlyMap<string, TicketFrontmatter>
  readonly unreadable: ReadonlySet<string>
}

export function buildLookup(listing: TicketListing): TicketLookup {
  return {
    byId: new Map(listing.tickets.map((t) => [t.frontmatter.id, t.frontmatter])),
    unreadable: new Set(listing.problems.map((problem) => problem.id)),
  }
}

export async function toTicketView(
  project: Project,
  ticket: Ticket,
  lookup: TicketLookup,
): Promise<TicketView> {
  const { frontmatter } = ticket
  const readiness = evaluateReadiness(frontmatter, lookup.byId, lookup.unreadable)
  const review = await ticketReviewStatus(project, frontmatter.id)

  return {
    id: frontmatter.id,
    title: frontmatter.title,
    status: frontmatter.status,
    revision: ticket.revision,
    dependsOn: frontmatter.depends_on,
    dependencyReady: readiness.ready,
    dependencyNotes: readiness.reasons.map(describeReason),
    blocker: frontmatter.blocker ?? null,
    completion: frontmatter.completion
      ? {
          decisionSource: frontmatter.completion.decision_source,
          recordedBy: frontmatter.completion.recorded_by,
          recordedAt: frontmatter.completion.recorded_at,
          instruction: frontmatter.completion.instruction,
        }
      : null,
    completionUnattributed: frontmatter.status === 'done' && frontmatter.completion === undefined,
    review: {
      state: review.state,
      lastReviewedAt: review.lastReview?.reviewedAt ?? null,
      changeSummary: review.changeSummary,
    },
  }
}

export async function toTicketDetail(project: Project, id: string): Promise<TicketDetailView> {
  const listing = await listTicketRecords(project)
  const lookup = buildLookup(listing)

  const ticket = listing.tickets.find((t) => t.frontmatter.id === id)
  if (!ticket) {
    const problem = listing.problems.find((p) => p.id === id)
    if (problem) {
      throw new ProjectError(
        'invalid_record',
        `${problem.file} could not be read: ${problem.reason}`,
      )
    }
    // A ticket can be deleted or renamed by an external tool between the board
    // loading and the user opening it, so this is an expected outcome.
    throw new ProjectError('not_found', 'That ticket no longer exists in this project.')
  }

  const dependencies: DependencyView[] = ticket.frontmatter.depends_on.map((dependencyId) => {
    const prerequisite = lookup.byId.get(dependencyId)
    return prerequisite
      ? {
          id: dependencyId,
          title: prerequisite.title,
          status: prerequisite.status,
          satisfied: SATISFYING_STATUSES.has(prerequisite.status),
          unreadable: false,
        }
      : {
          id: dependencyId,
          title: null,
          status: null,
          satisfied: false,
          unreadable: lookup.unreadable.has(dependencyId),
        }
  })

  return {
    ...(await toTicketView(project, ticket, lookup)),
    body: ticket.body,
    createdAt: ticket.frontmatter.created_at,
    updatedAt: ticket.frontmatter.updated_at,
    relatedDocuments: ticket.frontmatter.related_documents,
    dependencies,
  }
}
