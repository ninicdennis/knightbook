import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi, TicketSearchView } from '../shared/contract.js'
import {
  CHECKOUT,
  TICKET_ID,
  detail,
  makeApi,
  project,
  renderApp,
  ticket,
} from './test-fixtures.js'

/**
 * The optional work type: ✨ Feature, 🐛 Bug, 🛠️ Task, or none.
 *
 * Two things matter more than the badge itself. A ticket with no type must show
 * nothing rather than a placeholder, because most records predate this and
 * nobody has classified them. And the type must stay subordinate to the states
 * that say whether work can move.
 */

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  window.knightbook = api
})

async function openDetail(title = 'A ticket') {
  await user.click(await screen.findByText(title))
  return await screen.findByRole('dialog')
}

describe('showing the type', () => {
  it('reads as an emoji and a word on the card', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({ tickets: [ticket({ type: 'feature' })] }),
    })
    renderApp()

    // "Type:" is there for a screen reader; the emoji is hidden from one,
    // because the word beside it already carries the meaning.
    await screen.findByText('A ticket')
    const label = await screen.findByText('Feature')
    expect(label.textContent).toBe('Type: ✨ Feature')
    expect(label.querySelector('[aria-hidden="true"]')?.textContent).toBe('✨ ')
  })

  it('shows nothing at all for a ticket nobody has classified', async () => {
    renderApp()
    await screen.findByText('A ticket')

    expect(screen.queryByText(/^Type:/)).toBeNull()
  })

  it('does not displace what the board already says about the work', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({
        nextTicketId: TICKET_ID,
        tickets: [ticket({ type: 'bug', blocker: 'Waiting on an upstream release.' })],
      }),
    })
    renderApp()

    expect((await screen.findByText('Bug')).textContent).toBe('Type: 🐛 Bug')
    expect(screen.getByText('Next up')).toBeTruthy()
    expect(screen.getByText('Blocked')).toBeTruthy()
    expect(screen.getByText('Unreviewed')).toBeTruthy()
  })

  it('names it in the detail header, beside the status', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({ tickets: [ticket({ type: 'task' })] }),
    })
    api.readTicket = vi.fn().mockResolvedValue({ ok: true, value: detail({ type: 'task' }) })
    renderApp()
    const dialog = await openDetail()

    expect(within(dialog).getByText('Task').textContent).toBe('Type: 🛠️ Task')
    expect(within(dialog).getByText('Backlog')).toBeTruthy()
  })

  it('names it on a search result', async () => {
    const answer: TicketSearchView = {
      checkoutPath: CHECKOUT,
      query: 'ticket',
      hits: [
        {
          id: TICKET_ID,
          title: 'A ticket',
          status: 'backlog',
          type: 'bug',
          titleHighlights: [{ start: 2, length: 6 }],
          excerpt: null,
          excerptHighlights: [],
          archivedAt: null,
        },
      ],
      totalMatches: 1,
      unsearchable: [],
    }
    api.searchTickets = vi.fn().mockResolvedValue({ ok: true, value: answer })
    renderApp()
    await screen.findByText('A ticket')

    await user.click(screen.getByRole('button', { name: /search tickets/i }))
    await user.type(await screen.findByRole('textbox', { name: /search tickets/i }), 'ticket')

    const option = await screen.findByRole('option')
    expect(within(option).getByText('Bug').textContent).toBe('Type: 🐛 Bug')
  })
})

describe('choosing a type', () => {
  function accepts() {
    api.setTicketType = vi.fn().mockResolvedValue({
      ok: true,
      value: project({ tickets: [ticket({ type: 'bug', revision: 'rev-2' })] }),
    })
  }

  it('writes it against the revision the window is showing', async () => {
    accepts()
    renderApp()
    const dialog = await openDetail()

    await user.click(within(dialog).getByRole('button', { name: /^type$/i }))
    await user.click(within(await screen.findByRole('menu')).getByText('🐛 Bug'))

    await waitFor(() =>
      expect(api.setTicketType).toHaveBeenCalledWith(CHECKOUT, TICKET_ID, 'bug', 'rev-1'),
    )
  })

  it('stays open, showing the type it now has', async () => {
    accepts()
    renderApp()
    const dialog = await openDetail()

    await user.click(within(dialog).getByRole('button', { name: /^type$/i }))
    await user.click(within(await screen.findByRole('menu')).getByText('🐛 Bug'))

    await waitFor(() => expect(api.setTicketType).toHaveBeenCalled())
    expect((await within(screen.getByRole('dialog')).findByText('Bug')).textContent).toBe(
      'Type: 🐛 Bug',
    )
  })

  it('clears it by sending null, not by leaving the field out', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({ tickets: [ticket({ type: 'bug' })] }),
    })
    api.setTicketType = vi.fn().mockResolvedValue({ ok: true, value: project() })
    renderApp()
    const dialog = await openDetail()

    await user.click(within(dialog).getByRole('button', { name: /^type$/i }))
    await user.click(within(await screen.findByRole('menu')).getByText('No type'))

    await waitFor(() =>
      expect(api.setTicketType).toHaveBeenCalledWith(CHECKOUT, TICKET_ID, null, 'rev-1'),
    )
  })

  it('says which one is current, as a choice rather than a completion', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({ tickets: [ticket({ type: 'task' })] }),
    })
    renderApp()
    const dialog = await openDetail()

    await user.click(within(dialog).getByRole('button', { name: /^type$/i }))
    const menu = await screen.findByRole('menu')

    const chosen = within(menu).getAllByRole('menuitem', { current: true })
    expect(chosen).toHaveLength(1)
    expect(chosen[0]!.textContent).toContain('Task')
    expect(
      within(menu)
        .getByRole('menuitem', { name: /no type/i })
        .getAttribute('aria-current'),
    ).toBe('false')
  })

  it('is reachable from the keyboard', async () => {
    accepts()
    renderApp()
    const dialog = await openDetail()

    within(dialog)
      .getByRole('button', { name: /^type$/i })
      .focus()
    await user.keyboard('{Enter}')
    await screen.findByRole('menu')
    await user.keyboard('{ArrowDown}{Enter}')

    await waitFor(() => expect(api.setTicketType).toHaveBeenCalled())
  })

  it('explains a conflict and shows the current version instead of guessing', async () => {
    api.setTicketType = vi.fn().mockResolvedValue({
      ok: false,
      code: 'revision_conflict',
      message: 'The ticket changed since it was read.',
    })
    renderApp()
    const dialog = await openDetail()

    await user.click(within(dialog).getByRole('button', { name: /^type$/i }))
    await user.click(within(await screen.findByRole('menu')).getByText('🐛 Bug'))

    expect(await screen.findByText(/changed somewhere else/i)).toBeTruthy()
    // The board was re-read rather than left showing a change that did not land.
    expect((api.readProject as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1)
  })
})
