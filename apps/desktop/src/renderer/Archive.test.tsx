import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi, TicketView } from '../shared/contract.js'
import { makeApi, project, renderApp, ticket, CHECKOUT } from './test-fixtures.js'

/**
 * Archiving takes a ticket off the board and keeps its record. What these cover
 * is the difference between that and the two things it must never be mistaken
 * for: finishing work, and deleting it.
 */

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

function archived(overrides: Partial<TicketView> = {}): TicketView {
  return ticket({
    id: 'aaaaaaaa-1111-4111-8111-111111111111',
    title: 'Put away last week',
    archivedAt: '2026-09-15T10:00:00Z',
    ...overrides,
  })
}

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  window.knightbook = api
})

/** Switches to the Archive tab the way a user does. */
async function openArchive() {
  await screen.findByText('Demo')
  await user.click(screen.getByRole('radio', { name: /archive/i }))
}

describe('the Archive tab', () => {
  it('counts what is archived without adding it to the board', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({
        tickets: [ticket({ title: 'On the board' })],
        archivedTickets: [archived()],
      }),
    })
    renderApp()

    expect(await screen.findByRole('radio', { name: 'Archive 1' })).toBeTruthy()
    // The board shows only active work; the archived one is not a card.
    expect(screen.queryByText('Put away last week')).toBeNull()
  })

  it('says what the archive is for when it is empty, rather than looking broken', async () => {
    renderApp()
    await openArchive()

    expect(await screen.findByText(/nothing archived/i)).toBeTruthy()
  })

  it('shows the status each ticket kept, because archiving decided nothing', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({
        tickets: [],
        archivedTickets: [archived({ status: 'in_progress', title: 'Abandoned halfway' })],
      }),
    })
    renderApp()
    await openArchive()

    const title = await screen.findByText('Abandoned halfway')
    // Scoped to the row: "Archive" also names the tab, and the point here is
    // what this one ticket says about itself.
    const row = title.closest('.mantine-Card-root') as HTMLElement
    // Not "archived" as a status: the status it had is still its status.
    expect(within(row).getByText('In progress')).toBeTruthy()
    expect(within(row).getByText(/^Archived /)).toBeTruthy()
  })

  it('opens the full ticket detail from an archived row', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({ tickets: [], archivedTickets: [archived()] }),
    })
    renderApp()
    await openArchive()

    await user.click(await screen.findByText('Put away last week'))

    // The record is still readable: archiving filed it away, it did not remove it.
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Put away last week')).toBeTruthy()
  })

  it('restores a ticket to the status it kept', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({ tickets: [], archivedTickets: [archived({ status: 'done' })] }),
    })
    api.restoreTicket = vi.fn().mockResolvedValue({
      ok: true,
      value: project({ tickets: [ticket({ status: 'done' })], archivedTickets: [] }),
    })
    renderApp()
    await openArchive()

    await user.click(await screen.findByRole('button', { name: /restore/i }))

    await waitFor(() =>
      expect(api.restoreTicket).toHaveBeenCalledWith(
        CHECKOUT,
        'aaaaaaaa-1111-4111-8111-111111111111',
        expect.anything(),
      ),
    )
  })
})

describe('finding archived tickets from search', () => {
  const hit = (overrides = {}) => ({
    id: 'aaaaaaaa-1111-4111-8111-111111111111',
    title: 'Put away last week',
    status: 'backlog' as const,
    type: null,
    titleHighlights: [{ start: 0, length: 3 }],
    excerpt: null,
    excerptHighlights: [],
    archivedAt: '2026-09-15T10:00:00Z',
    ...overrides,
  })

  it('searches the board by default and says so with a scope control', async () => {
    renderApp()
    await screen.findByText('Demo')
    await user.click(screen.getByRole('button', { name: /search tickets/i }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('radio', { name: 'Active' })).toBeTruthy()
    expect(within(dialog).getByRole('radio', { name: 'Archived' })).toBeTruthy()
    expect(within(dialog).getByRole('radio', { name: 'All' })).toBeTruthy()

    await user.type(within(dialog).getByLabelText(/search tickets/i), 'put')

    await waitFor(() => expect(api.searchTickets).toHaveBeenCalledWith(CHECKOUT, 'put', 'active'))
  })

  it('labels an archived result rather than hiding or silently mixing it in', async () => {
    api.searchTickets = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        checkoutPath: CHECKOUT,
        query: 'put',
        hits: [hit()],
        totalMatches: 1,
        unsearchable: [],
      },
    })
    renderApp()
    await screen.findByText('Demo')
    await user.click(screen.getByRole('button', { name: /search tickets/i }))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('radio', { name: 'All' }))
    await user.type(within(dialog).getByLabelText(/search tickets/i), 'put')

    expect(await within(dialog).findByText('Archived')).toBeTruthy()
    await waitFor(() => expect(api.searchTickets).toHaveBeenCalledWith(CHECKOUT, 'put', 'all'))
  })

  it('searches the archive when opened from the Archive tab', async () => {
    renderApp()
    await openArchive()
    await user.click(screen.getByRole('button', { name: /search tickets/i }))

    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/search tickets/i), 'put')

    await waitFor(() => expect(api.searchTickets).toHaveBeenCalledWith(CHECKOUT, 'put', 'archived'))
  })
})

