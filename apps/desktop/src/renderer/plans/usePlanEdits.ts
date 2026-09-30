import { useCallback, useState } from 'react'
import type { PhaseEdit, PlansView } from '../../shared/plans-contract.js'

/**
 * Writing plans from the pane. Every phase edit names the revision the pane
 * read; a plan changed elsewhere since is refused by the host, and the pane
 * reloads and says so rather than retrying over someone else's change, as the
 * board does for moves.
 */

const CONFLICT =
  'That plan changed somewhere else, so your change was not applied. This is the current version.'

interface Options {
  rootPath: string
  /** Shows the listing the host returned after a write. */
  show: (listing: PlansView) => void
  /** Reads the plans again from disk. */
  reload: () => void
}

export function usePlanEdits({ rootPath, show, reload }: Options) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Resolves to the new plan's id, or null when nothing was created. */
  const createPlan = useCallback(
    async (title: string): Promise<string | null> => {
      setBusy(true)
      setError(null)
      const result = await window.knightbook.createPlan(rootPath, title)
      setBusy(false)
      if (!result.ok) {
        setError(result.message)
        return null
      }
      show(result.value.plans)
      return result.value.id
    },
    [rootPath, show],
  )

  const savePhases = useCallback(
    async (planId: string, revision: string, phases: PhaseEdit[]) => {
      setBusy(true)
      setError(null)
      const result = await window.knightbook.setPlanPhases(rootPath, planId, phases, revision)
      setBusy(false)
      if (result.ok) show(result.value)
      else if (result.code === 'revision_conflict') {
        reload()
        setError(CONFLICT)
      } else setError(result.message)
    },
    [rootPath, show, reload],
  )

  return { busy, error, clearError: () => setError(null), createPlan, savePhases }
}
