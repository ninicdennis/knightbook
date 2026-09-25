import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ChangedLineView,
  KnightbookApi,
  ReviewChangesView,
  ReviewView,
} from '../shared/contract.js'
import {
  CHECKOUT,
  TICKET_ID,
  makeApi,
  noBaseline,
  project,
  renderApp,
  ticket,
} from './test-fixtures.js'

/**
 * Changes since review (ticket 5be60610). The view reads only, says plainly when
 * there is nothing to compare against, shows source as text, and a review taken
 * from it names the exact revision it showed.
 */

const STALE: ReviewView = {
  state: 'changed_since_review',
  lastReviewedAt: '2026-09-18T09:00:00Z',
  changeSummary: 'The content changed.',
}

function context(number: number, text = `Line ${number}`): ChangedLineView {
  return { kind: 'context', text, oldNumber: number, newNumber: number, bookkeeping: false }
}

/** A 30-line body with one line changed in the middle, and a status change above it. */
function changed(overrides: Partial<ReviewChangesView> = {}): ReviewChangesView {
  const body: ChangedLineView[] = []
  for (let number = 5; number <= 34; number += 1) {
    if (number === 20) {
      body.push({
        kind: 'removed',
        text: 'Old wording',
        oldNumber: 20,
        newNumber: null,
        bookkeeping: false,
      })
      body.push({
        kind: 'added',
        text: '<img src=x onerror="alert(1)">',
        oldNumber: null,
        newNumber: 20,
        bookkeeping: false,
      })
    } else body.push(context(number))
  }

  return {
    state: 'changed',
    reviewedAt: '2026-09-18T09:00:00Z',
    currentRevision: 'rev-doc',
    unreadableSnapshots: 0,
    substantive: true,
    sections: [
      {
        part: 'metadata',
        added: 1,
        removed: 1,
        lines: [
          context(1, '---'),
          {
            kind: 'removed',
            text: 'status: backlog',
            oldNumber: 2,
            newNumber: null,
            bookkeeping: true,
          },
          { kind: 'added', text: 'status: done', oldNumber: null, newNumber: 2, bookkeeping: true },
          context(3, '---'),
        ],
      },
      { part: 'body', added: 1, removed: 1, lines: body },
    ],
    notes: ['Line endings changed from LF to CRLF.'],
    tooLarge: null,
    ...overrides,
  }
}

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  api.listDocuments = vi.fn().mockResolvedValue({
    ok: true,
    value: {
      documents: [{ path: 'README.md', title: 'README', includedVia: 'README.md', review: STALE }],
      problems: [],
      folderTitles: [],
    },
  })
  api.readDocument = vi.fn().mockResolvedValue({
    ok: true,
    value: { path: 'README.md', content: '# README\n', revision: 'rev-doc', review: STALE },
  })
  api.documentChanges = vi.fn().mockResolvedValue({ ok: true, value: changed() })
  window.knightbook = api
})

async function openDocumentChanges() {
  renderApp()
  await screen.findByText('A ticket')
  await user.click(screen.getByText('Documents'))
  await user.click(await screen.findByRole('radio', { name: 'Changes since review' }))
}

