import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentListView, KnightbookApi, ReviewView } from '../shared/contract.js'
import { ancestorFolders, buildDocumentTree } from './document-tree.js'
import { CHECKOUT, makeApi, renderApp } from './test-fixtures.js'

/**
 * Documents grouped into their real folders. The tree is derived from paths,
 * a folder's title is only a label, collapsing is local view state, and a
 * document that is opened is never left hidden inside a collapsed folder.
 */

const REVIEWED: ReviewView = {
  state: 'reviewed',
  lastReviewedAt: '2026-09-18T09:00:00Z',
  changeSummary: null,
}

const doc = (path: string) => ({
  path,
  title: path.split('/').pop()!.replace(/\.md$/, ''),
  includedVia: path.split('/')[0]!,
  review: REVIEWED,
})

function listing(overrides: Partial<DocumentListView> = {}): DocumentListView {
  return {
    documents: [doc('README.md'), doc('docs/guide.md'), doc('docs/experiments/notes.md')],
    problems: [],
    folderTitles: [{ path: 'docs', title: 'Documentation', missing: false }],
    ...overrides,
  }
}

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  window.localStorage.clear()
  user = userEvent.setup()
  api = makeApi()
  api.listDocuments = vi.fn().mockResolvedValue({ ok: true, value: listing() })
  api.readDocument = vi.fn(async (_root: string, path: string) => ({
    ok: true as const,
    value: { path, content: `# ${path}\n`, revision: 'rev', review: REVIEWED },
  }))
  window.knightbook = api
})

afterEach(() => window.localStorage.clear())

async function openDocuments() {
  renderApp()
  await screen.findByText('A ticket')
  await user.click(screen.getByText('Documents'))
  return await screen.findByRole('navigation', { name: 'Documents' })
}

describe('the folder tree', () => {
  it('nests documents in their folders, showing a title beside the real name', async () => {
    const nav = await openDocuments()

    const docs = within(nav).getByRole('button', { name: /^Documentation docs/ })
    expect(docs.getAttribute('aria-expanded')).toBe('true')
    const group = document.getElementById(docs.getAttribute('aria-controls')!)!
    expect(within(group).getByRole('button', { name: /^guide/ })).toBeTruthy()
    expect(within(group).getByRole('button', { name: /^experiments/ })).toBeTruthy()
    // A root file stays directly reachable, outside any folder.
    expect(within(nav).getByRole('button', { name: /^README/ })).toBeTruthy()
  })

  it('collapses and expands a folder, and remembers it for this project', async () => {
    const nav = await openDocuments()
    const docs = within(nav).getByRole('button', { name: /^Documentation docs/ })

    await user.click(docs)
    expect(docs.getAttribute('aria-expanded')).toBe('false')
    expect(within(nav).queryByRole('button', { name: /^guide/ })).toBeNull()
    expect(
      JSON.parse(window.localStorage.getItem(`knightbook.documents.collapsed:${CHECKOUT}`)!),
    ).toEqual(['docs'])

    await user.click(docs)
    expect(within(nav).getByRole('button', { name: /^guide/ })).toBeTruthy()
  })

  it('opens the folders above a document that is selected while they are collapsed', async () => {
    window.localStorage.setItem(
      `knightbook.documents.collapsed:${CHECKOUT}`,
      JSON.stringify(['docs', 'docs/experiments']),
    )
    // With no root document, the first document selected is inside docs/experiments.
    api.listDocuments = vi.fn().mockResolvedValue({
      ok: true,
      value: listing({ documents: [doc('docs/experiments/notes.md')] }),
    })
    const nav = await openDocuments()

    const notes = await within(nav).findByRole('button', { name: /^notes/ })
    await waitFor(() => expect(notes.getAttribute('aria-current')).toBe('true'))
  })

  it('works from the keyboard', async () => {
    const nav = await openDocuments()
    const docs = within(nav).getByRole('button', { name: /^Documentation docs/ })

    docs.focus()
    await user.keyboard('{Enter}')
    expect(docs.getAttribute('aria-expanded')).toBe('false')
    await user.keyboard(' ')
    expect(docs.getAttribute('aria-expanded')).toBe('true')
  })
})

