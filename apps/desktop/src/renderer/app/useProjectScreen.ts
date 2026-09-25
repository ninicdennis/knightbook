import { useCallback, useEffect, useState } from 'react'
import type { RememberedProject } from '../../shared/contract.js'
import type { Screen } from './screen.js'

/**
 * Which project the window shows and how it gets there: opening one, reopening
 * the last one on launch, and setting up a new folder. The message above the
 * board lives here too, because loading a project is what clears it.
 */
export function useProjectScreen() {
  const [screen, setScreen] = useState<Screen>({ kind: 'welcome' })
  const [recentProjects, setRecentProjects] = useState<RememberedProject[]>([])
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async (path: string) => {
    setScreen({ kind: 'loading', path })
    setActionError(null)
    const result = await window.knightbook.readProject(path)
    if (result.ok) {
      setScreen({ kind: 'open', path, project: result.value })
      void window.knightbook.rememberedProjects().then(setRecentProjects)
    } else {
      setScreen({ kind: 'failed', path, code: result.code, message: result.message })
    }
  }, [])

  /**
   * Reopening the last project on launch matches how the user left the app. A
   * folder that has since moved or become invalid falls through to the failure
   * screen rather than silently showing nothing.
   */
  useEffect(() => {
    void window.knightbook.rememberedProjects().then((recent) => {
      setRecentProjects(recent)
      if (recent[0]) void load(recent[0].path)
    })
  }, [load])

  const choose = useCallback(async () => {
    const chosen = await window.knightbook.chooseProject()
    if (!chosen) return
    if (!chosen.initialized) {
      setScreen({ kind: 'not-a-project', path: chosen.path })
      return
    }
    await load(chosen.path)
  }, [load])

  const openAfterSetup = useCallback(
    async (path: string, warning: string | null) => {
      await load(path)
      // load() clears any standing message, so this has to come after it.
      if (warning) setActionError(warning)
    },
    [load],
  )

  return {
    screen,
    setScreen,
    recentProjects,
    actionError,
    setActionError,
    load,
    choose,
    openAfterSetup,
  }
}
