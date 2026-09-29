import { useEffect, useState } from 'react'
import type { TicketDetailView, TicketView } from '../../shared/contract.js'

/**
 * A fresh read of one ticket for its detail view. It re-reads whenever the board
 * says the ticket changed, including a review recorded from the dialog itself.
 */
export function useTicketDetail(rootPath: string, ticket: TicketView) {
  const [detail, setDetail] = useState<TicketDetailView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const version = `${ticket.revision}|${ticket.review.state}|${ticket.review.lastReviewedAt ?? ''}`

  useEffect(() => {
    let cancelled = false
    setError(null)
    void window.knightbook.readTicket(rootPath, ticket.id).then((result) => {
      if (cancelled) return
      if (result.ok) setDetail(result.value)
      else {
        setDetail(null)
        setError(result.message)
      }
    })
    return () => {
      cancelled = true
    }
  }, [rootPath, ticket.id, version])

  return { detail, error }
}
