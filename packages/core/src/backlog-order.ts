import { ProjectError } from './errors.js'
import { setBacklogOrder, type Project } from './project.js'
import { listTicketRecords } from './tickets.js'

/**
 * Manual backlog order. Technical design section 5: `backlog_order` in the
 * manifest defines it, tickets absent from that list follow deterministically by
 * creation time and stable id, and reordering edits only the manifest.
 *
 * The same section requires duplicate and unknown entries to be reported rather
 * than deleted. That is why reordering merges instead of replacing: entries the
 * caller did not mention keep their place in the list, so an id whose ticket was
 * deleted by hand, or on another branch, survives a reorder and stays visible as
 * a problem to be resolved deliberately.
 */

export interface BacklogOrderReport {
  /** Ids the manifest lists more than once. Reported, never removed. */
  readonly duplicates: string[]
  /** Ids in the manifest with no ticket in this project. Reported, never removed. */
  readonly unknown: string[]
}

export function inspectBacklogOrder(
  order: readonly string[],
  knownTicketIds: ReadonlySet<string>,
): BacklogOrderReport {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  const unknown: string[] = []

  for (const id of order) {
    if (seen.has(id)) duplicates.add(id)
    seen.add(id)
    if (!knownTicketIds.has(id) && !unknown.includes(id)) unknown.push(id)
  }

  return { duplicates: [...duplicates], unknown }
}

/** Reads the current manifest order and says what is wrong with it, if anything. */
export async function backlogOrderReport(project: Project): Promise<BacklogOrderReport> {
  const { tickets } = await listTicketRecords(project)
  return inspectBacklogOrder(
    project.frontmatter.backlog_order,
    new Set(tickets.map((ticket) => ticket.frontmatter.id)),
  )
}

export interface ReorderResult {
  readonly project: Project
  /** What the manifest looks like after the write. */
  readonly report: BacklogOrderReport
  readonly order: string[]
}

/**
 * Places the given ids, in the given order, at the front of the manifest list.
 * Entries already in the manifest that the caller did not mention keep their
 * relative order behind them rather than being dropped.
 *
 * Writing an order that repeats a ticket is refused: it would create exactly the
 * kind of duplicate this module exists to report.
 */
export async function reorderBacklog(project: Project, order: string[]): Promise<ReorderResult> {
  const repeated = order.filter((id, index) => order.indexOf(id) !== index)
  if (repeated.length > 0) {
    throw new ProjectError(
      'invalid_record',
      `A backlog order cannot list the same ticket twice: ${[...new Set(repeated)].join(', ')}.`,
    )
  }

  const { tickets } = await listTicketRecords(project)
  const known = new Set(tickets.map((ticket) => ticket.frontmatter.id))

  const missing = order.filter((id) => !known.has(id))
  // Placing a ticket that does not exist is a mistake in the request, not a
  // pre-existing manifest problem to preserve.
  if (missing.length > 0) {
    throw new ProjectError('not_found', `No ticket in this project with id: ${missing.join(', ')}.`)
  }

  /*
   * Placing a ticket consumes one of its entries, not all of them. Filtering by
   * id would delete a pre-existing duplicate as a side effect of an unrelated
   * reorder, taking its warning with it — which is exactly what this module is
   * supposed to prevent. A manifest listing a ticket twice still lists it twice
   * afterwards, and is still reported.
   */
  const kept = [...project.frontmatter.backlog_order]
  for (const id of order) {
    const at = kept.indexOf(id)
    if (at !== -1) kept.splice(at, 1)
  }
  const next = [...order, ...kept]

  const written = await setBacklogOrder(project, next)
  return { project: written, report: inspectBacklogOrder(next, known), order: next }
}
