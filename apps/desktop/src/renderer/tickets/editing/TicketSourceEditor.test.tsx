import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi } from '../../../shared/contract.js'
import {
  CHECKOUT,
  TICKET_ID,
  chooseEdit,
  detail,
  makeApi,
  project,
  renderApp,
  ticket,
} from '../../test/test-fixtures.js'

/**
 * Editing a ticket's title and body as Markdown source from the detail view.
 * The host's own checks (no-op writes, CRLF, the revision refusal on real
 * files) are covered in main/tickets/ticket-content-edit.test.ts; this covers
 * what the window sends, keeps and asks.
 */

const BODY = '# A ticket\n\n## Intended outcome\n\nWhat the author wrote.\n'

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  // The editor must save against the revision it read, which here differs from the board's.
  api.readTicket = vi.fn().mockResolvedValue({ ok: true, value: detail({ revision: 'rev-read' }) })
  window.knightbook = api
})

async function openEditor() {
  await user.click(await screen.findByText('A ticket'))
  const dialog = await screen.findByRole('dialog')
  await chooseEdit(user, dialog, 'Title and text')
  return dialog
}

const titleField = (dialog: HTMLElement) =>
  within(dialog).getByLabelText('Title') as HTMLInputElement
const bodyField = (dialog: HTMLElement) =>
  within(dialog).getByLabelText('Body', { exact: false }) as HTMLTextAreaElement

describe('editing a ticket as Markdown source', () => {
  it('shows the title and the body as source, without the frontmatter', async () => {
    renderApp()
    const dialog = await openEditor()

    expect(titleField(dialog).value).toBe('A ticket')
    expect(bodyField(dialog).value).toBe(BODY)
    expect(bodyField(dialog).value).not.toMatch(/^---/)
    expect(bodyField(dialog).value).not.toContain('status:')
  })

  it('saves the edit against the revision it read, then shows the ticket again', async () => {
    renderApp()
    const dialog = await openEditor()

    await user.clear(titleField(dialog))
    await user.type(titleField(dialog), '  Renamed  ')
    await user.type(bodyField(dialog), 'One more line.')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(api.editTicketContent).toHaveBeenCalledWith(
        CHECKOUT,
        TICKET_ID,
        { title: 'Renamed', body: `${BODY}One more line.` },
        'rev-read',
      ),
    )
    expect(await within(dialog).findByRole('button', { name: 'Edit ticket' })).toBeTruthy()
  })

  it.each(['Save', 'Cancel'])('writes nothing on %s when nothing was changed', async (button) => {
    renderApp()
    const dialog = await openEditor()

    await user.click(within(dialog).getByRole('button', { name: button }))

    expect(await within(dialog).findByRole('button', { name: 'Edit ticket' })).toBeTruthy()
    expect(api.editTicketContent).not.toHaveBeenCalled()
  })

  it('refuses to save without a title', async () => {
    renderApp()
    const dialog = await openEditor()

    await user.clear(titleField(dialog))

    expect(within(dialog).getByText('A ticket needs a title.')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true)
  })

  it('hides the moves and other edits while the draft is open', async () => {
    renderApp()
    await user.click(await screen.findByText('A ticket'))
    const dialog = await screen.findByRole('dialog')
    const others = ['Edit ticket', 'Move to', 'Type']
    for (const name of others) expect(within(dialog).getByRole('button', { name })).toBeTruthy()

    await chooseEdit(user, dialog, 'Title and text')

    for (const name of others) expect(within(dialog).queryByRole('button', { name })).toBeNull()
  })
})

describe('a save refused because the ticket changed', () => {
  beforeEach(() => {
    api.editTicketContent = vi
      .fn()
      .mockResolvedValue({ ok: false, code: 'revision_conflict', message: 'stale' })
  })

  it('keeps the draft, says what happened, and reloads the board', async () => {
    renderApp()
    const dialog = await openEditor()

    await user.type(bodyField(dialog), 'My words.')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await within(dialog).findByText(/changed after you started editing/i)).toBeTruthy()
    expect(within(dialog).getByText(/nothing was overwritten/i)).toBeTruthy()
    expect(bodyField(dialog).value).toBe(`${BODY}My words.`)
    expect(api.readProject).toHaveBeenCalledTimes(2)
    // A second save would be refused the same way, so it is not offered.
    expect(within(dialog).queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('loads the current version when the user lets the draft go', async () => {
    // After the refusal the board and the ticket both read back as the version that won.
    api.editTicketContent = vi.fn().mockImplementation(async () => {
      api.readProject = vi.fn().mockResolvedValue({
        ok: true,
        value: project({ tickets: [ticket({ revision: 'rev-2' })] }),
      })
      api.readTicket = vi.fn().mockResolvedValue({
        ok: true,
        value: detail({ revision: 'rev-2', body: '# A ticket\n\nTheir newer wording.\n' }),
      })
      return { ok: false, code: 'revision_conflict', message: 'stale' }
    })
    renderApp()
    const dialog = await openEditor()

    await user.type(bodyField(dialog), 'My words.')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await user.click(
      await within(dialog).findByRole('button', {
        name: 'Discard my edit and load the current version',
      }),
    )

    expect(await within(dialog).findByText('Their newer wording.')).toBeTruthy()
    expect(within(dialog).queryByText(/My words/)).toBeNull()
    expect(api.editTicketContent).toHaveBeenCalledTimes(1)
  })
})

describe('leaving with unsaved text', () => {
  it('asks before closing the dialog, and keeps the draft when told to', async () => {
    renderApp()
    const dialog = await openEditor()
    await user.type(bodyField(dialog), 'Unsaved.')

    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(within(dialog).getByText('Discard your unsaved edit to this ticket?')).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }))

    expect(screen.getByRole('dialog')).toBe(dialog)
    expect(bodyField(dialog).value).toBe(`${BODY}Unsaved.`)
  })

  it('closes after the user confirms, writing nothing', async () => {
    renderApp()
    const dialog = await openEditor()
    await user.type(bodyField(dialog), 'Unsaved.')

    await user.keyboard('{Escape}')
    await user.click(within(dialog).getByRole('button', { name: 'Discard edit' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.editTicketContent).not.toHaveBeenCalled()
  })

  it('asks before Cancel throws the draft away', async () => {
    renderApp()
    const dialog = await openEditor()
    await user.type(titleField(dialog), '!')

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(within(dialog).getByText('Discard your unsaved edit to this ticket?')).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Discard edit' }))

    expect(await within(dialog).findByRole('button', { name: 'Edit ticket' })).toBeTruthy()
    expect(screen.getByRole('dialog')).toBe(dialog)
  })

  it('does not count CRLF line endings, which a text area drops, as an edit', async () => {
    api.readTicket = vi.fn().mockResolvedValue({
      ok: true,
      value: detail({ revision: 'rev-read', body: BODY.replace(/\n/g, '\r\n') }),
    })
    renderApp()
    const dialog = await openEditor()
    // Typing and undoing hands the draft back from the text area, now with LF endings.
    await user.type(bodyField(dialog), 'x{Backspace}')

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(within(dialog).queryByText('Discard your unsaved edit to this ticket?')).toBeNull()
    expect(await within(dialog).findByRole('button', { name: 'Edit ticket' })).toBeTruthy()
  })

  it('closes straight away when nothing was typed', async () => {
    renderApp()
    const dialog = await openEditor()

    await user.click(within(dialog).getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
