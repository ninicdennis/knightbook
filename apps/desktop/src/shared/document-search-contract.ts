import type { Result } from './contract.js'
import type { SearchHighlight } from './ticket-search-contract.js'

/**
 * Searching the workspace's included documents from the header search, beside
 * the ticket search. It is its own operation so tickets and documents each keep
 * their own limit and their own failure: a document that cannot be read must
 * not make the ticket results disappear, or the other way round.
 */

export interface DocumentSearchHitView {
  /** Project-relative, as the Documents view opens it. */
  path: string
  title: string
  /** Empty when only the content matched. */
  titleHighlights: SearchHighlight[]
  /** Context around the first content match, or null when only the title matched. */
  excerpt: string | null
  /** Offsets within `excerpt`, not within the document. */
  excerptHighlights: SearchHighlight[]
}

export interface DocumentSearchView {
  /** Echoed back so a late reply to an older question can be discarded. */
  checkoutPath: string
  query: string
  hits: DocumentSearchHitView[]
  /** Every matching document, including any beyond the returned hits. */
  totalMatches: number
  /** Project-relative paths of documents that could not be read, so were not searched. */
  unsearchable: string[]
}

export interface DocumentSearchApi {
  searchDocuments(rootPath: string, query: string): Promise<Result<DocumentSearchView>>
}