describe('naming a folder', () => {
  it('saves the title and shows what the manifest now says', async () => {
    api.setDocumentFolderTitle = vi.fn().mockResolvedValue({
      ok: true,
      value: listing({
        folderTitles: [
          { path: 'docs', title: 'Documentation', missing: false },
          { path: 'docs/experiments', title: 'Experiments', missing: false },
        ],
      }),
    })
    const nav = await openDocuments()

    await user.click(within(nav).getByRole('button', { name: 'Name the folder docs/experiments' }))
    const dialog = await screen.findByRole('dialog', { name: 'Folder title' })
    expect(within(dialog).getByText(/not renamed or moved/)).toBeTruthy()
    await user.type(within(dialog).getByRole('textbox', { name: 'Title' }), 'Experiments{Enter}')

    expect(api.setDocumentFolderTitle).toHaveBeenCalledWith(
      CHECKOUT,
      'docs/experiments',
      'Experiments',
    )
    expect(
      await within(nav).findByRole('button', { name: /^Experiments experiments/ }),
    ).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Folder title' })).toBeNull())
  })

  it('clears a title with null', async () => {
    api.setDocumentFolderTitle = vi
      .fn()
      .mockResolvedValue({ ok: true, value: listing({ folderTitles: [] }) })
    const nav = await openDocuments()

    await user.click(within(nav).getByRole('button', { name: 'Name the folder docs' }))
    await user.click(await screen.findByRole('button', { name: 'Clear title' }))

    expect(api.setDocumentFolderTitle).toHaveBeenCalledWith(CHECKOUT, 'docs', null)
    expect(await within(nav).findByRole('button', { name: /^docs$/ })).toBeTruthy()
  })

  it('keeps the dialog open with the reason when the save is refused', async () => {
    api.setDocumentFolderTitle = vi.fn().mockResolvedValue({
      ok: false,
      code: 'not_found',
      message: 'No such folder in this project: docs/experiments',
    })
    const nav = await openDocuments()

    await user.click(within(nav).getByRole('button', { name: 'Name the folder docs/experiments' }))
    const dialog = await screen.findByRole('dialog', { name: 'Folder title' })
    await user.type(within(dialog).getByRole('textbox', { name: 'Title' }), 'Experiments{Enter}')

    expect(await within(dialog).findByText(/No such folder/)).toBeTruthy()
  })
})

describe('a title whose folder is gone', () => {
  it('is shown, kept, and cleared only when asked', async () => {
    api.listDocuments = vi.fn().mockResolvedValue({
      ok: true,
      value: listing({ folderTitles: [{ path: 'old', title: 'Archive', missing: true }] }),
    })
    api.setDocumentFolderTitle = vi
      .fn()
      .mockResolvedValue({ ok: true, value: listing({ folderTitles: [] }) })
    const nav = await openDocuments()

    const stale = within(nav).getByRole('region', { name: 'Titles for missing folders' })
    expect(within(stale).getByText(/“Archive” · old/)).toBeTruthy()
    expect(api.setDocumentFolderTitle).not.toHaveBeenCalled()

    await user.click(within(stale).getByRole('button', { name: 'Clear the title for old' }))
    expect(api.setDocumentFolderTitle).toHaveBeenCalledWith(CHECKOUT, 'old', null)
  })
})

describe('building the tree', () => {
  it('puts folders before documents and keeps same-named files apart by folder', () => {
    const tree = buildDocumentTree(
      [doc('b.md'), doc('docs/README.md'), doc('README.md'), doc('a/README.md')],
      [],
    )
    expect(
      tree.map((node) => (node.kind === 'folder' ? `${node.path}/` : node.document.path)),
    ).toEqual(['a/', 'docs/', 'b.md', 'README.md'])
  })

  it('lists the folders above a document, outermost first', () => {
    expect(ancestorFolders('docs/deep/notes.md')).toEqual(['docs', 'docs/deep'])
    expect(ancestorFolders('README.md')).toEqual([])
  })
})
