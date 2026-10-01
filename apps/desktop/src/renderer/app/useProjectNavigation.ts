import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScrollTarget } from '../markdown/useLinkNavigation.js'
import type { View } from './ProjectHeader.js'
import type { Screen } from '../projects/screen.js'
import {
  BOARD,
  currentPlace,
  pushPlace,
  replacePlace,
  startHistory,
  type History,
  type Place,
} from '../history/navigation-history.js'
import { useHistorySteps } from '../history/useHistorySteps.js'

/**
 * Where the user is inside an open project: which view, and which ticket,
 * document or plan is open, kept as a history of places so Back and Forward
 * can walk it (ticket 855c3054). Every move below is a step; the targets carry
 * a nonce so opening the same document or plan twice still moves the view.
 *
 * History is session state for one open project. It is cleared when a
 * different project opens and is never written anywhere.
 */
export function useProjectNavigation(
  screen: Screen,
  load: (path: string) => Promise<void>,
  onNotice: (message: string) => void,
) {
  const [history, setHistory] = useState<History>(() => startHistory())
  const place = currentPlace(history)
  /** A heading the open ticket should show, when a link named one. */
  const [detailScroll, setDetailScroll] = useState<ScrollTarget | null>(null)
  const [documentTarget, setDocumentTarget] = useState<{
    path: string
    nonce: number
    scrollTo: ScrollTarget | null
  } | null>(null)
  const [planTarget, setPlanTarget] = useState<{ id: string; nonce: number } | null>(null)

  const go = useCallback(
    (next: (current: Place) => Place) => setHistory((h) => pushPlace(h, next(currentPlace(h)))),
    [],
  )

  // A different project starts with no history. A refresh of the same one keeps it.
  const openPath = screen.kind === 'open' ? screen.path : null
  const lastOpenPath = useRef<string | null>(null)
  useEffect(() => {
    if (openPath === null || openPath === lastOpenPath.current) return
    lastOpenPath.current = openPath
    setHistory(startHistory())
    setDocumentTarget(null)
    setPlanTarget(null)
  }, [openPath])

  const setView = useCallback(
    (view: View) => go((current) => (current.view === view ? current : { ...BOARD, view })),
    [go],
  )

  // Read when a ticket opens, to note whether it was already archived then.
  const latestScreen = useRef(screen)
  useEffect(() => {
    latestScreen.current = screen
  }, [screen])

  const openTicket = useCallback(
    (id: string, scrollTo: ScrollTarget | null = null) => {
      const now = latestScreen.current
      const archived =
        now.kind === 'open' && now.project.archivedTickets.some((ticket) => ticket.id === id)
      go((current) => ({
        ...current,
        ticket: { id, fragment: scrollTo?.fragment ?? null, archived },
      }))
      setDetailScroll(scrollTo)
    },
    [go],
  )
  const closeTicket = useCallback(() => go((current) => ({ ...current, ticket: null })), [go])

  const detailId = place.ticket?.id ?? null
  /*
   * Both lists: an archived ticket is still a readable record, and the Archive
   * tab opens it. Looking only at the board would make a row there open nothing
   * at all, because the effect below would immediately close it again.
   */
  const detailTicket =
    screen.kind === 'open' && detailId
      ? (screen.project.tickets.find((t) => t.id === detailId) ??
        screen.project.archivedTickets.find((t) => t.id === detailId))
      : undefined

  // A ticket can vanish between refreshes; close its dialog rather than leave it
  // ready to reappear on its own. This corrects the place; it is not a step.
  useEffect(() => {
    if (detailId && !detailTicket)
      setHistory((h) => replacePlace(h, { ...currentPlace(h), ticket: null }))
  }, [detailId, detailTicket])

  const switchProject = useCallback(
    (path: string) => {
      if (screen.kind === 'open' && screen.path === path) return
      void load(path)
    },
    [screen, load],
  )

  const openDocument = useCallback(
    (path: string, scrollTo: ScrollTarget | null = null) => {
      go(() => ({
        ...BOARD,
        view: 'documents',
        document: { path, fragment: scrollTo?.fragment ?? null },
      }))
      setDocumentTarget({ path, nonce: Date.now(), scrollTo })
    },
    [go],
  )

  /**
   * The document the Documents view is showing when it chose one itself: the
   * first on opening, or another after one was removed. Not a step.
   */
  const recordDocument = useCallback((path: string | null) => {
    setHistory((h) => {
      const current = currentPlace(h)
      if (current.view !== 'documents' || (current.document?.path ?? null) === path) return h
      return replacePlace(h, { ...current, document: path ? { path, fragment: null } : null })
    })
  }, [])

  const openPlan = useCallback(
    (id: string) => {
      go(() => ({ ...BOARD, view: 'plans', plan: id }))
      setPlanTarget({ id, nonce: Date.now() })
    },
    [go],
  )

  /** Shows a place from history exactly as it was opened, without adding a step. */
  const show = useCallback((next: History) => {
    const target = currentPlace(next)
    const nonce = Date.now()
    const scroll = (fragment: string | null | undefined) => (fragment ? { fragment, nonce } : null)
    setHistory(next)
    setDocumentTarget(
      target.document
        ? { path: target.document.path, nonce, scrollTo: scroll(target.document.fragment) }
        : null,
    )
    setPlanTarget(target.plan ? { id: target.plan, nonce } : null)
    setDetailScroll(scroll(target.ticket?.fragment))
  }, [])

  const steps = useHistorySteps({ screen, history, show, keep: setHistory, onNotice })

  return {
    view: place.view,
    setView,
    detailId,
    detailTicket,
    detailScroll,
    documentTarget,
    planTarget,
    openTicket,
    closeTicket,
    openDocument,
    recordDocument,
    openPlan,
    switchProject,
    history,
    ...steps,
  }
}
