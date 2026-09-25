import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi } from '../shared/contract.js'
import type { DocumentSearchView } from '../shared/document-search-contract.js'
import { CHECKOUT, makeApi, renderApp } from './test-fixtures.js'

/**
 * The document half of the header search. Tickets and documents are separate
 * answers, so these cover each one failing or coming back empty on its own, and
 * a document result opening in the Documents view rather than as a ticket.
 */

function documents(query: string, overrides: Partial<DocumentSearchView> = {}) {
  return {
    ok: true as const,
    value: {
      checkoutPath: CHECKOUT,
      query,
      hits: [
        {
          path: 'docs/architecture.md',
          title: 'architecture',
          titleHighlights: [],
          excerpt: 'The parser owns record validation.',
          excerptHighlights: [{ start: 4, length: 6 }],
        },
      ],
      totalMatches: 1,
      unsearchable: [],
      ...overrides,
    },
  }
}

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  // Answers the question asked, as the host does; the default fixture echoes
  // an empty query, which the dialog rightly discards as someone else's answer.
  api.searchTickets = vi.fn().mockImplementation(async (_root: string, query: string) => ({
    ok: true,
    value: { checkoutPath: CHECKOUT, query, hits: [], totalMatches: 0, unsearchable: [] },
  }))
  // Opening a result shows the document, so there has to be one to read.
  api.readDocument = vi.fn(async (_root: string, path: string) => ({
    ok: true as const,
    value: {
      path,
      content: `# ${path}\n`,
      revision: 'rev',
      review: { state: 'unreviewed' as const, lastReviewedAt: null, changeSummary: null },
    },
  }))
  window.knightbook = api
})

async function search(text: string) {
  renderApp()
  await screen.findByText('A ticket')
  await user.click(screen.getByRole('button', { name: /search tickets and documents/i }))
  await user.type(
    await screen.findByRole('textbox', { name: 'Search tickets and documents' }),
    text,
  )
}

describe('searching documents from the header', () => {
  it('lists matching documents under their own heading, with the match marked', async () => {
    api.searchDocuments = vi.fn().mockResolvedValue(documents('parser'))
    await search('parser')

    const group = await screen.findByRole('group', { name: 'Documents' })
    expect(within(group).getByText('architecture')).toBeTruthy()
    expect(within(group).getByText('docs/architecture.md')).toBeTruthy()
    expect(group.querySelector('mark')?.textContent).toBe('parser')
    expect(api.searchDocuments).toHaveBeenCalledWith(CHECKOUT, 'parser')
  })

  it('opens a chosen document in the Documents view', async () => {
    api.searchDocuments = vi.fn().mockResolvedValue(documents('parser'))
    await search('parser')

    await user.click(await screen.findByRole('option', { name: /architecture/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() =>
      expect(api.readDocument).toHaveBeenCalledWith(CHECKOUT, 'docs/architecture.md'),
    )
  })

  it('reaches documents from the keyboard after the tickets', async () => {
    api.searchDocuments = vi.fn().mockResolvedValue(documents('parser'))
    await search('parser')
    await screen.findByRole('option', { name: /architecture/ })

    await user.keyboard('{Enter}')
    await waitFor(() =>
      expect(api.readDocument).toHaveBeenCalledWith(CHECKOUT, 'docs/architecture.md'),
    )
  })

  it('says no document matched, separately from the tickets', async () => {
    await search('nothing like this')

    expect(await screen.findByText('No document contains “nothing like this”.')).toBeTruthy()
    expect(screen.getByText('No ticket contains “nothing like this”.')).toBeTruthy()
  })

  it('keeps ticket results when only the document search failed, and says which failed', async () => {
    api.searchDocuments = vi
      .fn()
      .mockResolvedValue({ ok: false, code: 'io_error', message: 'The manifest is unreadable.' })
    await search('nothing like this')

    expect(
      await screen.findByText(/Documents could not be searched: The manifest is unreadable\./),
    ).toBeTruthy()
    expect(screen.getByText('No ticket contains “nothing like this”.')).toBeTruthy()
    expect(screen.queryByText(/No document contains/)).toBeNull()
  })

  it('says when a document could not be read, so it cannot look like no match', async () => {
    api.searchDocuments = vi
      .fn()
      .mockResolvedValue(documents('parser', { unsearchable: ['docs/locked.md'] }))
    await search('parser')

    expect(await screen.findByText(/1 document could not be read/)).toBeTruthy()
  })

  it('does not search documents in the Archived scope, and says why', async () => {
    await search('parser')
    // The Active search, documents included, has answered first.
    await screen.findByRole('group', { name: 'Documents' })
    expect(api.searchDocuments).toHaveBeenCalledTimes(1)

    await user.click(screen.getByText('Archived'))

    expect(await screen.findByText(/Documents are never archived/)).toBeTruthy()
    await waitFor(() =>
      expect(vi.mocked(api.searchTickets).mock.calls.at(-1)?.[2]).toBe('archived'),
    )
    expect(api.searchDocuments).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('group', { name: 'Documents' })).toBeNull()
  })
})
