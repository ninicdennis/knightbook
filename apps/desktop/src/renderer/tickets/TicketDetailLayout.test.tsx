import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi } from '../../shared/contract.js'
import { TICKET_ID, detail, makeApi, project, renderApp, ticket } from '../test/test-fixtures.js'

/**
 * How the ticket dialog is put together, rather than what it says.
 *
 * The complaint behind this was concrete: the actions sat after the Markdown
 * body, so a long ticket had to be scrolled to the end before anything could be
 * done with it. What these tests protect is that the dialog stays in three
 * parts, and that the parts that must never scroll away do not.
 *
 * Actual heights, wrapping and overlap are layout, which jsdom does not compute.
 * Those were checked in a browser against the preview and are recorded on the
 * ticket.
 */

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  window.knightbook = api
})

/** The scrolling region, which is Mantine's modal body. */
function scrollRegion(dialog: HTMLElement): HTMLElement {
  const body = dialog.querySelector<HTMLElement>('[class*="Modal-body"]')
  if (!body) throw new Error('The dialog has no body region.')
  return body
}

async function openDetail(title = 'A ticket') {
  await user.click(await screen.findByText(title))
  return await screen.findByRole('dialog')
}

describe('the parts of the dialog', () => {
  it('keeps the actions out of the region that scrolls', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({ tickets: [ticket({ status: 'verification' })] }),
    })
    renderApp()
    const dialog = await openDetail()
    await within(dialog).findByText('What the author wrote.')

    const body = scrollRegion(dialog)
    for (const name of [/move to/i, /mark content reviewed/i, /accept as done/i]) {
      const action = within(dialog).getByRole('button', { name })
      expect(body.contains(action)).toBe(false)
    }
    // And the written content is inside it, so it is the part that scrolls.
    expect(body.querySelector('.markdown-body')).toBeTruthy()
  })

  it('keeps the title, its status, and Close out of that region too', async () => {
    renderApp()
    const dialog = await openDetail()
    await within(dialog).findByText('What the author wrote.')

    const body = scrollRegion(dialog)
    // Level 2 is the dialog's own title; the ticket body has its own headings.
    const heading = within(dialog).getByRole('heading', { level: 2, name: 'A ticket' })
    const close = within(dialog).getByRole('button', { name: /close/i })

    expect(body.contains(heading)).toBe(false)
    expect(body.contains(close)).toBe(false)
    expect(body.contains(within(dialog).getByText('Backlog'))).toBe(false)
    expect(body.contains(within(dialog).getByText('Unreviewed'))).toBe(false)
  })

  it('shows a long title in full rather than cutting it down', async () => {
    const long =
      'Implement the safe write path, including the temporary file, the rename, ' +
      'and the revision check that refuses a stale write'
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({ tickets: [ticket({ title: long })] }),
    })
    api.readTicket = vi.fn().mockResolvedValue({ ok: true, value: detail({ title: long }) })
    renderApp()
    const dialog = await openDetail(long)

    expect(within(dialog).getByRole('heading', { level: 2, name: long }).textContent).toBe(long)
    expect(within(dialog).getByRole('button', { name: /close/i })).toBeTruthy()
  })
})

describe('the action bar at a readable width', () => {
  async function inVerification() {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({ tickets: [ticket({ status: 'verification' })] }),
    })
    renderApp()
    return await openDetail()
  }

  it('shows the bookkeeping controls as icons, still named', async () => {
    const dialog = await inVerification()

    for (const name of [/move to/i, /^type$/i, /mark content reviewed/i]) {
      const control = within(dialog).getByRole('button', { name })
      // Named for a screen reader and a tooltip, with no words taking up room:
      // five labelled controls wrap onto a second row even in a wide window.
      expect(control.textContent).toBe('')
    }
  })

  it('keeps the words on the two decisions, which must not be guessed at', async () => {
    const dialog = await inVerification()

    expect(within(dialog).getByRole('button', { name: /did not pass/i }).textContent).toMatch(
      /Did not pass/,
    )
    expect(within(dialog).getByRole('button', { name: /accept as done/i }).textContent).toMatch(
      /Accept as done/,
    )
  })

  it('says that the icon controls open a menu, and when one is open', async () => {
    const dialog = await inVerification()
    const type = within(dialog).getByRole('button', { name: /^type$/i })

    expect(type.getAttribute('aria-haspopup')).toBe('menu')
    expect(type.getAttribute('aria-expanded')).toBe('false')

    await user.click(type)
    await screen.findByRole('menu')
    expect(type.getAttribute('aria-expanded')).toBe('true')
  })
})

describe('the secondary sections', () => {
  it('names each related document in full, one control per document', async () => {
    const long = 'docs/decisions/0017-a-prerequisite-that-failed-verification-keeps-its-own.md'
    api.readTicket = vi.fn().mockResolvedValue({
      ok: true,
      value: detail({ relatedDocuments: ['README.md', long] }),
    })
    renderApp()
    const dialog = await openDetail()

    // The full path is the accessible name: nothing is elided into a tooltip.
    expect(await within(dialog).findByRole('button', { name: long })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'README.md' })).toBeTruthy()
  })

  it('lists the audit values as labelled rows, with the revision in full', async () => {
    api.readTicket = vi.fn().mockResolvedValue({
      ok: true,
      value: detail({ revision: 'c529ec7d74b9aa35ba9b5ab2bf9784ac' }),
    })
    renderApp()
    const dialog = await openDetail()

    await within(dialog).findByText('Record details')
    expect(within(dialog).getByText('Created')).toBeTruthy()
    expect(within(dialog).getByText('Updated')).toBeTruthy()
    // A conflict message names the revision, so the whole value has to be here.
    expect(within(dialog).getByText('c529ec7d74b9aa35ba9b5ab2bf9784ac')).toBeTruthy()
  })

  it('says when the content was last reviewed', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({
        tickets: [
          ticket({
            review: {
              state: 'reviewed',
              lastReviewedAt: '2026-09-18T14:00:00Z',
              changeSummary: null,
            },
          }),
        ],
      }),
    })
    renderApp()
    const dialog = await openDetail()

    expect(await within(dialog).findByText('Last reviewed')).toBeTruthy()
  })

  it('leaves that row out rather than inventing a date for unreviewed content', async () => {
    renderApp()
    const dialog = await openDetail()

    await within(dialog).findByText('Record details')
    expect(within(dialog).queryByText('Last reviewed')).toBeNull()
  })
})

describe('where focus goes when the dialog closes', () => {
  /** The card's own control, which is what the dialog hands focus back to. */
  function cardHandle() {
    const handle = document.querySelector<HTMLElement>(`[data-ticket-handle="${TICKET_ID}"]`)
    if (!handle) throw new Error('The card has no handle to return focus to.')
    return handle
  }

  it('hands focus back to the card after Escape', async () => {
    renderApp()
    await openDetail()
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(cardHandle())
  })

  it('hands focus back to the card after Close', async () => {
    renderApp()
    const dialog = await openDetail()
    await user.click(within(dialog).getByRole('button', { name: /close/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(cardHandle())
  })

  it('does not steal focus from the dialog that replaces it', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({ tickets: [ticket({ status: 'verification' })] }),
    })
    renderApp()
    const dialog = await openDetail()

    // Accepting hands over to the confirmation, which is what must hold focus.
    await user.click(within(dialog).getByRole('button', { name: /accept as done/i }))

    const confirmation = await screen.findByRole('dialog')
    await waitFor(() => expect(confirmation.contains(document.activeElement)).toBe(true))
  })
})
