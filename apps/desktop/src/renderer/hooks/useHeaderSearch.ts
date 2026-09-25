import { useEffect, useRef, useState } from 'react'
import type { Result, SearchScope, TicketSearchView } from '../../shared/contract.js'
import type { DocumentSearchView } from '../../shared/document-search-contract.js'

/**
 * The two questions the header search asks for each query: which tickets, and
 * which documents. They are asked together but answered separately, so one
 * failing leaves the other's results on screen and says which one failed.
 *
 * Documents are not asked about in the Archived scope: documents are never
 * archived, so that scope is about tickets only.
 */

/** Long enough to stop a burst of keystrokes, short enough to feel immediate. */
const DEBOUNCE_MS = 120

export interface SearchGroup<T> {
  view: T | null
  error: string | null
}

const EMPTY = { view: null, error: null }

interface Options {
  opened: boolean
  rootPath: string
  query: string
  scope: SearchScope
  /** Changes when the board is re-read, so an open search reflects the change. */
  refreshToken: number
}

/** Keeps an answer only if it is about this checkout and this query. */
function settle<T extends { checkoutPath: string; query: string }>(
  answer: Result<T> | null,
  rootPath: string,
  query: string,
): SearchGroup<T> | 'stale' {
  if (answer === null) return EMPTY
  if (!answer.ok) return { view: null, error: answer.message }
  if (answer.value.checkoutPath !== rootPath || answer.value.query !== query) return 'stale'
  return { view: answer.value, error: null }
}

export function useHeaderSearch({ opened, rootPath, query, scope, refreshToken }: Options) {
  const [tickets, setTickets] = useState<SearchGroup<TicketSearchView>>(EMPTY)
  const [documents, setDocuments] = useState<SearchGroup<DocumentSearchView>>(EMPTY)
  const [loading, setLoading] = useState(false)
  // Every request carries a number. Only the newest one is allowed to land, so
  // a slow reply for an earlier query cannot overwrite a later answer.
  const latest = useRef(0)

  useEffect(() => {
    const trimmed = query.trim()
    if (!opened || trimmed.length === 0) {
      latest.current += 1
      setTickets(EMPTY)
      setDocuments(EMPTY)
      setLoading(false)
      return
    }

    const sequence = (latest.current += 1)
    setLoading(true)
    const timer = setTimeout(() => {
      void Promise.all([
        window.knightbook.searchTickets(rootPath, trimmed, scope),
        scope === 'archived' ? null : window.knightbook.searchDocuments(rootPath, trimmed),
      ]).then(([ticketAnswer, documentAnswer]) => {
        if (sequence !== latest.current) return
        setLoading(false)
        const nextTickets = settle(ticketAnswer, rootPath, trimmed)
        const nextDocuments = settle(documentAnswer, rootPath, trimmed)
        if (nextTickets !== 'stale') setTickets(nextTickets)
        if (nextDocuments !== 'stale') setDocuments(nextDocuments)
      })
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
    // `scope` is a dependency: changing it asks a different question of the
    // same text, so the results have to be fetched again rather than filtered.
  }, [opened, query, rootPath, refreshToken, scope])

  return { tickets, documents, loading }
}
