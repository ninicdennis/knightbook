import type { ProjectView, SearchHighlight, TicketSearchView } from '../src/shared/contract.js'

/**
 * A stand-in for the host's ticket search, so the real search dialog can be
 * reviewed in a browser. It matches the same way the core does — plain,
 * case-insensitive substring matching returning offsets rather than markup —
 * over the preview's ticket titles and one shared body.
 */

const BODY =
  'Intended outcome. Clicking a card opens a modal showing everything written on ' +
  'the ticket. Acceptance criteria: click or Enter opens the modal, a drag does ' +
  'not; dependencies show the status of each prerequisite. Notes: found by the ' +
  'user while trying the app. A <script>alert(1)</script> tag, to show what the ' +
  'search does with text it did not write.'

function occurrences(haystack: string, needle: string): SearchHighlight[] {
  const found: SearchHighlight[] = []
  const lower = haystack.toLowerCase()
  let from = 0
  while (found.length < 20) {
    const start = lower.indexOf(needle, from)
    if (start === -1) break
    found.push({ start, length: needle.length })
    from = start + needle.length
  }
  return found
}

/** The same window the core takes around the first match, so the preview is honest. */
function excerptAround(body: string, needle: string): string | null {
  const index = body.toLowerCase().indexOf(needle)
  if (index === -1) return null

  const start = Math.max(0, index - 90)
  const end = Math.min(body.length, index + needle.length + 90)
  return `${start > 0 ? '…' : ''}${body.slice(start, end)}${end < body.length ? '…' : ''}`
}

export function stubTicketSearch(
  project: ProjectView,
  checkoutPath: string,
  query: string,
): TicketSearchView {
  const needle = query.trim().replace(/\s+/g, ' ').toLowerCase()
  const empty = { checkoutPath, query, hits: [], totalMatches: 0, unsearchable: [] }
  if (needle.length === 0) return empty

  const titleHits: TicketSearchView['hits'] = []
  const bodyHits: TicketSearchView['hits'] = []

  for (const ticket of project.tickets) {
    const titleHighlights = occurrences(ticket.title, needle)
    const excerpt = excerptAround(BODY, needle)
    if (titleHighlights.length === 0 && excerpt === null) continue

    const hit = {
      id: ticket.id,
      title: ticket.title,
      status: ticket.status,
      titleHighlights,
      excerpt,
      excerptHighlights: excerpt ? occurrences(excerpt, needle) : [],
    }
    ;(titleHighlights.length > 0 ? titleHits : bodyHits).push(hit)
  }

  const ordered = [...titleHits, ...bodyHits]
  return {
    checkoutPath,
    query,
    hits: ordered.slice(0, 20),
    totalMatches: ordered.length,
    // Add ?problems to the preview URL to see an unsearchable ticket reported.
    unsearchable: new URLSearchParams(window.location.search).has('problems')
      ? [
          {
            file: '.projectspace/tickets/3f2a9c1e.md',
            reason: 'Unresolved merge conflict markers.',
          },
        ]
      : [],
  }
}
