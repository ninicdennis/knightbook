import type { Project } from './project.js'
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

/** Where a match sits in a string, so the caller can mark it up. */
export interface Highlight {
  readonly start: number
  readonly length: number
}

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
}

export interface TicketSearchResult {
  readonly hits: TicketSearchHit[]
  /** Every matching ticket, including any beyond the returned limit. */
  readonly totalMatches: number
  /** Ticket files that could not be read, so they could not be searched either. */
  readonly problems: TicketProblem[]
}

const EXCERPT_RADIUS = 90
/** A pathological query against a long body should not produce endless ranges. */
const MAX_HIGHLIGHTS = 20

/**
 * Collapses every run of whitespace to one space. Matching and display both use
 * the collapsed form, which is what keeps a highlight offset meaning the same
 * thing in both: normalizing after finding a match would shift every offset
 * after it.
 */
function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function occurrences(haystack: string, needle: string): Highlight[] {
  if (needle.length === 0) return []

  const found: Highlight[] = []
  const lower = haystack.toLowerCase()
  let from = 0
  while (found.length < MAX_HIGHLIGHTS) {
    const start = lower.indexOf(needle, from)
    if (start === -1) break
    found.push({ start, length: needle.length })
    from = start + needle.length
  }
  return found
}

/** Context around the first match, with an ellipsis wherever text was dropped. */
function excerptAround(body: string, needle: string): string | null {
  const index = body.toLowerCase().indexOf(needle)
  if (index === -1) return null

  const start = Math.max(0, index - EXCERPT_RADIUS)
  const end = Math.min(body.length, index + needle.length + EXCERPT_RADIUS)
  return `${start > 0 ? '…' : ''}${body.slice(start, end)}${end < body.length ? '…' : ''}`
}

export async function searchTickets(
  project: Project,
  query: string,
  options: { limit?: number } = {},
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

  for (const ticket of tickets) {
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