describe('archiving one ticket', () => {
  it('archives from the card menu without asking for a decision about the work', async () => {
    api.archiveTickets = vi.fn().mockResolvedValue({
      ok: true,
      value: { archivedCount: 1, failures: [], project: project({ tickets: [] }) },
    })
    renderApp()
    await screen.findByText('A ticket')

    await user.click(screen.getByRole('button', { name: /actions for a ticket/i }))
    await user.click(within(await screen.findByRole('menu')).getByText('Archive'))

    await waitFor(() =>
      expect(api.archiveTickets).toHaveBeenCalledWith(CHECKOUT, [
        { id: expect.any(String), revision: 'rev-1' },
      ]),
    )
    // Archiving is not acceptance: nothing may record a completion here.
    expect(api.completeTicket).not.toHaveBeenCalled()
  })
})

describe('archiving a whole column', () => {
  const twoInBacklog = () =>
    project({
      tickets: [
        ticket({ id: 'id-1', title: 'First', revision: 'r1' }),
        ticket({ id: 'id-2', title: 'Second', revision: 'r2' }),
      ],
    })

  it('names the column and the exact count before doing anything', async () => {
    api.readProject = vi.fn().mockResolvedValue({ ok: true, value: twoInBacklog() })
    renderApp()
    await screen.findByText('First')

    await user.click(screen.getByRole('button', { name: /actions for the backlog column/i }))
    await user.click(
      within(await screen.findByRole('menu')).getByText(/archive all in this column/i),
    )

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/archive all in backlog\?/i)).toBeTruthy()
    expect(within(dialog).getByText('2')).toBeTruthy()
    expect(within(dialog).getByText(/nothing is deleted/i)).toBeTruthy()
    // Unfinished work must say that archiving neither completes nor accepts it.
    expect(within(dialog).getByText(/does not complete it and does not accept it/i)).toBeTruthy()
    expect(api.archiveTickets).not.toHaveBeenCalled()
  })

  it('archives exactly the tickets it showed, at the revisions it showed', async () => {
    api.readProject = vi.fn().mockResolvedValue({ ok: true, value: twoInBacklog() })
    api.archiveTickets = vi.fn().mockResolvedValue({
      ok: true,
      value: { archivedCount: 2, failures: [], project: project({ tickets: [] }) },
    })
    renderApp()
    await screen.findByText('First')

    await user.click(screen.getByRole('button', { name: /actions for the backlog column/i }))
    await user.click(
      within(await screen.findByRole('menu')).getByText(/archive all in this column/i),
    )
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /archive 2 tickets/i }),
    )

    await waitFor(() =>
      expect(api.archiveTickets).toHaveBeenCalledWith(CHECKOUT, [
        { id: 'id-1', revision: 'r1' },
        { id: 'id-2', revision: 'r2' },
      ]),
    )
  })

  it('reports a partial result by name instead of claiming it all worked', async () => {
    api.readProject = vi.fn().mockResolvedValue({ ok: true, value: twoInBacklog() })
    api.archiveTickets = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        archivedCount: 1,
        failures: [{ id: 'id-2', title: 'Second', reason: 'revision_conflict' }],
        project: project({ tickets: [ticket({ id: 'id-2', title: 'Second' })] }),
      },
    })
    renderApp()
    await screen.findByText('First')

    await user.click(screen.getByRole('button', { name: /actions for the backlog column/i }))
    await user.click(
      within(await screen.findByRole('menu')).getByText(/archive all in this column/i),
    )
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /archive 2 tickets/i }),
    )

    // The one that worked stays done; the one that did not is named.
    expect(await screen.findByText(/archived 1 of 2/i)).toBeTruthy()
    expect(screen.getByText(/"Second"/)).toBeTruthy()
    expect(screen.getByText(/nothing was lost/i)).toBeTruthy()
  })

  it('blocks switching project while the bulk archive is still running', async () => {
    api.readProject = vi.fn().mockResolvedValue({ ok: true, value: twoInBacklog() })
    // Never settles, so the operation stays in flight for the assertion.
    api.archiveTickets = vi.fn().mockReturnValue(new Promise(() => {}))
    renderApp()
    await screen.findByText('First')

    await user.click(screen.getByRole('button', { name: /actions for the backlog column/i }))
    await user.click(
      within(await screen.findByRole('menu')).getByText(/archive all in this column/i),
    )
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /archive 2 tickets/i }),
    )

    /*
     * A bulk archive is many writes against one project. Switching underneath it
     * would leave the rest of them pointed at a project the user is no longer
     * looking at, so the switcher has to say it is unavailable and why.
     */
    await user.click(await screen.findByRole('button', { name: /open project menu/i }))
    expect(await screen.findByText(/tickets are being archived/i)).toBeTruthy()
  })

  it('offers no column menu when there is nothing in the column to archive', async () => {
    api.readProject = vi.fn().mockResolvedValue({ ok: true, value: project({ tickets: [] }) })
    renderApp()
    await screen.findByText('Demo')

    expect(screen.queryByRole('button', { name: /actions for the backlog column/i })).toBeNull()
  })
})
