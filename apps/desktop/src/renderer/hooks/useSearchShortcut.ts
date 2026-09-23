import { useEffect } from 'react'
import { isSearchShortcut, isTypingTarget } from '../shortcuts.js'

/**
 * Ctrl/Cmd+K opens search from anywhere in the window. It is deliberately
 * passive about two cases: while the user is typing, because opening a dialog
 * over an unsaved reason or note would lose it and because a formatted editor
 * owns that chord for links; and while another dialog is open (`blocked`), so
 * the chord cannot bury the thing the user is already answering.
 */
export function useSearchShortcut(active: boolean, blocked: boolean, open: () => void): void {
  useEffect(() => {
    if (!active) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isSearchShortcut(event)) return
      if (isTypingTarget(event.target) || blocked) return

      event.preventDefault()
      open()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, blocked, open])
}
