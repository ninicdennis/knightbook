import { useCallback, useEffect, useState } from 'react'
import type { SkillSetupView, SkillTargetId } from '../../shared/skill-setup-contract.js'

type Loaded =
  | { kind: 'loading' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; setup: SkillSetupView }

/**
 * The skill's shipped contents and what is installed where, read fresh each
 * time the dialog opens, because the user may have edited a folder in between.
 * The last action's outcome is kept separately so a failure never replaces the
 * list the user was reading.
 */
export function useSkillSetup(rootPath: string, opened: boolean) {
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' })
  const [busy, setBusy] = useState<SkillTargetId | 'export' | null>(null)
  const [outcome, setOutcome] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    if (!opened) return
    let cancelled = false
    setLoaded({ kind: 'loading' })
    setOutcome(null)
    void window.knightbook.skillSetup(rootPath).then((result) => {
      if (cancelled) return
      setLoaded(
        result.ok
          ? { kind: 'ready', setup: result.value }
          : { kind: 'failed', message: result.message },
      )
    })
    return () => {
      cancelled = true
    }
  }, [rootPath, opened])

  const install = useCallback(
    async (target: SkillTargetId, expected: 'absent' | 'outdated') => {
      setBusy(target)
      const result = await window.knightbook.installSkill(rootPath, target, expected)
      setBusy(null)
      if (result.ok) {
        setLoaded({ kind: 'ready', setup: result.value })
        const path = result.value.targets.find((t) => t.id === target)?.path
        setOutcome({ ok: true, message: `Installed in ${path ?? 'the chosen folder'}.` })
      } else {
        setOutcome({ ok: false, message: result.message })
      }
    },
    [rootPath],
  )

  const exportFolder = useCallback(async () => {
    setBusy('export')
    const result = await window.knightbook.exportSkill()
    setBusy(null)
    if (!result.ok) setOutcome({ ok: false, message: result.message })
    else if (result.value) {
      setOutcome({ ok: true, message: `Exported to ${result.value.exportedTo}.` })
    }
  }, [])

  return { loaded, busy, outcome, install, exportFolder }
}
