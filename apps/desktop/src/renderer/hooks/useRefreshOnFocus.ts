import { useEffect, useRef } from 'react'

/**
 * Calls `refresh` when the window regains focus.
 *
 * The usual reason the project changed underneath the app is that an AI tool
 * wrote to it while the user was somewhere else, so coming back to the window is
 * the moment that matters. This covers that without watching the filesystem; a
 * real watcher is still a separate backlog item for changes that happen while the
 * window is in front.
 *
 * Focus can fire in quick bursts (clicking through dialogs, switching windows),
 * so calls closer together than `minIntervalMs` are dropped.
 */
export function useRefreshOnFocus(refresh: () => void, enabled: boolean, minIntervalMs = 1500) {
  const lastRun = useRef(0)

  useEffect(() => {
    if (!enabled) return

    const onFocus = () => {
      const now = Date.now()
      if (now - lastRun.current < minIntervalMs) return
      lastRun.current = now
      refresh()
    }

    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh, enabled, minIntervalMs])
}
