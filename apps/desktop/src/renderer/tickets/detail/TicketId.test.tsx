import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi } from '../../../shared/contract.js'
import { TICKET_ID, makeApi, renderApp } from '../../test/test-fixtures.js'

/**
 * A ticket's id is how it is named everywhere outside the board, so it has to
 * be readable and copyable from the dialog, and the copy has to be whole.
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

describe("a ticket's id in its dialog", () => {
  it('shows the short form, and names the whole id on the copy control', async () => {
    renderApp()
    const dialog = await openDetail()

    expect(within(dialog).getByText(TICKET_ID.slice(0, 8))).toBeTruthy()
    const copy = within(dialog).getByRole('button', { name: /copy the full ticket id/i })
    expect(copy.getAttribute('aria-label')).toContain(TICKET_ID)
  })

  it('copies the whole id, not the part shown, and confirms it', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    renderApp()
    const dialog = await openDetail()

    await user.click(within(dialog).getByRole('button', { name: /copy the full ticket id/i }))

    expect(writeText).toHaveBeenCalledWith(TICKET_ID)
    expect(await navigator.clipboard.readText()).toBe(TICKET_ID)
    await waitFor(() =>
      expect(
        within(dialog).getByRole('button', { name: 'Copied the full ticket id' }),
      ).toBeTruthy(),
    )
  })

  it('is reachable from the keyboard', async () => {
    renderApp()
    const dialog = await openDetail()
    const copy = within(dialog).getByRole('button', { name: /copy the full ticket id/i })

    copy.focus()
    await user.keyboard('{Enter}')

    expect(await navigator.clipboard.readText()).toBe(TICKET_ID)
  })

  it('says so when the clipboard refused, rather than claiming it copied', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    renderApp()
    const dialog = await openDetail()

    await user.click(within(dialog).getByRole('button', { name: /copy the full ticket id/i }))

    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/could not be copied/i)
    expect(within(dialog).queryByRole('button', { name: /^copied/i })).toBeNull()
  })

  it('stays below the title in the header', async () => {
    renderApp()
    const dialog = await openDetail()
    const header = dialog.querySelector('header')!
    const text = header.textContent ?? ''

    expect(text.indexOf('A ticket')).toBeLessThan(text.indexOf(TICKET_ID.slice(0, 8)))
  })
})
