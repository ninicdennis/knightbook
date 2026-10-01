import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi, LinkDestinationView, ProjectView } from '../../shared/contract.js'
import type { RememberedProject } from '../../shared/project-setup-contract.js'
import {
  REMEMBERED,
  chooseEdit,
  TICKET_ID,
  detail,
  makeApi,
  project,
  renderApp,
  ticket,
} from '../test/test-fixtures.js'

/**
 * Back and forward through documents, tickets and views, like a browser (ticket
 * 855c3054). History is session state: it changes nothing on disk, is cleared on
 * switching project, and steps over places that no longer exist.
 */

const UNREVIEWED = { state: 'unreviewed', lastReviewedAt: null, changeSummary: null } as const
const DOCS = ['README.md', 'docs/guide.md']
const SECOND = 'C:\\projects\\second'

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>
let board: ProjectView
let resolvable: Set<string>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  board = project({ tickets: [ticket({ title: 'Write the guide' })] })
  resolvable = new Set(DOCS)
  api.readProject = vi.fn().mockImplementation(async (path: string) => ({
    ok: true,
    value: path === SECOND ? project({ name: 'Second', checkoutPath: SECOND }) : board,
  }))
  api.rememberedProjects = vi
    .fn()
    .mockResolvedValue([
      REMEMBERED,
      { path: SECOND, name: 'Second', unavailable: null } satisfies RememberedProject,
    ])
  api.listDocuments = vi.fn().mockResolvedValue({
    ok: true,
    value: {
      documents: DOCS.map((path) => ({ path, title: path, includedVia: path, review: UNREVIEWED })),
      problems: [],
      folderTitles: [],
    },
  })
  api.readDocument = vi.fn().mockImplementation(async (_root: string, path: string) => ({
    ok: true,
    value: { path, content: `# About ${path}\n`, revision: 'r', review: UNREVIEWED },
  }))
  api.resolveLink = vi.fn().mockImplementation(async (_root: string, path: string) => ({
    ok: true,
    value: (resolvable.has(path)
      ? { kind: 'document', path }
      : {
          kind: 'unavailable',
          reason: 'not_included',
          message: `${path} is not one of this project's documents.`,
        }) satisfies LinkDestinationView,
  }))
  api.readTicket = vi
    .fn()
    .mockResolvedValue({ ok: true, value: detail({ title: 'Write the guide' }) })
  window.knightbook = api
})

const back = () => screen.getByRole('button', { name: 'Back' })
const forward = () => screen.getByRole('button', { name: 'Forward' })
const heading = (path: string) => screen.findByRole('heading', { name: `About ${path}` })
const isDisabled = (button: HTMLElement) => button.hasAttribute('disabled')

/** Board → Documents (README) → guide. */
async function visitTwoDocuments() {
  renderApp()
  await screen.findByText('Write the guide')
  await user.click(screen.getByRole('tab', { name: 'Documents' }))
  await heading('README.md')
  const guide = document.querySelector<HTMLElement>('[data-document-path="docs/guide.md"]')
  if (!guide) throw new Error('The guide is not listed')
  await user.click(guide)
  await heading('docs/guide.md')
}

