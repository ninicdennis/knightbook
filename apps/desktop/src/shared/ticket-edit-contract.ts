import type { ProjectView, Result } from './contract.js'

/** A ticket's title and Markdown body, as the user edits them. Frontmatter is never part of it. */
export interface TicketContentEdit {
  title: string
  body: string
}

/** A ticket's prerequisites (ticket ids) and related documents (project-relative paths). */
export interface TicketLinksEdit {
  dependsOn: string[]
  relatedDocuments: string[]
}

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

  /**
   * Replaces the ticket's title and body. Nothing is written when both match
   * what the file already holds, line endings aside, so opening the editor and
   * saving unchanged text leaves the file and its review state alone.
   */
  editTicketContent(
    rootPath: string,
    id: string,
    content: TicketContentEdit,
    revision: string,
  ): Promise<Result<ProjectView>>

  /**
   * Replaces both lists. A prerequisite that is the ticket itself, unknown, or
   * leads back to the ticket is refused as `invalid_dependency` (D-032), the
   * same check MCP's ticket_update makes.
   */
  setTicketLinks(
    rootPath: string,
    id: string,
    links: TicketLinksEdit,
    revision: string,
  ): Promise<Result<ProjectView>>
}
