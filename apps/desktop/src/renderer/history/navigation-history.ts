import type { View } from '../app/ProjectHeader.js'

/**
 * Back and forward through the places the user has been in one open project
 * (ticket 855c3054). Pure: the hook that owns it decides when to push and when
 * a step is stale.
 *
 * A place is a view plus what was open in it: the document or plan it showed,
 * and the ticket open over it, each with the heading a link named. Scroll
 * position is not kept; only the heading a link asked for.
 */

export interface Place {
  view: View
  document: { path: string; fragment: string | null } | null
  plan: string | null
  /**
   * `archived` is whether the ticket was already archived when it was opened,
   * so only one archived since then counts as gone: a link can lead straight
   * to an archived ticket, and stepping back to it is fine.
   */
  ticket: { id: string; fragment: string | null; archived: boolean } | null
}

export interface History {
  entries: Place[]
  index: number
}

/** Enough to walk back through a working session without growing for ever. */
const LIMIT = 100

export const BOARD: Place = { view: 'board', document: null, plan: null, ticket: null }

export function startHistory(place: Place = BOARD): History {
  return { entries: [place], index: 0 }
}

export function currentPlace(history: History): Place {
  return history.entries[history.index] ?? BOARD
}

/** The same place, ignoring which heading it was opened at. */
export function samePlace(a: Place, b: Place): boolean {
  return (
    a.view === b.view &&
    a.plan === b.plan &&
    a.document?.path === b.document?.path &&
    a.ticket?.id === b.ticket?.id
  )
}

/**
 * A new step. Anything forward of the current place is discarded, as in a
 * browser. Going where you already are only updates the heading, so a second
 * click on the same thing never adds a step that Back would seem to ignore.
 */
export function pushPlace(history: History, place: Place): History {
  if (samePlace(currentPlace(history), place)) return replacePlace(history, place)
  const entries = [...history.entries.slice(0, history.index + 1), place].slice(-LIMIT)
  return { entries, index: entries.length - 1 }
}

/** Corrects the current place without adding a step, such as the document a view chose by itself. */
export function replacePlace(history: History, place: Place): History {
  const entries = [...history.entries]
  entries[history.index] = place
  return { entries, index: history.index }
}

/** Index of the place one step back (-1) or forward (+1), or null at either end. */
export function stepIndex(history: History, direction: -1 | 1): number | null {
  const next = history.index + direction
  return next >= 0 && next < history.entries.length ? next : null
}

/**
 * Removes a place that no longer exists, keeping the current place where it
 * is, so a stale step is reported once and never offered again.
 */
export function dropPlace(history: History, at: number): History {
  if (at === history.index || at < 0 || at >= history.entries.length) return history
  const entries = history.entries.filter((_, i) => i !== at)
  return { entries, index: at < history.index ? history.index - 1 : history.index }
}
