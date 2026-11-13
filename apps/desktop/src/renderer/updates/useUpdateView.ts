import { useCallback, useEffect, useState } from 'react'
import type { UpdateView } from '../../shared/updates-contract.js'

/**
 * The host's update state, kept current by its change events. Each action
 * returns the state it led to, which is applied at once in case the event and
 * the reply arrive in either order. A host that cannot answer leaves this null,
 * and the screens show nothing rather than guessing.
 */
export function useUpdateView() {
  const [view, setView] = useState<UpdateView | null>(null)

  useEffect(() => {
    let current = true
    const stop = window.knightbook.onUpdateView((next) => {
      if (current) setView(next)
    })
    window.knightbook.updateView().then(
      (next) => {
        if (current) setView(next)
      },
      () => undefined,
    )
    return () => {
      current = false
      stop()
    }
  }, [])

  const run = useCallback((action: () => Promise<UpdateView>) => {
    void action().then(setView, () => undefined)
  }, [])

  return {
    view,
    check: () => run(() => window.knightbook.checkForUpdates()),
    download: () => run(() => window.knightbook.downloadUpdate()),
    install: () => run(() => window.knightbook.installUpdate()),
  }
}

/** Whether this installation can install `view`'s offered release itself. */
export function installsInPlace(view: UpdateView): boolean {
  const { status } = view
  return view.mode === 'install' && 'release' in status && status.release?.installable === true
}
