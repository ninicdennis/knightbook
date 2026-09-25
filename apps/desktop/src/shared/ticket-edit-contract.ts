import type { ProjectView, Result } from './contract.js'

/**
 * Edits the user makes to a ticket's own fields from its detail view. Each one
 * carries the revision the window read, so an edit made on stale content is
 * refused as a conflict rather than written over someone else's change.
 */
export interface TicketEditApi {
  /**
   * Records why the ticket cannot move, or clears that with null. Text that is
   * only whitespace clears it too, so no ticket is left holding an empty blocker.
   */
  setTicketBlocker(
    rootPath: string,
    id: string,
    blocker: string | null,
    revision: string,
  ): Promise<Result<ProjectView>>
}
