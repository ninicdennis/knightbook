import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi } from '../shared/contract.js'
import { CHECKOUT, makeApi, project, renderApp, ticket } from './test-fixtures.js'

/**
 * Manual backlog order from the board. It is offered as menu items rather than
 * only as a drag, for the same reason every other move is: drag-and-drop alone
 * is not reachable from the keyboard.
 */

const FIRST = '11111111-1111-4111-8111-aaaaaaaaaaaa'
const SECOND = '22222222-2222-4222-8222-bbbbbbbbbbbb'
const THIRD = '33333333-3333-4333-8333-cccccccccccc'

function board(overrides = {}) {
  return project({
    tickets: [
      ticket({ id: FIRST, title: 'First' }),
      ticket({ id: SECOND, title: 'Second' }),
      ticket({ id: THIRD, title: 'Third' }),
      ticket({ id: 'doing', title: 'Underway', status: 'in_progress' }),
    ],
    ...overrides,
  })
}

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  api.readProject = vi.fn().mockResolvedValue({ ok: true, value: board() })
  api.reorderBacklog = vi.fn().mockResolvedValue({ ok: true, value: board() })
  window.knightbook = api
})

async function menuFor(title: string) {
  await screen.findByText(title)
  await user.click(screen.getByLabelText(`Actions for ${title}`))
}

describe('reordering the backlog', () => {
  it('sends the whole backlog in its new order', async () => {
    renderApp()
    await menuFor('Third')
    await user.click(await screen.findByText('Move up'))

    expect(api.reorderBacklog).toHaveBeenCalledWith(CHECKOUT, [FIRST, THIRD, SECOND])
  })

  it('moves a ticket to the front when asked', async () => {
    renderApp()
    await menuFor('Third')
    await user.click(await screen.findByText('Move to top'))

    expect(api.reorderBacklog).toHaveBeenCalledWith(CHECKOUT, [THIRD, FIRST, SECOND])
  })

  it('moves a ticket down', async () => {
    renderApp()
    await menuFor('First')
    await user.click(await screen.findByText('Move down'))

    expect(api.reorderBacklog).toHaveBeenCalledWith(CHECKOUT, [SECOND, FIRST, THIRD])
  })

  it('offers no move that would do nothing', async () => {
    renderApp()
    await menuFor('First')
    // Already first: there is nowhere above it.
    expect(screen.queryByText('Move up')).toBeNull()
    expect(screen.queryByText('Move to top')).toBeNull()
    expect(screen.getByText('Move down')).toBeTruthy()

    await user.keyboard('{Escape}')
    await menuFor('Third')
    expect(screen.queryByText('Move down')).toBeNull()
    expect(screen.getByText('Move up')).toBeTruthy()
  })

  it('offers no ordering for a card outside the backlog', async () => {
    renderApp()
    await menuFor('Underway')

    // Order is the backlog queue that "next up" reads; the other columns are
    // ordered by what has happened to their cards.
    expect(screen.queryByText('Move up')).toBeNull()
    expect(screen.queryByText('Move down')).toBeNull()
    // The ordinary status moves are still there; only ordering is absent.
    expect(screen.getByText('Move to')).toBeTruthy()
  })

  it('explains a refusal and leaves the board as it was', async () => {
    api.reorderBacklog = vi.fn().mockResolvedValue({
      ok: false,
      code: 'not_found',
      message: 'No ticket in this project with id: 999.',
    })
    renderApp()
    await menuFor('Third')
    await user.click(await screen.findByText('Move up'))

    expect(await screen.findByText(/No ticket in this project with id: 999\./)).toBeTruthy()
  })
})

describe('an order that does not resolve', () => {
  it('reports duplicates and unknown ids without offering to remove them', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: board({ backlogOrderProblems: { duplicates: [SECOND], unknown: ['ghost-id'] } }),
    })
    renderApp()

    expect(await screen.findByText(/has entries that do not resolve/)).toBeTruthy()
    expect(screen.getByText(new RegExp(`Listed more than once: ${SECOND}`))).toBeTruthy()
    expect(screen.getByText(/No ticket with this id: ghost-id/)).toBeTruthy()
    expect(screen.getByText(/Nothing was removed/)).toBeTruthy()
  })

  it('says nothing when the order is sound', async () => {
    renderApp()
    await screen.findByText('First')

    expect(screen.queryByText(/has entries that do not resolve/)).toBeNull()
  })
})
