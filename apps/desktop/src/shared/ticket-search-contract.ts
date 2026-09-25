import type { RecordProblemView, Result, TicketStatus, TicketType } from './contract.js'

/**
 * Which tickets a search looks at. Archived work stays findable, because keeping
 * the record is the point of archiving; it is just not what someone searching
 * the board usually means, so the scope is theirs to choose.
 */
export type SearchScope = 'active' | 'archived' | 'all'

/** Where a match sits in a string, so the view can mark it up without building markup. */
export interface SearchHighlight {
  start: number
  length: number
}

export interface TicketSearchHitView {
  id: string
  title: string
  status: TicketStatus
  type: TicketType | null
  /** Empty when only the body matched. */
  titleHighlights: SearchHighlight[]
  /** Context around the first body match, or null when only the title matched. */
  excerpt: string | null
  /** Offsets within `excerpt`, not within the ticket body. */
  excerptHighlights: SearchHighlight[]
  /** When it was archived, or null. Archived hits are labelled, never hidden. */
  archivedAt: string | null
}

export interface TicketSearchView {
  /**
   * The checkout and query this answers. Both are echoed back so a reply that
   * arrives after the user typed on, or switched project, can be discarded
   * rather than shown against the wrong question.
   */
  checkoutPath: string
  query: string
  hits: TicketSearchHitView[]
  /** Every matching ticket, including any beyond the returned hits. */
  totalMatches: number
  /** Ticket files that could not be read, so they could not be searched. */
  unsearchable: RecordProblemView[]
}

export interface TicketSearchApi {
  /** Bounded text search over ticket titles and bodies in one checkout. */
  searchTickets(
    rootPath: string,
    query: string,
    scope: SearchScope,
  ): Promise<Result<TicketSearchView>>
}
