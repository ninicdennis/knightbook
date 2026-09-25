import { useCallback, useEffect, useState } from 'react'
import type { ScrollTarget } from '../markdown/useLinkNavigation.js'
import type { View } from './ProjectHeader.js'
import type { Screen } from '../projects/screen.js'

/**
 * Where the user is inside an open project: which view, and which ticket,
 * document or plan is open. A nonce on each target makes opening the same
 * document or plan twice still move the view to it.
 */
export function useProjectNavigation(screen: Screen, load: (path: string) => Promise<void>) {
  const [view, setView] = useState<View>('board')
  const [detailId, setDetailId] = useState<string | null>(null)
  /** A heading the open ticket should show, when a link named one. */
  const [detailScroll, setDetailScroll] = useState<ScrollTarget | null>(null)
  const [documentTarget, setDocumentTarget] = useState<{
    path: string
    nonce: number
    scrollTo: ScrollTarget | null
  } | null>(null)
  const [planTarget, setPlanTarget] = useState<{ id: string; nonce: number } | null>(null)

  const openTicket = useCallback((id: string, scrollTo: ScrollTarget | null = null) => {
    setDetailId(id)
    setDetailScroll(scrollTo)
  }, [])
  const closeTicket = useCallback(() => setDetailId(null), [])

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
  // ready to reappear on its own.
  useEffect(() => {
    if (detailId && !detailTicket) setDetailId(null)
  }, [detailId, detailTicket])

  const switchProject = useCallback(
    (path: string) => {
      if (screen.kind === 'open' && screen.path === path) return
      setView('board')
      setDetailId(null)
      setDocumentTarget(null)
      void load(path)
    },
    [screen, load],
  )

  const openDocument = useCallback((path: string, scrollTo: ScrollTarget | null = null) => {
    setDetailId(null)
    setView('documents')
    setDocumentTarget({ path, nonce: Date.now(), scrollTo })
  }, [])

  const openPlan = useCallback((id: string) => {
    setDetailId(null)
    setView('plans')
    setPlanTarget({ id, nonce: Date.now() })
  }, [])

  return {
    view,
    setView,
    detailId,
    detailTicket,
    detailScroll,
    documentTarget,
    planTarget,
    openTicket,
    closeTicket,
    openDocument,
    openPlan,
    switchProject,
  }
}
