import { useCallback, useEffect, useRef } from 'react'
import type { Screen } from '../projects/screen.js'
import { dropPlace, stepIndex, type History, type Place } from './navigation-history.js'

interface Options {
  screen: Screen
  history: History
  /** Shows the given history's current place. */
  show: (history: History) => void
  /** Replaces the history without showing anything new. */
  keep: (history: History) => void
  onNotice: (message: string) => void
}

/**
 * Back and Forward. Before showing a place it checks the place is still there:
 * a ticket that was deleted, or archived after it was opened, or a document that is gone or
 * no longer included, is reported, dropped from history and stepped over. It
 * never reopens stale content, and never includes or changes anything.
 */
export function useHistorySteps({ screen, history, show, keep, onNotice }: Options) {
  // Read inside the async step, which must see the latest values, not the ones it started with.
  const latest = useRef({ screen, history })
  useEffect(() => {
    latest.current = { screen, history }
  }, [screen, history])
  const stepping = useRef(false)

  const staleReason = useCallback(async (place: Place): Promise<string | null> => {
    const { screen: now } = latest.current
    if (now.kind !== 'open') return 'The project is not open.'

    if (place.ticket) {
      const { id } = place.ticket
      const archived = now.project.archivedTickets.find((ticket) => ticket.id === id)
      // Only archiving since the ticket was opened makes the place stale.
      if (archived && !place.ticket.archived) return `"${archived.title}" has been archived.`
      if (!archived && !now.project.tickets.some((ticket) => ticket.id === id)) {
        return 'A ticket there no longer exists.'
      }
    }

    if (place.view === 'documents' && place.document) {
      const result = await window.knightbook.resolveLink(now.path, place.document.path)
      if (!result.ok) return `${place.document.path} could not be checked: ${result.message}`
      if (result.value.kind === 'unavailable') return result.value.message
      if (result.value.kind !== 'document') return `${place.document.path} is not a document now.`
    }
    return null
  }, [])

  const step = useCallback(
    async (direction: -1 | 1) => {
      if (stepping.current) return
      stepping.current = true
      try {
        const started = latest.current.history
        let history = started
        const skipped: string[] = []
        let arrived = false
        for (
          let at = stepIndex(history, direction);
          at !== null;
          at = stepIndex(history, direction)
        ) {
          const reason = await staleReason(history.entries[at] as Place)
          // The user moved on while the check ran; their move wins.
          if (latest.current.history !== started) return
          if (reason === null) {
            show({ ...history, index: at })
            arrived = true
            break
          }
          skipped.push(reason)
          history = dropPlace(history, at)
        }
        if (skipped.length === 0) return
        // Nothing valid that way: stay put, but forget the stale places.
        if (!arrived) keep(history)
        const count = skipped.length === 1 ? 'a place' : `${skipped.length} places`
        onNotice(`Skipped ${count} in history. ${skipped.join(' ')}`)
      } finally {
        stepping.current = false
      }
    },
    [staleReason, show, keep, onNotice],
  )

  const goBack = useCallback(() => void step(-1), [step])
  const goForward = useCallback(() => void step(1), [step])

  return {
    canGoBack: stepIndex(history, -1) !== null,
    canGoForward: stepIndex(history, 1) !== null,
    goBack,
    goForward,
  }
}
