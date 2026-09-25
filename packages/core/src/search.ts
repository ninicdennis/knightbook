import { readSearchableDocuments } from './document-search.js'
import type { Project } from './project.js'
import type { TicketType } from './schema.js'
import { listTicketRecords } from './tickets.js'

/**
 * Technical design section 9: simple text search, bounded, returning snippets by
 * default so an agent does not have to read every document to find the relevant
 * one. Embeddings are explicitly deferred until measured retrieval failures
 * justify them.
 */

const MAX_RESULTS = 25
const SNIPPET_RADIUS = 90

export interface SearchHit {
  readonly kind: 'document' | 'ticket'
  /** Project-relative path for a document, or the ticket's stable id. */
  readonly reference: string
  readonly title: string
  readonly snippet: string
  /** 1-indexed line the match was found on, or null for a title-only match. */
  readonly line: number | null
  /** A ticket's work type, when it has one. Documents have none. */
  readonly type?: TicketType
}

export interface SearchResult {
  readonly hits: SearchHit[]
  readonly truncated: boolean
  /** Paths that could not be read. Reported rather than silently skipped. */
  readonly unreadable: string[]
}

export async function searchProject(project: Project, query: string): Promise<SearchResult> {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return { hits: [], truncated: false, unreadable: [] }

  const hits: SearchHit[] = []
  const unreadable: string[] = []

  const { tickets, problems } = await listTicketRecords(project)
  // A ticket that cannot be read cannot be searched, and that is said, not skipped silently.
  unreadable.push(...problems.map((problem) => problem.file))

  for (const ticket of tickets) {
    const match = findMatch(ticket.body, needle)
    const inTitle = ticket.frontmatter.title.toLowerCase().includes(needle)
    if (!match && !inTitle) continue

    hits.push({
      kind: 'ticket',
      reference: ticket.frontmatter.id,
      title: ticket.frontmatter.title,
      snippet: match?.snippet ?? ticket.frontmatter.title,
      line: match?.line ?? null,
      ...(ticket.frontmatter.type ? { type: ticket.frontmatter.type } : {}),
    })
  }

  // The same scan the board's document search uses (document-search.ts), so the
  // two agree on which documents exist, are too large, or could not be read.
  const readable = await readSearchableDocuments(project)
  unreadable.push(...readable.unreadable)
  for (const document of readable.documents) {
    const inTitle = document.title.toLowerCase().includes(needle)
    const match = document.content === null ? null : findMatch(document.content, needle)
    if (!match && !inTitle) continue

    hits.push({
      kind: 'document',
      reference: document.path,
      title: document.title,
      snippet: match?.snippet ?? document.path,
      line: match?.line ?? null,
    })
  }

  return {
    hits: hits.slice(0, MAX_RESULTS),
    truncated: hits.length > MAX_RESULTS,
    unreadable,
  }
}

function findMatch(text: string, needle: string): { snippet: string; line: number } | null {
  const index = text.toLowerCase().indexOf(needle)
  if (index === -1) return null

  const start = Math.max(0, index - SNIPPET_RADIUS)
  const end = Math.min(text.length, index + needle.length + SNIPPET_RADIUS)
  const snippet = `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${
    end < text.length ? '…' : ''
  }`

  return { snippet, line: text.slice(0, index).split('\n').length }
}
