import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentListView, KnightbookApi, ReviewView } from '../shared/contract.js'
import { makeApi, renderApp } from './test-fixtures.js'

/**
 * The Documents workspace's states and its narrow layout. A failure must read as
 * a failure, never as an empty workspace, and on a narrow window the list and
 * the reader take turns without losing the keyboard user's place.
 */

const UNREVIEWED: ReviewView = { state: 'unreviewed', lastReviewedAt: null, changeSummary: null }

function listing(): DocumentListView {
  return {
    documents: [
      { path: 'README.md', title: 'README', includedVia: 'README.md', review: UNREVIEWED },
      { path: 'docs/design.md', title: 'design', includedVia: 'docs', review: UNREVIEWED },
    ],
    problems: [],
  }
}

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>
const realMatchMedia = window.matchMedia

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  api.listDocuments = vi.fn().mockResolvedValue({ ok: true, value: listing() })
  api.readDocument = vi.fn(async (_root: string, path: string) => ({
    ok: true as const,
    value: { path, content: `# ${path}\n`, revision: 'rev', review: UNREVIEWED },
  }))
  window.knightbook = api
})

afterEach(() => {
  window.matchMedia = realMatchMedia
})

async function openDocuments() {
  renderApp()
  await screen.findByText('A ticket')
  await user.click(screen.getByText('Documents'))
}

/** Makes the narrow-layout media query match, as it would below 48em. */
function useNarrowWindow() {
  window.matchMedia = ((query: string) => ({
    ...realMatchMedia(query),
    matches: query.includes('max-width: 47.99em'),
  })) as typeof window.matchMedia
}

describe('documents states', () => {
  it('says the list could not be read, instead of showing an empty workspace', async () => {
    api.listDocuments = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, code: 'io_error', message: 'The manifest is locked.' })
      .mockResolvedValue({ ok: true, value: listing() })
    await openDocuments()

    expect(await screen.findByText('The document list could not be read')).toBeTruthy()
    expect(screen.getByText('The manifest is locked.')).toBeTruthy()
    expect(screen.queryByText('No documents included yet')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: /design/ })).toBeTruthy()
  })

  it('says one document could not be opened and offers to try again', async () => {
    api.readDocument = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, code: 'not_found', message: 'README.md is gone.' })
      .mockResolvedValue({
        ok: true,
        value: { path: 'README.md', content: '# Back again\n', revision: 'r', review: UNREVIEWED },
      })
    await openDocuments()

    expect(await screen.findByText('This document could not be opened')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Back again' })).toBeTruthy()
  })

  it('marks the selected document and says which are not reviewed', async () => {
    await openDocuments()
    const nav = await screen.findByRole('navigation', { name: 'Documents' })

    const readme = within(nav).getByRole('button', { name: /^README README\.md/ })
    await waitFor(() => expect(readme.getAttribute('aria-current')).toBe('true'))
    expect(within(readme).getByText('Not reviewed')).toBeTruthy()
  })
})

describe('the narrow layout', () => {
  it('shows the list first, then the reader with a way back', async () => {
    useNarrowWindow()
    await openDocuments()

    const nav = await screen.findByRole('navigation', { name: 'Documents' })
    expect(screen.queryByRole('button', { name: 'All documents' })).toBeNull()

    await user.click(within(nav).getByRole('button', { name: /design/ }))

    const title = await screen.findByRole('heading', { level: 2, name: 'design' })
    expect(document.activeElement).toBe(title)
    expect(screen.queryByRole('navigation', { name: 'Documents' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'All documents' }))

    const back = await screen.findByRole('navigation', { name: 'Documents' })
    const design = within(back).getByRole('button', { name: /design/ })
    expect(document.activeElement).toBe(design)
    expect(design.getAttribute('aria-current')).toBe('true')
  })
})
