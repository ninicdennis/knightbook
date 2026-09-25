import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentListView, KnightbookApi, ReviewView } from '../../shared/contract.js'
import { CHECKOUT, makeApi, renderApp } from '../test/test-fixtures.js'

/**
 * Organizing a project's documents without an AI tool. What matters here is that
 * the app offers exactly what the manifest can express — entries, not individual
 * documents inside a folder — and that "remove" never reads as "delete".
 */

const REVIEWED: ReviewView = {
  state: 'reviewed',
  lastReviewedAt: '2026-09-18T09:00:00Z',
  changeSummary: null,
}

/** README included directly, two documents via a folder, and one entry that has gone. */
function listing(): DocumentListView {
  return {
    documents: [
      { path: 'README.md', title: 'README', includedVia: 'README.md', review: REVIEWED },
      { path: 'docs/design.md', title: 'design', includedVia: 'docs', review: REVIEWED },
      { path: 'docs/notes.md', title: 'notes', includedVia: 'docs', review: REVIEWED },
    ],
    problems: [{ path: 'docs/moved-away.md', reason: 'missing' }],
    folderTitles: [],
  }
}

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  api.listDocuments = vi.fn().mockResolvedValue({ ok: true, value: listing() })
  api.readDocument = vi.fn().mockResolvedValue({
    ok: true,
    value: { path: 'README.md', content: '# README\n', revision: 'rev-doc', review: REVIEWED },
  })
  window.knightbook = api
})

async function openDocuments() {
  renderApp()
  await screen.findByText('A ticket')
  await user.click(screen.getByText('Documents'))
  await screen.findByText('Included from')
}

describe('the included-documents list', () => {
  it('lists manifest entries with what each one contributes', async () => {
    await openDocuments()

    expect(screen.getByText('1 document')).toBeTruthy()
    expect(screen.getByText('2 documents')).toBeTruthy()
  })

  it('shows an entry that no longer resolves rather than dropping it quietly', async () => {
    await openDocuments()

    expect(screen.getByText('docs/moved-away.md')).toBeTruthy()
    expect(screen.getByText('no longer exists')).toBeTruthy()
    expect(screen.getByLabelText('Remove docs/moved-away.md from this workspace')).toBeTruthy()
  })

  it('offers no removal for a document that has no entry of its own', async () => {
    await openDocuments()

    // design.md is included through the docs folder, so removing it alone is not
    // something the manifest can express.
    expect(screen.queryByLabelText('Remove docs/design.md from this workspace')).toBeNull()
    expect(screen.getByLabelText('Remove docs from this workspace')).toBeTruthy()
  })
})

describe('removing an entry', () => {
  it('confirms first, and says the files stay on disk', async () => {
    await openDocuments()
    await user.click(screen.getByLabelText('Remove docs from this workspace'))

    expect(
      screen.getByText(
        /takes 2 documents out of the workspace.*stay exactly where they are on disk/,
      ),
    ).toBeTruthy()
    expect(api.removeDocumentEntry).not.toHaveBeenCalled()
  })

  it('removes the entry the manifest holds, not the document path', async () => {
    api.removeDocumentEntry = vi.fn().mockResolvedValue({
      ok: true,
      value: { documents: [listing().documents[0]!], problems: [], folderTitles: [] },
    })
    await openDocuments()

    await user.click(screen.getByLabelText('Remove docs from this workspace'))
    await user.click(screen.getByRole('button', { name: 'Remove the entry' }))

    expect(api.removeDocumentEntry).toHaveBeenCalledWith(CHECKOUT, 'docs')
    await waitFor(() => expect(screen.queryByText('2 documents')).toBeNull())
  })

  it('keeps the entry and explains when the host refuses', async () => {
    api.removeDocumentEntry = vi.fn().mockResolvedValue({
      ok: false,
      code: 'not_found',
      message: 'docs is not included in this workspace.',
    })
    await openDocuments()

    await user.click(screen.getByLabelText('Remove docs from this workspace'))
    await user.click(screen.getByRole('button', { name: 'Remove the entry' }))

    expect(await screen.findByText('docs is not included in this workspace.')).toBeTruthy()
    expect(screen.getByText('2 documents')).toBeTruthy()
  })
})

describe('including documents', () => {
  it('includes files in place and shows what the manifest now holds', async () => {
    const withExtra = listing()
    withExtra.documents.push({
      path: 'CONTRIBUTING.md',
      title: 'CONTRIBUTING',
      includedVia: 'CONTRIBUTING.md',
      review: REVIEWED,
    })
    api.includeDocumentFiles = vi.fn().mockResolvedValue({ ok: true, value: withExtra })

    await openDocuments()
    await user.click(screen.getByRole('button', { name: 'Include' }))
    await user.click(await screen.findByText('Markdown files…'))

    expect(api.includeDocumentFiles).toHaveBeenCalledWith(CHECKOUT)
    // As a document to read, and as the manifest entry that can be removed again.
    const nav = screen.getByRole('navigation', { name: 'Documents' })
    await waitFor(() =>
      expect(within(nav).getByRole('button', { name: /^CONTRIBUTING/ })).toBeTruthy(),
    )
    expect(screen.getByText('CONTRIBUTING.md')).toBeTruthy()
  })

  it('offers folders as their own action, because one dialog cannot do both', async () => {
    api.includeDocumentFolder = vi.fn().mockResolvedValue({ ok: true, value: listing() })

    await openDocuments()
    await user.click(screen.getByRole('button', { name: 'Include' }))
    await user.click(await screen.findByText('A folder…'))

    expect(api.includeDocumentFolder).toHaveBeenCalledWith(CHECKOUT)
  })
})
