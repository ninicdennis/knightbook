import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import type { Screen } from '../projects/screen.js'
import { useRefreshOnFocus } from './useRefreshOnFocus.js'

interface Options {
  screen: Screen
  setScreen: Dispatch<SetStateAction<Screen>>
  setActionError: (message: string | null) => void
  busyTicketId: string | null
}

/**
 * Re-reads the open project on request and when the window regains focus.
 * `refreshToken` changes after each successful read, so views that load their
 * own data (documents, plans, search) know to read again.
 */
export function useProjectRefresh({ screen, setScreen, setActionError, busyTicketId }: Options) {
  const [refreshing, setRefreshing] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)

  /**
   * Re-reads the project without the loading screen, so the user keeps their
   * place. A failure keeps the last version that loaded and says so, rather than
   * swapping the board for an error page.
   */
  const refresh = useCallback(async () => {
    if (screen.kind !== 'open' || busyTicketId !== null) return
    const path = screen.path
    setRefreshing(true)

    const result = await window.knightbook.readProject(path)
    if (result.ok) {
      // The user may have switched projects while this was reading.
      setScreen((current) =>
        current.kind === 'open' && current.path === path
          ? { kind: 'open', path, project: result.value }
          : current,
      )
      setRefreshToken((n) => n + 1)
    } else {
      setActionError(
        `Could not refresh: ${result.message} What is shown is the last version that loaded.`,
      )
    }
    setRefreshing(false)
  }, [screen, busyTicketId, setScreen, setActionError])

  useRefreshOnFocus(refresh, screen.kind === 'open')

  return { refresh, refreshing, refreshToken }
}
