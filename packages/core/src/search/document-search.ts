import { readFile } from 'node:fs/promises'
import { listIncludedDocuments } from '../documents/documents.js'
import { resolveInRoot } from '../records/paths.js'
import type { Project } from '../records/project.js'
import { collapse, excerptAround, occurrences, type Highlight } from './search-text.js'

/**
 * Searching the workspace's included documents. The scan is shared: MCP's
 * `project_search` (search.ts) and the board's search both read documents
 * through `readSearchableDocuments`, so they agree on which documents exist,
 * which are too large to scan, and which could not be read. Only the shape of
 * a hit differs: an agent gets a snippet and a line, a person gets highlights.
 *
 * Documents have their own limit rather than sharing one with tickets, for the
 * same reason ticket-search.ts gives: one budget would silently drop results.
 */

export const DOCUMENT_SEARCH_LIMIT = 20
/** Documents larger than this are searched by title only, to bound the work. */
const MAX_SCANNED_BYTES = 512 * 1024

export interface SearchableDocument {
  readonly path: string
  readonly title: string
  /** Null when the file is too large to scan; its title is still searched. */
  readonly content: string | null
}

export async function readSearchableDocuments(
  project: Project,
): Promise<{ documents: SearchableDocument[]; unreadable: string[] }> {
  const { documents: included } = await listIncludedDocuments(project)
  const documents: SearchableDocument[] = []
  const unreadable: string[] = []

  for (const document of included) {
    let content: string
    try {
      content = await readFile(resolveInRoot(project.root, document.path), 'utf8')
    } catch {
      unreadable.push(document.path)
      continue
    }
    documents.push({
      path: document.path,
      title: document.title,
      content: content.length > MAX_SCANNED_BYTES ? null : content,
    })
  }
  return { documents, unreadable }
}

export interface DocumentSearchHit {
  readonly path: string
  readonly title: string
  /** Empty when only the content matched. */
  readonly titleHighlights: Highlight[]
  /** Context around the first content match, or null when only the title matched. */
  readonly excerpt: string | null
  /** Offsets within `excerpt`, not within the document. */
  readonly excerptHighlights: Highlight[]
}

export interface DocumentSearchResult {
  readonly hits: DocumentSearchHit[]
  /** Every matching document, including any beyond the returned limit. */
  readonly totalMatches: number
  /** Documents that could not be read, so they could not be searched either. */
  readonly unreadable: string[]
}

export async function searchDocuments(
  project: Project,
  query: string,
  options: { limit?: number } = {},
): Promise<DocumentSearchResult> {
  const needle = collapse(query).toLowerCase()
  if (needle.length === 0) return { hits: [], totalMatches: 0, unreadable: [] }

  const { documents, unreadable } = await readSearchableDocuments(project)

  // Title matches first, then content-only ones, each in workspace order, as
  // the ticket search does: a deterministic order without a relevance score.
  const titleMatches: DocumentSearchHit[] = []
  const contentMatches: DocumentSearchHit[] = []
  for (const document of documents) {
    const titleHighlights = occurrences(collapse(document.title), needle)
    const excerpt =
      document.content === null ? null : excerptAround(collapse(document.content), needle)
    if (titleHighlights.length === 0 && excerpt === null) continue

    const hit: DocumentSearchHit = {
      path: document.path,
      title: document.title,
      titleHighlights,
      excerpt,
      excerptHighlights: excerpt === null ? [] : occurrences(excerpt, needle),
    }
    ;(titleHighlights.length > 0 ? titleMatches : contentMatches).push(hit)
  }

  const ordered = [...titleMatches, ...contentMatches]
  return {
    hits: ordered.slice(0, options.limit ?? DOCUMENT_SEARCH_LIMIT),
    totalMatches: ordered.length,
    unreadable,
  }
}
