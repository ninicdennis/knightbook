/**
 * Application-scoped keyboard shortcuts. These are window-level listeners, not
 * OS-level ones: the app never claims a chord while another program is in front.
 */

/** macOS uses Command for this class of shortcut; Windows and Linux use Control. */
export const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

export const SEARCH_SHORTCUT_LABEL = IS_MAC ? '⌘K' : 'Ctrl K'

/**
 * Whether a keystroke should be left alone because the user is typing into
 * something. Two things depend on this: unsaved text in a field must never be
 * interrupted by a dialog opening over it, and a formatted editor's own
 * Cmd/Ctrl+K (insert link) has to keep working when one lands here.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** True for the platform's own Search chord, and nothing else. */
export function isSearchShortcut(event: KeyboardEvent): boolean {
  if (event.key !== 'k' && event.key !== 'K') return false
  // Never treat Ctrl+K on macOS, or Cmd+K on Windows, as the shortcut: each
  // platform has exactly one, and the other chord may mean something else.
  return IS_MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
}

/**
 * Back (-1) or Forward (+1) for the platform's own history chord, or null:
 * Alt+← / Alt+→ on Windows and Linux, Cmd+[ / Cmd+] on macOS. As with search,
 * each platform has exactly one pair.
 */
export function historyShortcut(event: KeyboardEvent, mac = IS_MAC): -1 | 1 | null {
  if (event.shiftKey) return null
  if (mac) {
    if (!event.metaKey || event.ctrlKey || event.altKey) return null
    return event.key === '[' ? -1 : event.key === ']' ? 1 : null
  }
  if (!event.altKey || event.ctrlKey || event.metaKey) return null
  return event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : null
}
