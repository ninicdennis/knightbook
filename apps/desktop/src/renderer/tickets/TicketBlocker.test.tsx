import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi } from '../../shared/contract.js'
import { CHECKOUT, TICKET_ID, makeApi, project, renderApp, ticket } from '../test/test-fixtures.js'

/**
 * Setting and clearing a blocker from the detail view. The host turns blank
 * text into no blocker as well; this covers what the window sends and shows.
 */

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  window.knightbook = api
})

function boardWithBlocker(blocker: string | null, revision = 'rev-1') {
  return { ok: true as const, value: project({ tickets: [ticket({ blocker, revision })] }) }
}

async function openDetail() {
  await user.click(await screen.findByText('A ticket'))
  return await screen.findByRole('dialog')
}

describe('the blocker in the detail view', () => {
  it('adds one against the revision the window is showing, and shows it without a refresh', async () => {
    api.setTicketBlocker = vi
      .fn()
      .mockResolvedValue(boardWithBlocker('Waiting on design.', 'rev-2'))
    renderApp()
    const dialog = await openDetail()

    await user.click(within(dialog).getByRole('button', { name: 'Add a blocker' }))
    await user.type(
      within(dialog).getByLabelText(/why this ticket cannot move/i),
      '  Waiting on design. ',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Save blocker' }))

    await waitFor(() =>
      expect(api.setTicketBlocker).toHaveBeenCalledWith(
        CHECKOUT,
        TICKET_ID,
        'Waiting on design.',
        'rev-1',
      ),
    )
    expect(await within(screen.getByRole('dialog')).findByText('Waiting on design.')).toBeTruthy()
    expect(api.readProject).toHaveBeenCalledTimes(1)
  })

  it('edits an existing blocker, starting from its text', async () => {
    api.readProject = vi.fn().mockResolvedValue(boardWithBlocker('Old reason.'))
    renderApp()
    const dialog = await openDetail()

    await user.click(within(dialog).getByRole('button', { name: 'Edit' }))
    const field = within(dialog).getByLabelText(/why this ticket cannot move/i)
    expect((field as HTMLTextAreaElement).value).toBe('Old reason.')
    // Focused with the caret at the end, so typing adds to the reason.
    await waitFor(() => expect(document.activeElement).toBe(field))
    expect((field as HTMLTextAreaElement).selectionStart).toBe('Old reason.'.length)

    await user.clear(field)
    await user.type(field, 'New reason.')
    await user.click(within(dialog).getByRole('button', { name: 'Save blocker' }))

    await waitFor(() =>
      expect(api.setTicketBlocker).toHaveBeenCalledWith(
        CHECKOUT,
        TICKET_ID,
        'New reason.',
        'rev-1',
      ),
    )
  })

  it('clears it as null, from the button or by saving empty text', async () => {
    api.readProject = vi.fn().mockResolvedValue(boardWithBlocker('A reason.'))
    // The host answers with the blocker still there, so both ways can be tried in turn.
    api.setTicketBlocker = vi.fn().mockResolvedValue(boardWithBlocker('A reason.'))
    renderApp()
    const dialog = await openDetail()

    await user.click(within(dialog).getByRole('button', { name: 'Clear blocker' }))
    await waitFor(() =>
      expect(api.setTicketBlocker).toHaveBeenLastCalledWith(CHECKOUT, TICKET_ID, null, 'rev-1'),
    )

    await user.click(within(dialog).getByRole('button', { name: 'Edit' }))
    await user.clear(within(dialog).getByLabelText(/why this ticket cannot move/i))
    await user.click(within(dialog).getByRole('button', { name: 'Save blocker' }))
    await waitFor(() => expect(api.setTicketBlocker).toHaveBeenCalledTimes(2))
    expect(api.setTicketBlocker).toHaveBeenLastCalledWith(CHECKOUT, TICKET_ID, null, 'rev-1')
  })

  it('cancels with Escape without closing the dialog or writing anything', async () => {
    renderApp()
    const dialog = await openDetail()

    await user.click(within(dialog).getByRole('button', { name: 'Add a blocker' }))
    await user.type(within(dialog).getByLabelText(/why this ticket cannot move/i), 'Draft{Escape}')

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Add a blocker' })).toBeTruthy()
    expect(api.setTicketBlocker).not.toHaveBeenCalled()
  })

  it('reloads and says so when the ticket changed elsewhere', async () => {
    api.setTicketBlocker = vi.fn().mockResolvedValue({
      ok: false,
      code: 'revision_conflict',
      message: 'stale',
    })
    renderApp()
    const dialog = await openDetail()

    await user.click(within(dialog).getByRole('button', { name: 'Add a blocker' }))
    await user.type(within(dialog).getByLabelText(/why this ticket cannot move/i), 'Reason')
    await user.click(within(dialog).getByRole('button', { name: 'Save blocker' }))

    expect(await screen.findByText(/the blocker was not saved/i)).toBeTruthy()
    expect(api.readProject).toHaveBeenCalledTimes(2)
  })
})
