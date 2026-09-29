import { useEffect, useRef } from 'react'

/*
 * Closing hands focus back to the card this ticket was opened from, whichever
 * way it was opened: clicking a card leaves focus on the document body, and a
 * result opened from search belongs to a dialog that has already closed, so
 * the modal's own focus return has nothing useful to give back. The card's own
 * control is a real target in both cases. Done here rather than left to
 * Mantine so the behaviour is the same however the dialog closes.
 */
export function useReturnFocusToCard(ticketId: string): void {
  /** Whatever had focus when the dialog opened, as a fallback for closing. */
  const returnTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const opener = document.activeElement
    returnTo.current = opener instanceof HTMLElement ? opener : null

    return () => {
      const card = document.querySelector<HTMLElement>(`[data-ticket-handle="${ticketId}"]`)
      const target = card ?? returnTo.current
      if (target?.isConnected) target.focus()
    }
  }, [ticketId])
}
