import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentReadView, KnightbookApi, LinkDestinationView } from '../shared/contract.js'
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
 * Following links between documents and tickets (ticket db7cff48). Links resolve
 * from the file they are written in, the host decides what a path is, and a link
 * that goes nowhere says why where the reader clicked.
 */

const OTHER_ID = '22222222-2222-4222-8222-222222222222'
const UNREVIEWED = { state: 'unreviewed', lastReviewedAt: null, changeSummary: null } as const

const DOCUMENTS: Record<string, string> = {
  'README.md': [
    '# README',
    '',
    'Read [the design notes](docs/design.md#open-questions).',
    `Or [the ticket](.projectspace/tickets/${TICKET_ID}.md).`,
    'Or [a draft](drafts/idea.md) or [the site](https://example.com).',
  ].join('\n'),
  'docs/design.md': '# Design\n\n## Background\n\nText.\n\n## Open questions\n\nMore text.\n',
}

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

function documentView(path: string): DocumentReadView {
  return { path, content: DOCUMENTS[path] ?? '', revision: `rev-${path}`, review: UNREVIEWED }
}

function destination(value: LinkDestinationView) {
  return { ok: true, value }
}

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  api.readProject = vi.fn().mockResolvedValue({
    ok: true,
    value: project({
      tickets: [ticket(), ticket({ id: OTHER_ID, title: 'Another ticket', revision: 'rev-2' })],
    }),
  })
  api.listDocuments = vi.fn().mockResolvedValue({
    ok: true,
    value: {
      documents: Object.keys(DOCUMENTS).map((path) => ({
        path,
        title: path,
        includedVia: path,
        review: UNREVIEWED,
      })),
      problems: [],
    },
  })
  api.readDocument = vi.fn().mockImplementation(async (_root: string, path: string) => ({
    ok: true,
    value: documentView(path),
  }))
  api.resolveLink = vi.fn().mockImplementation(async (_root: string, path: string) => {
    const ticketFile = /^\.projectspace\/tickets\/(.+)\.md$/.exec(path)
    if (ticketFile) return destination({ kind: 'ticket', id: ticketFile[1]! })
    if (path in DOCUMENTS) return destination({ kind: 'document', path })
    return destination({
      kind: 'unavailable',
      reason: 'not_included',
      message: `${path} is not one of this project's documents.`,
    })
  })
  window.knightbook = api
})

async function openReadme() {
  renderApp()
  await screen.findByText('A ticket')
  await user.click(screen.getByText('Documents'))
  await screen.findByRole('heading', { name: 'README' })
}

async function openTicket(body: string) {
  api.readTicket = vi.fn().mockImplementation(async (_root: string, id: string) => ({
    ok: true,
    value:
      id === OTHER_ID
        ? detail({ id: OTHER_ID, title: 'Another ticket', body: '# Another\n\nIts own text.\n' })
        : detail({ body }),
  }))
  renderApp()
  await user.click(await screen.findByText('A ticket'))
  const dialog = await screen.findByRole('dialog')
  await within(dialog).findAllByRole('link')
  return dialog
}