describe('changes since review for a document', () => {
  it('shows the changed line with its numbers and signs, near the top', async () => {
    await openDocumentChanges()

    const removed = (await screen.findByText('Old wording')).closest('tr')!
    expect(within(removed).getByText('20')).toBeTruthy()
    expect(within(removed).getByText('−')).toBeTruthy()
    expect(within(removed).getByText('Removed')).toBeTruthy()
    expect(screen.getByText(/Your review on .+, compared with the file as it is now/)).toBeTruthy()
    expect(screen.getByText('rev-doc')).toBeTruthy()
    expect(api.documentChanges).toHaveBeenCalledWith(CHECKOUT, 'README.md')
  })

  it('folds long unchanged runs and expands them on request', async () => {
    await openDocumentChanges()

    await screen.findByText('Old wording')
    expect(screen.queryByText('Line 8')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Show 12 unchanged lines (5–16)' }))
    expect(screen.getByText('Line 8')).toBeTruthy()
  })

  it('renders untrusted source as text, never as markup', async () => {
    await openDocumentChanges()

    expect(await screen.findByText('<img src=x onerror="alert(1)">')).toBeTruthy()
    expect(document.querySelector('.ps-diff img')).toBeNull()
  })

  it('labels bookkeeping lines and reports changes a line view cannot show', async () => {
    await openDocumentChanges()

    const status = (await screen.findByText('status: done')).closest('tr')!
    expect(within(status).getByText('Added, bookkeeping')).toBeTruthy()
    // One explanation for the section, not a visible label on every line.
    expect(screen.getAllByText(/Dimmed lines are bookkeeping/)).toHaveLength(1)
    expect(within(status).queryByText('bookkeeping')).toBeNull()
    expect(screen.getByText('Line endings changed from LF to CRLF.')).toBeTruthy()
  })

  it('says there is no review to compare against, rather than showing everything as added', async () => {
    api.documentChanges = vi.fn().mockResolvedValue({ ok: true, value: noBaseline() })
    await openDocumentChanges()

    expect(await screen.findByText('No review to compare against')).toBeTruthy()
    expect(document.querySelector('.ps-diff')).toBeNull()
  })

  it('reports unreadable review history instead of hiding it', async () => {
    api.documentChanges = vi
      .fn()
      .mockResolvedValue({ ok: true, value: { ...noBaseline(), unreadableSnapshots: 2 } })
    await openDocumentChanges()

    expect(
      await screen.findByText(/2 review snapshot files for this could not be read/),
    ).toBeTruthy()
  })

  it('explains a comparison that was too large to compute', async () => {
    api.documentChanges = vi.fn().mockResolvedValue({
      ok: true,
      value: changed({ state: 'too_large', sections: [], notes: [], tooLarge: 'It is huge.' }),
    })
    await openDocumentChanges()

    expect(await screen.findByText('Not compared line by line')).toBeTruthy()
    expect(screen.getByText(/It is huge\./)).toBeTruthy()
  })

  it('flags a comparison of content older than the file on screen', async () => {
    api.documentChanges = vi
      .fn()
      .mockResolvedValue({ ok: true, value: changed({ currentRevision: 'rev-older' }) })
    await openDocumentChanges()

    expect(await screen.findByText('The file changed after this comparison was made.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Compare again' }))
    await waitFor(() => expect(api.documentChanges).toHaveBeenCalledTimes(2))
  })

  it('offers no comparison for a document that was never reviewed', async () => {
    api.readDocument = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        path: 'README.md',
        content: '# README\n',
        revision: 'rev-doc',
        review: { state: 'unreviewed', lastReviewedAt: null, changeSummary: null },
      },
    })
    renderApp()
    await screen.findByText('A ticket')
    await user.click(screen.getByText('Documents'))
    await screen.findByRole('button', { name: 'Mark reviewed' })

    expect(screen.queryByRole('radio', { name: 'Changes since review' })).toBeNull()
    expect(api.documentChanges).not.toHaveBeenCalled()
  })

  it('records nothing by being opened', async () => {
    await openDocumentChanges()
    await screen.findByText('Old wording')

    expect(api.reviewDocument).not.toHaveBeenCalled()
  })

  it('reviews exactly the revision it compared', async () => {
    api.reviewDocument = vi.fn().mockResolvedValue({
      ok: true,
      value: { path: 'README.md', content: '# README\n', revision: 'rev-doc', review: STALE },
    })
    await openDocumentChanges()
    await screen.findByText('Old wording')

    await user.click(screen.getByRole('button', { name: 'Mark reviewed' }))
    expect(api.reviewDocument).toHaveBeenCalledWith(CHECKOUT, 'README.md', 'rev-doc')
  })

  it('refreshes and explains when the file changed before the review was recorded', async () => {
    api.reviewDocument = vi.fn().mockResolvedValue({
      ok: false,
      code: 'revision_conflict',
      message: 'The content changed after it was shown to you, so the review was not recorded.',
    })
    await openDocumentChanges()
    await screen.findByText('Old wording')

    await user.click(screen.getByRole('button', { name: 'Mark reviewed' }))
    expect(await screen.findByText(/so the review was not recorded/)).toBeTruthy()
    expect(api.readDocument).toHaveBeenCalledTimes(2)
  })
})

describe('changes since review for a ticket', () => {
  beforeEach(() => {
    api.readProject = vi
      .fn()
      .mockResolvedValue({ ok: true, value: project({ tickets: [ticket({ review: STALE })] }) })
  })

  async function openTicketChanges() {
    renderApp()
    await user.click(await screen.findByText('A ticket'))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('What the author wrote.')
    await user.click(within(dialog).getByRole('radio', { name: 'Changes since review' }))
    return dialog
  }

  it('compares the ticket file and reviews the revision it showed', async () => {
    api.ticketChanges = vi
      .fn()
      .mockResolvedValue({ ok: true, value: changed({ currentRevision: 'rev-1' }) })
    const dialog = await openTicketChanges()

    expect(await within(dialog).findByText('Old wording')).toBeTruthy()
    expect(api.ticketChanges).toHaveBeenCalledWith(CHECKOUT, TICKET_ID)

    await user.click(within(dialog).getByRole('button', { name: 'Mark reviewed again' }))
    expect(api.recordTicketReview).toHaveBeenCalledWith(CHECKOUT, TICKET_ID, '', 'rev-1')
  })

  it('offers no comparison for a ticket that was never reviewed', async () => {
    api.readProject = vi.fn().mockResolvedValue({ ok: true, value: project() })
    renderApp()
    await user.click(await screen.findByText('A ticket'))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('What the author wrote.')

    expect(within(dialog).queryByRole('radio', { name: 'Changes since review' })).toBeNull()
  })

  it('explains a review refused because the ticket moved on', async () => {
    api.ticketChanges = vi
      .fn()
      .mockResolvedValue({ ok: true, value: changed({ currentRevision: 'rev-1' }) })
    api.recordTicketReview = vi.fn().mockResolvedValue({
      ok: false,
      code: 'revision_conflict',
      message: 'conflict',
    })
    const dialog = await openTicketChanges()
    await within(dialog).findByText('Old wording')

    await user.click(within(dialog).getByRole('button', { name: 'Mark reviewed again' }))
    expect(await screen.findByText(/so the review was not recorded/)).toBeTruthy()
  })
})
