import type { TicketView } from '../../shared/contract.js'

/**
 * Done fills up and stays full, so on a working board it holds more cards than
 * every active column together and draws attention away from them. It is
 * collapsed to the most recent completions instead.
 *
 * Hiding a card is only acceptable while the board still says how many are
 * hidden, and while a Done card carrying no attributable decision (D-005) is
 * counted out loud rather than simply disappearing. That is what
 * `hiddenUnattributed` is for.
 */

export const COLLAPSED_DONE_COUNT = 4

export interface DoneListing {
  visible: TicketView[]
  hiddenCount: number
  /** Of the hidden cards, how many were set to Done with no recorded decision. */
  hiddenUnattributed: number
}

/**
 * Most recently accepted first. A card with no recorded decision has no date to
 * order by, so it goes last rather than being given an invented position.
 */
function byRecencyOfCompletion(a: TicketView, b: TicketView): number {
  const left = a.completion?.recordedAt
  const right = b.completion?.recordedAt
  if (left === undefined && right === undefined) return 0
  if (left === undefined) return 1
  if (right === undefined) return -1
  return right.localeCompare(left)
}

export function orderDone(tickets: readonly TicketView[], expanded: boolean): DoneListing {
  const ordered = [...tickets].sort(byRecencyOfCompletion)
  if (expanded || ordered.length <= COLLAPSED_DONE_COUNT) {
    return { visible: ordered, hiddenCount: 0, hiddenUnattributed: 0 }
  }

  const hidden = ordered.slice(COLLAPSED_DONE_COUNT)
  return {
    visible: ordered.slice(0, COLLAPSED_DONE_COUNT),
    hiddenCount: hidden.length,
    hiddenUnattributed: hidden.filter((ticket) => ticket.completionUnattributed).length,
  }
}
