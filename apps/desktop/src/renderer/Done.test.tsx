import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompletionView, KnightbookApi, TicketView } from '../shared/contract.js'
import { makeApi, project, renderApp, ticket } from './test-fixtures.js'
import { COLLAPSED_DONE_COUNT, orderDone } from './done-order.js'

/**
 * Done is the one column shown collapsed. Hiding a card is only acceptable while
 * the total stays visible and a completion with no recorded decision is still
 * accounted for, which is what most of this covers.
 */

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  window.knightbook = api
})

function accepted(at: string): CompletionView {
  return {
    decisionSource: 'direct_user_action',
    recordedBy: 'user',
    recordedAt: at,
    instruction: 'Moved to Done in the app.',
  }
}

/** Nine accepted tickets, oldest first, so ordering is visible in the result. */
function doneTickets(): TicketView[] {
  return Array.from({ length: 9 }, (_, index) =>
    ticket({
      id: `${index}`,
      title: `Finished ${index}`,
      status: 'done',
      completion: accepted(`2026-09-0${index + 1}T09:00:00Z`),
    }),
  )
}

describe('ordering Done', () => {
  it('puts the most recently accepted first', () => {
    const { visible } = orderDone(doneTickets(), true)
    expect(visible.map((t) => t.title)).toEqual([
      'Finished 8',
      'Finished 7',
      'Finished 6',
      'Finished 5',
      'Finished 4',
      'Finished 3',
      'Finished 2',
      'Finished 1',
      'Finished 0',
    ])
  })

  it('places a completion with no recorded date last rather than inventing a position', () => {
    const tickets = [
      ticket({ id: 'stray', title: 'No record', status: 'done', completionUnattributed: true }),
      ticket({ id: 'a', title: 'Recorded', status: 'done', completion: accepted('2026-09-01') }),
    ]
    expect(orderDone(tickets, true).visible.map((t) => t.title)).toEqual(['Recorded', 'No record'])
  })

  it('counts hidden cards, and hidden cards with no recorded decision separately', () => {
    const tickets = [
      ...doneTickets(),
      ticket({ id: 'stray', title: 'No record', status: 'done', completionUnattributed: true }),
    ]
    const listing = orderDone(tickets, false)

    expect(listing.visible).toHaveLength(COLLAPSED_DONE_COUNT)
    expect(listing.hiddenCount).toBe(10 - COLLAPSED_DONE_COUNT)
    expect(listing.hiddenUnattributed).toBe(1)
  })

  it('hides nothing when there is little to hide', () => {
    const listing = orderDone(doneTickets().slice(0, COLLAPSED_DONE_COUNT), false)
    expect(listing.hiddenCount).toBe(0)
  })
})

describe('the Done column on the board', () => {
  it('shows the total while collapsed, and reveals the rest when asked', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({ tickets: doneTickets() }),
    })
    renderApp()

    expect(await screen.findByText('Finished 8')).toBeTruthy()
    // Hidden, not absent: the count of all nine stays on the column heading.
    expect(screen.queryByText('Finished 0')).toBeNull()
    expect(screen.getByLabelText('9 in Done')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /show all 9/i }))
    expect(await screen.findByText('Finished 0')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /show fewer/i }))
    expect(screen.queryByText('Finished 0')).toBeNull()
  })

  it('says so when a hidden card carries no recorded decision (D-005)', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({
        tickets: [
          ...doneTickets(),
          ticket({ id: 'stray', title: 'No record', status: 'done', completionUnattributed: true }),
        ],
      }),
    })
    renderApp()

    await screen.findByText('Finished 8')
    expect(screen.queryByText('No record')).toBeNull()
    expect(screen.getByText(/1 hidden card has no recorded decision/i)).toBeTruthy()

    // And it is still reachable, with its flag intact.
    await user.click(screen.getByRole('button', { name: /show all 10/i }))
    const card = (await screen.findByText('No record')).closest('div')!
    expect(within(card.parentElement!).getByText(/unattributed/i)).toBeTruthy()
  })
})
