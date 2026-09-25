import type { Project } from './project.js'
import { collapse, excerptAround, occurrences, type Highlight } from './search-text.js'
import type { TicketStatus, TicketType } from './schema.js'
import { listTicketRecords, type TicketProblem } from './tickets.js'

/**
 * Ticket-only search for the board's own search surface.
 *
 * This is deliberately separate from `searchProject`, which mixes tickets and
 * documents for an agent asking "where is this in the project". A ticket search
 * has to be able to show every matching ticket within its own limit, so sharing
 * one budget with documents would silently drop tickets the user was looking
 * for.
 *
 * Technical design section 9: simple, bounded text matching. No fuzzy or
 * semantic matching here — a person typing into a board search expects the
 * results to contain what they typed.
 */

export const TICKET_SEARCH_LIMIT = 20

export type { Highlight }

export interface TicketSearchHit {
  readonly id: string
  readonly title: string
  readonly status: TicketStatus
  /** Null for a ticket written before types existed, or one left untyped. */
  readonly type: TicketType | null
  /** Empty when only the body matched. */
  readonly titleHighlights: Highlight[]
  /** Context around the first body match, or null when only the title matched. */
  readonly excerpt: string | null
  /** Offsets within `excerpt`, not within the body. */
  readonly excerptHighlights: Highlight[]
  /** When it was archived, or null. `status` stays its real status either way. */
  readonly archivedAt: string | null
}

/**
 * Which tickets a search looks at. Archived tickets stay findable — the point of
 * archiving is to keep the record — but they are not what someone searching the
 * board usually means, so the caller says which it wants rather than getting a
 * mix it did not ask for.
 */
export type SearchScope = 'active' | 'archived' | 'all'

export interface TicketSearchResult {
  readonly hits: TicketSearchHit[]
  /** Every matching ticket, including any beyond the returned limit. */
  readonly totalMatches: number
  /** Ticket files that could not be read, so they could not be searched either. */
  readonly problems: TicketProblem[]
}

export async function searchTickets(
  project: Project,
  query: string,
  options: { limit?: number; scope?: SearchScope } = {},
): Promise<TicketSearchResult> {
  const needle = collapse(query).toLowerCase()
  // An empty query means "nothing yet", not "everything".
  if (needle.length === 0) return { hits: [], totalMatches: 0, problems: [] }

  const limit = options.limit ?? TICKET_SEARCH_LIMIT
  const { tickets, problems } = await listTicketRecords(project)

  // Two passes so a title match always outranks a body-only one, while inside
  // each group the board's own order decides. That makes the result order
  // deterministic without inventing a relevance score.
  const titleMatches: TicketSearchHit[] = []
  const bodyMatches: TicketSearchHit[] = []

  const scope = options.scope ?? 'active'
  for (const ticket of tickets) {
    const archivedAt = ticket.frontmatter.archived?.archived_at ?? null
    if (scope === 'active' && archivedAt) continue
    if (scope === 'archived' && !archivedAt) continue

    const title = ticket.frontmatter.title
    const titleHighlights = occurrences(collapse(title), needle)
    const excerpt = excerptAround(collapse(ticket.body), needle)
    if (titleHighlights.length === 0 && excerpt === null) continue

    const hit: TicketSearchHit = {
      id: ticket.frontmatter.id,
      title,
      status: ticket.frontmatter.status,
      type: ticket.frontmatter.type ?? null,
      titleHighlights,
      excerpt,
      excerptHighlights: excerpt === null ? [] : occurrences(excerpt, needle),
      archivedAt,
    }
    ;(titleHighlights.length > 0 ? titleMatches : bodyMatches).push(hit)
  }

  const ordered = [...titleMatches, ...bodyMatches]
  return {
    hits: ordered.slice(0, limit),
    totalMatches: ordered.length,
    problems,
  }
}
