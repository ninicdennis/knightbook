export type BacklogMove = 'top' | 'up' | 'down'

/**
 * The whole backlog in its new order after one move, or null when the move
 * would change nothing.
 *
 * `visible` is what the board is drawing. While a filter hides cards, "up" puts
 * the ticket above the previous card the user can see, not above a hidden one,
 * so the move is never invisible. Hidden tickets keep their places relative to
 * each other; only the moved ticket changes position in the full order. With no
 * visible card in that direction it steps one place in the full order instead.
 */
export function moveInBacklog(
  order: readonly string[],
  ticketId: string,
  to: BacklogMove,
  visible: readonly string[] = order,
): string[] | null {
  const from = order.indexOf(ticketId)
  if (from === -1) return null

  const rest = order.filter((id) => id !== ticketId)
  let insertAt: number
  if (to === 'top') {
    insertAt = 0
  } else {
    const shownAt = visible.indexOf(ticketId)
    const neighbour = shownAt === -1 ? undefined : visible[to === 'up' ? shownAt - 1 : shownAt + 1]
    const neighbourAt = neighbour === undefined ? -1 : rest.indexOf(neighbour)
    if (neighbourAt !== -1) {
      insertAt = to === 'up' ? neighbourAt : neighbourAt + 1
    } else {
      insertAt = to === 'up' ? from - 1 : from + 1
    }
  }

  if (insertAt < 0 || insertAt > rest.length || insertAt === from) return null
  return [...rest.slice(0, insertAt), ticketId, ...rest.slice(insertAt)]
}
