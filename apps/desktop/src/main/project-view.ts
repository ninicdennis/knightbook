import {
  backlogOrderReport,
  listTicketRecords,
  readTicket,
  selectNextTicket,
  type Project,
} from '@knightbook/core'
import { buildLookup, toTicketView } from './ticket-view.js'
import type { ProjectView } from '../shared/contract.js'

/**
 * The whole board as the window draws it, rebuilt after every change so a
 * handler never returns a partial or stale picture.
 */

export async function buildView(project: Project): Promise<ProjectView> {
  const listing = await listTicketRecords(project)
  const lookup = buildLookup(listing)
  const next = await selectNextTicket(project)

  const views = []
  const archived = []
  for (const ticket of listing.tickets) {
    const view = await toTicketView(project, ticket, lookup)
    // Split once, here, so no column, count or suggestion downstream has to
    // remember that archived tickets exist.
    if (view.archivedAt) archived.push(view)
    else views.push(view)
  }
  // Most recently archived first: the archive is read newest-first, unlike the
  // board, whose order is the one the user arranged.
  archived.sort((a, b) => (a.archivedAt! < b.archivedAt! ? 1 : -1))

  const order = await backlogOrderReport(project)
  return {
    name: project.frontmatter.name,
    checkoutPath: project.root.path,
    tickets: views,
    archivedTickets: archived,
    problems: listing.problems.map(({ file, reason }) => ({ file, reason })),
    nextTicketId: next.next?.frontmatter.id ?? null,
    nextExplanation: next.explanation,
    backlogOrderProblems: { duplicates: order.duplicates, unknown: order.unknown },
  }
}

/**
 * The ticket's title for a message about it, falling back to its id when the
 * record cannot be read. A failure report is for a person, and an id alone does
 * not tell them which ticket did not move.
 */
export async function titleOf(project: Project, id: string): Promise<string> {
  try {
    return (await readTicket(project, id)).frontmatter.title
  } catch {
    return id
  }
}
