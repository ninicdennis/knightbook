import { useCallback, useState } from 'react'
import type { RoutineEdit, RoutinesView } from '../../shared/routines-contract.js'

/**
 * Writing routines from the pane. An edit names the revision the pane read; a
 * routine changed elsewhere since is refused by the host, and the pane reloads
 * and says so rather than saving over someone else's change. Starting a run
 * writes a ticket, so the board is re-read afterwards.
 */

const CONFLICT =
  'That routine changed somewhere else, so your edit was not saved. This is the current version.'

interface Options {
  rootPath: string
  /** Shows the listing the host returned after a write. */
  show: (listing: RoutinesView) => void
  /** Reads the routines again from disk. */
  reload: () => void
  /** Re-reads the whole project, so a new run appears on the board. */
  onRunStarted: () => void
}

export function useRoutineEdits({ rootPath, show, reload, onRunStarted }: Options) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Resolves to the new routine's id, or null when nothing was created. */
  const create = useCallback(
    async (edit: RoutineEdit): Promise<string | null> => {
      setBusy(true)
      setError(null)
      const result = await window.knightbook.createRoutine(rootPath, edit)
      setBusy(false)
      if (!result.ok) {
        setError(result.message)
        return null
      }
      show(result.value.routines)
      return result.value.id
    },
    [rootPath, show],
  )

  /** Resolves to whether the edit was saved. */
  const save = useCallback(
    async (id: string, revision: string, edit: RoutineEdit): Promise<boolean> => {
      setBusy(true)
      setError(null)
      const result = await window.knightbook.updateRoutine(rootPath, id, edit, revision)
      setBusy(false)
      if (result.ok) {
        show(result.value)
        return true
      }
      if (result.code === 'revision_conflict') {
        reload()
        setError(CONFLICT)
      } else setError(result.message)
      return false
    },
    [rootPath, show, reload],
  )

  /** Resolves to the new run's ticket id, or null when no run was started. */
  const startRun = useCallback(
    async (id: string, anotherRun: boolean): Promise<string | null> => {
      setBusy(true)
      setError(null)
      const result = await window.knightbook.startRoutineRun(rootPath, id, anotherRun)
      setBusy(false)
      if (!result.ok) {
        // A run another tool started since the pane last read: show it.
        if (result.code === 'run_already_open') reload()
        setError(result.message)
        return null
      }
      show(result.value.routines)
      onRunStarted()
      return result.value.ticketId
    },
    [rootPath, show, reload, onRunStarted],
  )

  return { busy, error, clearError: () => setError(null), create, save, startRun }
}
