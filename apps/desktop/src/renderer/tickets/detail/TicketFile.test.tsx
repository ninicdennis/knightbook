import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi } from '../../../shared/contract.js'
import { CHECKOUT, TICKET_ID, makeApi, renderApp } from '../../test/test-fixtures.js'

/**
 * Opening a ticket's own file in the user's editor. The host resolves the path
 * (ticket-file.test.ts); this covers what the dialog sends and what it shows.
 */

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  window.knightbook = api
})

async function openDetail() {
  await user.click(await screen.findByText('A ticket'))
  return await screen.findByRole('dialog')
}

describe("opening a ticket's file externally", () => {
  it('asks the host by id alone, never by path', async () => {
    renderApp()
    const dialog = await openDetail()

    await user.click(within(dialog).getByRole('button', { name: /edit externally/i }))

    expect(api.openTicketExternally).toHaveBeenCalledWith(CHECKOUT, TICKET_ID)
    expect(within(dialog).queryByRole('alert')).toBeNull()
  })

  it('says so when the editor could not open it, instead of looking like it worked', async () => {
    api.openTicketExternally = vi.fn().mockResolvedValue({
      ok: false,
      code: 'unexpected_error',
      message: 'Your editor could not open the ticket file: no application is associated.',
    })
    renderApp()
    const dialog = await openDetail()

    await user.click(within(dialog).getByRole('button', { name: /edit externally/i }))

    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/could not open/i)
  })

  it('sits with the ticket details, not among the review and acceptance actions', async () => {
    renderApp()
    const dialog = await openDetail()
    const button = within(dialog).getByRole('button', { name: /edit externally/i })

    expect(button.closest('header')).toBeTruthy()
  })
})
