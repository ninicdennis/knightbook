import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi } from '../shared/contract.js'
import { makeApi, project, renderApp, ticket, TICKET_ID } from './test-fixtures.js'

/**
 * A keyboard-only pass over the two controls that change a ticket's recorded
 * state: the card menu and the completion dialog.
 *
 * Drag-and-drop is pointer-only, so the card menu is the whole of a keyboard
 * user's board. The other suites reach that menu with `user.click`, which proves
 * the menu works but says nothing about whether it can be reached or driven
 * without a mouse. Nothing here clicks: every step is Tab, an arrow key, Enter or
 * Escape, and a step that cannot be performed that way is a failure.
 */

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  /*
   * These tests carry a move all the way through, and the app replaces the board
   * with whatever the mutation returns. The shared fixture leaves them returning
   * undefined, which the app cannot read, so each one answers with the board it
   * would produce.
   */
  api.setTicketStatus = vi.fn().mockResolvedValue({
    ok: true,
    value: project({ tickets: [ticket({ status: 'in_progress' })] }),
  })
  api.completeTicket = vi.fn().mockResolvedValue({
    ok: true,
    value: project({ tickets: [ticket({ status: 'done' })] }),
  })
  window.knightbook = api
})

/** Tabs forward until the named control holds focus, or gives up and says so. */
async function tabTo(name: RegExp, limit = 30): Promise<HTMLElement> {
  const wanted = screen.getByRole('button', { name })
  for (let step = 0; step < limit; step++) {
    if (document.activeElement === wanted) return wanted
    await user.tab()
  }
  throw new Error(
    `${limit} presses of Tab never reached ${String(name)}. ` +
      `Focus stopped on ${document.activeElement?.outerHTML.slice(0, 120) ?? 'nothing'}.`,
  )
}

/**
 * Walks the open menu with ArrowDown until the wanted item has focus. Counting
 * presses instead would break every time a menu item is added, which is exactly
 * the sort of brittleness that gets a keyboard test deleted rather than fixed.
 */
async function arrowTo(label: string, limit = 15): Promise<void> {
  const menu = await screen.findByRole('menu')
  for (let step = 0; step < limit; step++) {
    if (document.activeElement?.textContent?.trim() === label) return
    await user.keyboard('{ArrowDown}')
  }
  const offered = within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent?.trim())
  throw new Error(`No menu item called "${label}". The menu offers: ${offered.join(', ')}.`)
}

describe('the card menu without a mouse', () => {
  it('is reachable with Tab and opens with Enter', async () => {
    renderApp()
    await screen.findByText('A ticket')

    await tabTo(/actions for a ticket/i)
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('menu')).toBeTruthy()
  })

  it('moves a ticket using only arrow keys and Enter', async () => {
    renderApp()
    await screen.findByText('A ticket')

    await tabTo(/actions for a ticket/i)
    await user.keyboard('{Enter}')
    await arrowTo('In progress')
    await user.keyboard('{Enter}')

    await waitFor(() =>
      expect(api.setTicketStatus).toHaveBeenCalledWith(
        expect.anything(),
        TICKET_ID,
        'in_progress',
        expect.anything(),
      ),
    )
  })

  it('closes on Escape without changing anything', async () => {
    renderApp()
    await screen.findByText('A ticket')

    await tabTo(/actions for a ticket/i)
    await user.keyboard('{Enter}')
    await screen.findByRole('menu')
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(api.setTicketStatus).not.toHaveBeenCalled()
  })
})

describe('the completion dialog without a mouse', () => {
  // Only a ticket in Verification offers "Accept as done" on its card menu.
  beforeEach(() => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({ tickets: [ticket({ status: 'verification' })] }),
    })
  })

  /** Opens the dialog the way a keyboard user must: menu, arrows, Enter. */
  async function openDialog(): Promise<HTMLElement> {
    renderApp()
    await screen.findByText('A ticket')

    await tabTo(/actions for a ticket/i)
    await user.keyboard('{Enter}')
    await arrowTo('Accept as done')
    await user.keyboard('{Enter}')

    return await screen.findByRole('dialog')
  }

  it('opens from the card menu and explains what is being recorded', async () => {
    const dialog = await openDialog()

    expect(within(dialog).getByText(/records that you accepted the work/i)).toBeTruthy()
  })

  it('records the completion from Enter on the confirming button', async () => {
    const dialog = await openDialog()

    // Mantine moves focus into the dialog; Tab from there reaches its buttons.
    const accept = within(dialog).getByRole('button', { name: 'Accept as done' })
    for (let step = 0; step < 10 && document.activeElement !== accept; step++) await user.tab()
    expect(document.activeElement).toBe(accept)

    await user.keyboard('{Enter}')

    await waitFor(() => expect(api.completeTicket).toHaveBeenCalled())
  })

  it('records nothing when Escape dismisses it', async () => {
    await openDialog()
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // An accidental Escape must never leave a completion decision behind.
    expect(api.completeTicket).not.toHaveBeenCalled()
  })
})
