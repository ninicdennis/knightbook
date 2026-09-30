import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentListView, KnightbookApi } from '../../shared/contract.js'
import { CHECKOUT, makeApi, renderApp } from '../test/test-fixtures.js'
import { templateContent, titleFromFileName } from './document-templates.js'
import { pathFromFields } from './NewDocumentDialog.js'

/**
 * Creating a document from the Documents view (ticket 6f8476ef). The host has
 * the last word on the path; these cover what the dialog offers, sends, and
 * does after a success or a refusal.
 */

const UNREVIEWED = { state: 'unreviewed', lastReviewedAt: null, changeSummary: null } as const

function listing(paths: string[]): DocumentListView {
  return {
    documents: paths.map((path) => ({
      path,
      title: path,
      includedVia: 'docs',
      review: UNREVIEWED,
    })),
    problems: [],
    folderTitles: [],
  }
}

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  api.listDocuments = vi.fn().mockResolvedValue({ ok: true, value: listing(['docs/guide.md']) })
  api.readDocument = vi.fn().mockImplementation(async (_root: string, path: string) => ({
    ok: true,
    value: { path, content: `# ${path}\n`, revision: 'rev-1', review: UNREVIEWED },
  }))
  window.knightbook = api
})

async function openDialog() {
  renderApp()
  await user.click(await screen.findByText('Documents'))
  await user.click(await screen.findByRole('button', { name: 'New' }))
  return await screen.findByRole('dialog', { name: 'New document' })
}

describe('the new-document dialog', () => {
  it('suggests the folder of the document being read, and says what it will create', async () => {
    const dialog = await openDialog()

    expect(within(dialog).getByLabelText('Folder')).toHaveProperty('value', 'docs')
    await user.type(within(dialog).getByLabelText(/File name/), 'release notes')
    expect(within(dialog).getByText(/Creates docs\/release notes\.md and includes it/)).toBeTruthy()
  })

  it('offers blank and three starting points', async () => {
    const dialog = await openDialog()

    const labels = within(dialog)
      .getAllByRole('radio')
      .map((radio) => radio.closest('label, .mantine-Radio-root')?.textContent ?? '')
    expect(labels.join('|')).toMatch(/Blank.*Project definition.*Specification.*Decision record/)
  })

  it('creates from a template, then shows the new document in the list and the reader', async () => {
    api.createDocument = vi.fn().mockResolvedValue({
      ok: true,
      value: { path: 'docs/choice.md', documents: listing(['docs/choice.md', 'docs/guide.md']) },
    })
    const dialog = await openDialog()
    await user.type(within(dialog).getByLabelText(/File name/), 'choice')
    await user.click(within(dialog).getByRole('radio', { name: /Decision record/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(api.createDocument).toHaveBeenCalled())
    const [root, path, content] = vi.mocked(api.createDocument).mock.calls[0]!
    expect([root, path]).toEqual([CHECKOUT, 'docs/choice.md'])
    expect(content).toMatch(/^# Choice\n\nDate: \d{4}-\d{2}-\d{2}\nStatus: proposed\n/)
    expect(content).toContain('## Consequences')

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New document' })).toBeNull())
    await waitFor(() => expect(api.readDocument).toHaveBeenCalledWith(CHECKOUT, 'docs/choice.md'))
    // The list the host returned is the one shown, with the new document in it.
    expect(document.querySelector('[data-document-path="docs/choice.md"]')).not.toBeNull()
    expect(await screen.findAllByRole('heading', { name: 'docs/choice.md' })).not.toHaveLength(0)
  })

  it('keeps the dialog and the typed name when the host refuses a clash', async () => {
    api.createDocument = vi.fn().mockResolvedValue({
      ok: false,
      code: 'already_exists',
      message: 'docs/guide.md already exists, so nothing was written. Choose another name.',
    })
    const dialog = await openDialog()
    await user.type(within(dialog).getByLabelText(/File name/), 'guide.md')
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))

    expect(await within(dialog).findByRole('alert')).toHaveProperty(
      'textContent',
      'docs/guide.md already exists, so nothing was written. Choose another name.',
    )
    expect(within(dialog).getByLabelText(/File name/)).toHaveProperty('value', 'guide.md')
    expect(api.readDocument).not.toHaveBeenCalledWith(CHECKOUT, 'docs/guide.md.md')
  })

  it('sends a blank document as just its title', async () => {
    api.createDocument = vi.fn().mockResolvedValue({
      ok: true,
      value: { path: 'todo.md', documents: listing(['docs/guide.md', 'todo.md']) },
    })
    const dialog = await openDialog()
    await user.clear(within(dialog).getByLabelText('Folder'))
    await user.type(within(dialog).getByLabelText(/File name/), 'todo')
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))

    await waitFor(() =>
      expect(api.createDocument).toHaveBeenCalledWith(CHECKOUT, 'todo.md', '# Todo\n'),
    )
  })
})

describe('reading the fields as a path', () => {
  it('adds .md, trims slashes, and refuses what is not a name', () => {
    expect(pathFromFields('/docs/', 'notes')).toEqual({ path: 'docs/notes.md' })
    expect(pathFromFields('', 'README.MD')).toEqual({ path: 'README.MD' })
    expect(pathFromFields('docs', '  ')).toHaveProperty('problem')
    expect(pathFromFields('docs', 'a/b.md')).toHaveProperty('problem')
    expect(pathFromFields('docs\\sub', 'b.md')).toHaveProperty('problem')
  })
})

describe('the starting points', () => {
  it('titles a document from its file name', () => {
    expect(titleFromFileName('release-notes.md')).toBe('Release notes')
    expect(titleFromFileName('api_design')).toBe('Api design')
    expect(titleFromFileName('.md')).toBe('Untitled')
  })

  it('gives each template its own headings under the title', () => {
    const project = templateContent('project', 'Site', '2026-09-29')
    expect(project.startsWith('# Site\n\n## Purpose\n')).toBe(true)
    expect(project).toContain('## Scope\n')
    expect(project).toContain('## How we will know it works\n')
    expect(templateContent('specification', 'Sync', '2026-09-29')).toBe(
      '# Sync\n\n## Problem\n\n## Requirements\n\n## Out of scope\n\n## Open questions\n',
    )
    expect(templateContent('decision', 'Use Drizzle', '2026-09-29')).toContain('Date: 2026-09-29\n')
  })
})