describe('back and forward', () => {
  it('starts with nowhere to go', async () => {
    renderApp()
    await screen.findByText('Write the guide')
    expect(isDisabled(back())).toBe(true)
    expect(isDisabled(forward())).toBe(true)
  })

  it('goes back through documents and views, and forward again', async () => {
    await visitTwoDocuments()

    await user.click(back())
    expect(await heading('README.md')).toBeTruthy()
    await user.click(back())
    expect(await screen.findByText('Write the guide')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Board' }).getAttribute('aria-selected')).toBe('true')

    await user.click(forward())
    expect(await heading('README.md')).toBeTruthy()
    await user.click(forward())
    expect(await heading('docs/guide.md')).toBeTruthy()
    expect(isDisabled(forward())).toBe(true)
  })

  it('discards the forward steps when the user goes somewhere new', async () => {
    await visitTwoDocuments()
    await user.click(back())
    await heading('README.md')
    expect(isDisabled(forward())).toBe(false)

    await user.click(screen.getByRole('tab', { name: 'Plans' }))
    await waitFor(() => expect(isDisabled(forward())).toBe(true))
  })

  it('closes a ticket opened from the board, and reopens it going forward', async () => {
    renderApp()
    await user.click(await screen.findByText('Write the guide'))
    expect(await screen.findByRole('dialog')).toBeTruthy()

    fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.keyDown(window, { key: 'ArrowRight', altKey: true })
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('follows the mouse side buttons', async () => {
    await visitTwoDocuments()

    fireEvent.mouseUp(window, { button: 3 })
    expect(await heading('README.md')).toBeTruthy()
    fireEvent.mouseUp(window, { button: 4 })
    expect(await heading('docs/guide.md')).toBeTruthy()
  })

  it('leaves the keys to a text field being typed in', async () => {
    await visitTwoDocuments()
    await user.click(screen.getByRole('button', { name: /Search tickets and documents/ }))
    const field = await screen.findByRole('textbox')

    fireEvent.keyDown(field, { key: 'ArrowLeft', altKey: true })
    await user.keyboard('{Escape}')
    expect(screen.getByRole('heading', { name: 'About docs/guide.md' })).toBeTruthy()
  })

  it('does not act while another dialog is asking something', async () => {
    await visitTwoDocuments()
    await user.click(screen.getByRole('button', { name: /Search tickets and documents/ }))
    await screen.findByRole('textbox')

    fireEvent.mouseUp(window, { button: 3 })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('heading', { name: 'About docs/guide.md' })).toBeTruthy()
  })
})

describe('places that are gone', () => {
  it('skips a document that is no longer included, says so, and forgets it', async () => {
    await visitTwoDocuments()
    await user.click(screen.getByRole('tab', { name: 'Board' }))
    resolvable.delete('docs/guide.md')

    await user.click(back())
    expect(await heading('README.md')).toBeTruthy()
    expect(
      screen.getByText(
        /Skipped a place in history\. docs\/guide\.md is not one of this project's documents\./,
      ),
    ).toBeTruthy()

    // The stale place is not offered again going forward.
    await user.click(forward())
    expect(await screen.findByText('Write the guide')).toBeTruthy()
  })

  it('skips a ticket that has since been archived', async () => {
    renderApp()
    await user.click(await screen.findByText('Write the guide'))
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await user.click(screen.getByRole('tab', { name: 'Plans' }))

    // Refresh finds the ticket archived.
    board = project({
      tickets: [],
      archivedTickets: [
        ticket({ id: TICKET_ID, title: 'Write the guide', archivedAt: '2026-09-30' }),
      ],
    })
    await user.click(screen.getByRole('button', { name: /Refresh/ }))
    await waitFor(() => expect(api.readProject).toHaveBeenCalledTimes(2))

    await user.click(back()) // board, ticket closed: fine
    await user.click(back()) // board with the ticket open: archived, skipped
    expect(await screen.findByText(/"Write the guide" has been archived\./)).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('a ticket that is gone', () => {
  it('is skipped with a message when it was deleted', async () => {
    renderApp()
    await user.click(await screen.findByText('Write the guide'))
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await user.click(screen.getByRole('tab', { name: 'Plans' }))

    board = project({ tickets: [] })
    await user.click(screen.getByRole('button', { name: /Refresh/ }))
    await waitFor(() => expect(api.readProject).toHaveBeenCalledTimes(2))

    await user.click(back()) // board, ticket closed: fine
    await user.click(back()) // board with the deleted ticket open: skipped
    expect(await screen.findByText(/A ticket there no longer exists\./)).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('a ticket being edited', () => {
  it('keeps the draft: Back and Forward wait until the edit is saved or cancelled', async () => {
    renderApp()
    await user.click(await screen.findByText('Write the guide'))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByRole('button', { name: 'Edit ticket' })
    await chooseEdit(user, dialog, 'Title and text')
    const title = within(dialog).getByLabelText('Title') as HTMLInputElement
    await user.type(title, ' draft')

    fireEvent.mouseUp(window, { button: 3 })
    fireEvent.keyDown(document.body, { key: 'ArrowLeft', altKey: true })

    // Give a step the chance to run, then check nothing moved.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.getByRole('dialog')).toBe(dialog)
    expect(title.value).toBe('Write the guide draft')
  })
})

describe('what history does not do', () => {
  it('changes nothing on disk', async () => {
    await visitTwoDocuments()
    await user.click(back())
    await user.click(forward())

    expect(api.setTicketStatus).not.toHaveBeenCalled()
    expect(api.recordTicketReview).not.toHaveBeenCalled()
    expect(api.saveSettings).not.toHaveBeenCalled()
    expect(api.includeDocumentFiles).not.toHaveBeenCalled()
    expect(api.includeDocumentFolder).not.toHaveBeenCalled()
  })

  it('is cleared when another project opens', async () => {
    await visitTwoDocuments()
    await user.click(screen.getByRole('button', { name: 'Demo' }))
    const menu = await screen.findByRole('dialog')
    await user.click(within(menu).getByRole('button', { name: /switch to second/i }))

    await waitFor(() => expect(api.readProject).toHaveBeenLastCalledWith(SECOND))
    await waitFor(() => expect(isDisabled(back())).toBe(true))
    expect(isDisabled(forward())).toBe(true)
  })
})