describe('from a document', () => {
  it('opens another document at the linked heading, with a way back', async () => {
    await openReadme()
    await user.click(screen.getByRole('link', { name: 'the design notes' }))

    const heading = await screen.findByRole('heading', { name: 'Open questions' })
    expect(api.resolveLink).toHaveBeenCalledWith(CHECKOUT, 'docs/design.md')
    await waitFor(() => expect(document.activeElement).toBe(heading))

    await user.click(screen.getByRole('button', { name: 'Back to README.md' }))
    expect(await screen.findByRole('heading', { name: 'README' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Back to/ })).toBeNull()
  })

  it('opens a linked ticket over the documents, with a way back', async () => {
    api.readTicket = vi.fn().mockResolvedValue({ ok: true, value: detail() })
    await openReadme()
    await user.click(screen.getByRole('link', { name: 'the ticket' }))

    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('What the author wrote.')).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Back to README.md' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await screen.findByRole('heading', { name: 'README' })).toBeTruthy()
  })

  it('says why a link to a document outside the workspace did not open', async () => {
    await openReadme()
    await user.click(screen.getByRole('link', { name: 'a draft' }))

    expect(
      await screen.findByText("drafts/idea.md is not one of this project's documents."),
    ).toBeTruthy()
    expect(api.readDocument).not.toHaveBeenCalledWith(CHECKOUT, 'drafts/idea.md')
    expect(api.includeDocumentFiles).not.toHaveBeenCalled()
  })

  it('shows why an external link could not be opened', async () => {
    api.openExternalLink = vi
      .fn()
      .mockResolvedValue({ ok: false, code: 'unexpected_error', message: 'No browser.' })
    await openReadme()
    await user.click(screen.getByRole('link', { name: 'the site' }))

    expect(api.openExternalLink).toHaveBeenCalledWith('https://example.com')
    expect(await screen.findByText('The link could not be opened: No browser.')).toBeTruthy()
  })

  it('follows a link from the keyboard', async () => {
    await openReadme()
    screen.getByRole('link', { name: 'the design notes' }).focus()
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('heading', { name: 'Open questions' })).toBeTruthy()
  })

  it('ignores a slow answer once another link has been followed', async () => {
    let answerFirst: (value: unknown) => void = () => {}
    api.resolveLink = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (answerFirst = resolve)))
      .mockImplementation(async (_root: string, path: string) =>
        destination({ kind: 'document', path }),
      )
    await openReadme()

    await user.click(screen.getByRole('link', { name: 'the design notes' }))
    await user.click(screen.getByRole('link', { name: 'a draft' }))
    await waitFor(() => expect(api.readDocument).toHaveBeenCalledWith(CHECKOUT, 'drafts/idea.md'))
    answerFirst(destination({ kind: 'document', path: 'docs/design.md' }))

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(api.readDocument).not.toHaveBeenCalledWith(CHECKOUT, 'docs/design.md')
  })
})

describe('from a ticket', () => {
  it('opens a document written relative to the ticket file', async () => {
    const dialog = await openTicket('See [the notes](../../docs/design.md).')
    await user.click(within(dialog).getByRole('link', { name: 'the notes' }))

    expect(api.resolveLink).toHaveBeenCalledWith(CHECKOUT, 'docs/design.md')
    expect(await screen.findByRole('heading', { name: 'Design' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back to A ticket' })).toBeTruthy()
  })

  it('opens a sibling ticket in place of this one, with a way back', async () => {
    const dialog = await openTicket(`Depends on [the other one](${OTHER_ID}.md).`)
    await user.click(within(dialog).getByRole('link', { name: 'the other one' }))

    expect(api.resolveLink).toHaveBeenCalledWith(CHECKOUT, `.projectspace/tickets/${OTHER_ID}.md`)
    const next = await screen.findByRole('dialog')
    expect(await within(next).findByText('Its own text.')).toBeTruthy()

    await user.click(within(next).getByRole('button', { name: 'Back to A ticket' }))
    expect(await within(await screen.findByRole('dialog')).findByRole('link')).toBeTruthy()
  })

  it('jumps to a heading in the same ticket, and says when one is missing', async () => {
    const dialog = await openTicket(
      '[jump](#acceptance-criteria) or [nowhere](#missing)\n\n## Acceptance criteria\n\n- One.\n',
    )
    await user.click(within(dialog).getByRole('link', { name: 'jump' }))
    const heading = within(dialog).getByRole('heading', { name: 'Acceptance criteria' })
    expect(document.activeElement).toBe(heading)
    expect(api.resolveLink).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('link', { name: 'nowhere' }))
    expect(await within(dialog).findByText(/There is no heading “missing” here/)).toBeTruthy()
  })

  it('says why a related document did not open, and keeps the ticket open', async () => {
    api.readTicket = vi.fn().mockResolvedValue({
      ok: true,
      value: detail({ relatedDocuments: ['drafts/idea.md'] }),
    })
    renderApp()
    await user.click(await screen.findByText('A ticket'))
    const dialog = await screen.findByRole('dialog')
    await user.click(await within(dialog).findByRole('button', { name: 'drafts/idea.md' }))

    expect(
      await within(dialog).findByText("drafts/idea.md is not one of this project's documents."),
    ).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})
