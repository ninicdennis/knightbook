import { describe, expect, it } from 'vitest'
import { moveInBacklog } from './backlog-move.js'

const order = ['a', 'b', 'c', 'd', 'e']

describe('moving a ticket in the backlog', () => {
  it('moves one place when nothing is hidden', () => {
    expect(moveInBacklog(order, 'c', 'up')).toEqual(['a', 'c', 'b', 'd', 'e'])
    expect(moveInBacklog(order, 'c', 'down')).toEqual(['a', 'b', 'd', 'c', 'e'])
    expect(moveInBacklog(order, 'd', 'top')).toEqual(['d', 'a', 'b', 'c', 'e'])
  })

  it('refuses moves that change nothing', () => {
    expect(moveInBacklog(order, 'a', 'up')).toBeNull()
    expect(moveInBacklog(order, 'a', 'top')).toBeNull()
    expect(moveInBacklog(order, 'e', 'down')).toBeNull()
    expect(moveInBacklog(order, 'missing', 'up')).toBeNull()
  })

  it('passes the previous visible card, keeping hidden ones in their order', () => {
    // b and c are hidden by a filter; d moves above a, the card the user sees above it.
    const visible = ['a', 'd', 'e']
    expect(moveInBacklog(order, 'd', 'up', visible)).toEqual(['d', 'a', 'b', 'c', 'e'])
    expect(moveInBacklog(order, 'a', 'down', visible)).toEqual(['b', 'c', 'd', 'a', 'e'])
  })

  it('steps one place in the full order when no visible card is in that direction', () => {
    // b is the first visible card, but a hidden one is above it.
    expect(moveInBacklog(order, 'b', 'up', ['b', 'e'])).toEqual(['b', 'a', 'c', 'd', 'e'])
    expect(moveInBacklog(order, 'd', 'down', ['a', 'd'])).toEqual(['a', 'b', 'c', 'e', 'd'])
  })

  it('always sends the whole backlog', () => {
    const next = moveInBacklog(order, 'e', 'up', ['b', 'e'])
    expect(next).toEqual(['a', 'e', 'b', 'c', 'd'])
    expect([...(next ?? [])].sort()).toEqual([...order].sort())
  })
})
