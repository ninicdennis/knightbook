import { useEffect } from 'react'
import { historyShortcut, isTypingTarget } from '../app/shortcuts.js'

/** The mouse's side buttons as the DOM numbers them: X1 is Back, X2 is Forward. */
const MOUSE_BACK = 3
const MOUSE_FORWARD = 4

/**
 * Marks a dialog that is itself a place in history, the ticket view, so Back
 * and Forward still work over it. Its editor removes the mark while a draft is
 * open.
 */
export const HISTORY_PLACE_ATTRIBUTE = 'data-history-place'

/**
 * Whether some other dialog or popover is open. Read from the page at the
 * moment of the press rather than from each dialog's state, so a dialog added
 * later is covered without anyone remembering to list it here.
 */
function somethingIsAsking(): boolean {
  return document.querySelector(`[role="dialog"]:not([${HISTORY_PLACE_ATTRIBUTE}])`) !== null
}

/**
 * Back and Forward from the keyboard and the mouse's side buttons.
 *
 * Passive in two cases, like the search shortcut: while the user is typing,
 * because Alt+arrow and Cmd+bracket belong to the text field there; and while
 * another dialog is asking something or a ticket is being edited, so a stray
 * side-button press cannot throw away an answer or a draft.
 */
export function useHistoryInput(active: boolean, goBack: () => void, goForward: () => void): void {
  useEffect(() => {
    if (!active) return

    const go = (direction: -1 | 1) => (direction === -1 ? goBack() : goForward())

    const onKeyDown = (event: KeyboardEvent) => {
      const direction = historyShortcut(event)
      if (direction === null || isTypingTarget(event.target)) return
      event.preventDefault()
      if (!somethingIsAsking()) go(direction)
    }

    // The browser engine would act on the press itself; the app's history is the only one.
    const swallow = (event: MouseEvent) => {
      if (event.button === MOUSE_BACK || event.button === MOUSE_FORWARD) event.preventDefault()
    }
    const onMouseUp = (event: MouseEvent) => {
      if (event.button !== MOUSE_BACK && event.button !== MOUSE_FORWARD) return
      event.preventDefault()
      if (!somethingIsAsking()) go(event.button === MOUSE_BACK ? -1 : 1)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', swallow)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', swallow)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [active, goBack, goForward])
}
