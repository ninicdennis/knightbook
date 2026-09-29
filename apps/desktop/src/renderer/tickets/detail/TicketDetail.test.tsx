import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi } from '../../../shared/contract.js'
import {
  CHECKOUT,
  TICKET_ID,
  detail,
  makeApi,
  project,
  renderApp,
  ticket,
} from '../../test/test-fixtures.js'

/**
 * The ticket detail view. It came from the user's first real session with the app:
 * ticket text written through MCP could not be read anywhere in it.
 *
 * Whether a click opens the dialog while a drag does not depends on the drag
 * library's pointer handling, which jsdom cannot exercise. That was checked in a
 * real browser instead.
 */

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  window.knightbook = api
})

async function openDetail(title = 'A ticket') {
  await user.click(await screen.findByText(title))
  return await screen.findByRole('dialog')
}

describe('opening the detail view', () => {
  it('opens on a click and shows what was written, rendered', async () => {
    renderApp()
    const dialog = await openDetail()

    expect(await within(dialog).findByRole('heading', { name: 'Intended outcome' })).toBeTruthy()
    expect(within(dialog).getByText('What the author wrote.')).toBeTruthy()
    expect(api.readTicket).toHaveBeenCalledWith(CHECKOUT, TICKET_ID)
  })

  it('treats the body as untrusted, exactly like a document', async () => {
    api.readTicket = vi.fn().mockResolvedValue({
      ok: true,
      value: detail({
        body: 'Safe text\n\n<script>window.__pwned = true</script>\n\n<img src=x onerror="window.__pwned = true">\n',
      }),
    })
    renderApp()
    const dialog = await openDetail()

    await within(dialog).findByText('Safe text')
    expect(dialog.querySelector('script')).toBeNull()
    expect(dialog.querySelector('[onerror]')).toBeNull()
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined()
  })

  it('does not open when the card menu button is clicked', async () => {
    renderApp()
    await screen.findByText('A ticket')
    await user.click(screen.getByRole('button', { name: /actions for a ticket/i }))

    expect(await screen.findByRole('menu')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not open when a move is chosen from the menu', async () => {
    api.setTicketStatus = vi.fn().mockResolvedValue({
      ok: true,
      value: project({ tickets: [ticket({ status: 'in_progress' })] }),
    })
    renderApp()
    await screen.findByText('A ticket')
    await user.click(screen.getByRole('button', { name: /actions for a ticket/i }))
    await user.click(within(await screen.findByRole('menu')).getByText('In progress'))

    await waitFor(() => expect(api.setTicketStatus).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is reachable from the keyboard through the card menu', async () => {
    renderApp()
    await screen.findByText('A ticket')
    await user.click(screen.getByRole('button', { name: /actions for a ticket/i }))
    await user.click(within(await screen.findByRole('menu')).getByText('View details'))

    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('closes on Escape', async () => {
    renderApp()
    await openDetail()
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('what the detail view says about a ticket', () => {
  it('names each prerequisite, its status, and whether it satisfies the dependency', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({
        tickets: [
          ticket({
            dependencyReady: false,
            dependencyNotes: ['waiting on "Safe writes", which is in_progress'],
          }),
        ],
      }),
    })
    api.readTicket = vi.fn().mockResolvedValue({
      ok: true,
      value: detail({
        dependencies: [
          {
            id: 'd1',
            title: 'Safe writes',
            status: 'in_progress',
            satisfied: false,
            unreadable: false,
          },
          { id: 'd2', title: 'Schema', status: 'verification', satisfied: true, unreadable: false },
          { id: 'd3', title: null, status: null, satisfied: false, unreadable: false },
        ],
      }),
    })
    renderApp()
    const dialog = await openDetail()

    await within(dialog).findByText('Safe writes')
    expect(within(dialog).getByText('is not ready yet')).toBeTruthy()
    expect(within(dialog).getByText('Schema')).toBeTruthy()
    expect(within(dialog).getByText('satisfies this dependency')).toBeTruthy()
    // A reference to a ticket that does not exist is said out loud, not skipped.
    expect(within(dialog).getByText('No ticket with id d3')).toBeTruthy()
    expect(within(dialog).getByText('is missing from this project')).toBeTruthy()
    expect(within(dialog).getByText(/waiting on "Safe writes"/)).toBeTruthy()
  })

  it('shows the blocker text', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({ tickets: [ticket({ blocker: 'Waiting on an upstream release.' })] }),
    })
    renderApp()
    const dialog = await openDetail()

    expect(within(dialog).getByText('Waiting on an upstream release.')).toBeTruthy()
  })

  it('separates a completion an AI recorded from one the user made', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({
        tickets: [
          ticket({
            status: 'done',
            completion: {
              decisionSource: 'reported_user_instruction',
              recordedBy: 'agent',
              recordedAt: '2026-09-19T10:00:00Z',
              instruction: 'User confirmed it in chat.',
            },
          }),
        ],
      }),
    })
    renderApp()
    const dialog = await openDetail()

    expect(within(dialog).getByText(/recorded by an ai tool on your instruction/i)).toBeTruthy()
    expect(within(dialog).getByText(/User confirmed it in chat\./)).toBeTruthy()
    expect(within(dialog).getByText(/it did not decide this itself/i)).toBeTruthy()
  })

  it('flags a Done ticket that has no recorded decision', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({ tickets: [ticket({ status: 'done', completionUnattributed: true })] }),
    })
    renderApp()
    const dialog = await openDetail()

    expect(within(dialog).getByText(/no recorded decision/i)).toBeTruthy()
  })

  it('says so when the ticket cannot be read, and leaves the board alone', async () => {
    api.readTicket = vi.fn().mockResolvedValue({
      ok: false,
      code: 'not_found',
      message: 'That ticket no longer exists in this project.',
    })
    renderApp()
    const dialog = await openDetail()

    expect(await within(dialog).findByText(/could not read this ticket/i)).toBeTruthy()
    expect(within(dialog).getByText(/no longer exists/i)).toBeTruthy()
    expect(within(dialog).getByText(/nothing was changed/i)).toBeTruthy()
  })
})

describe('acting from the detail view', () => {
  it('moves a ticket and gets out of the way', async () => {
    api.setTicketStatus = vi.fn().mockResolvedValue({
      ok: true,
      value: project({ tickets: [ticket({ status: 'in_progress' })] }),
    })
    renderApp()
    const dialog = await openDetail()

    await user.click(within(dialog).getByRole('button', { name: /move to/i }))
    await user.click(within(await screen.findByRole('menu')).getByText('In progress'))

    await waitFor(() =>
      expect(api.setTicketStatus).toHaveBeenCalledWith(CHECKOUT, TICKET_ID, 'in_progress', 'rev-1'),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('offers no Done in its move menu', async () => {
    renderApp()
    const dialog = await openDetail()

    await user.click(within(dialog).getByRole('button', { name: /move to/i }))
    expect(within(await screen.findByRole('menu')).queryByText('Done')).toBeNull()
  })

  it('records a review and stays open with the new state', async () => {
    api.recordTicketReview = vi.fn().mockResolvedValue({
      ok: true,
      value: project({
        tickets: [
          ticket({
            review: {
              state: 'reviewed',
              lastReviewedAt: '2026-09-19T12:00:00Z',
              changeSummary: null,
            },
          }),
        ],
      }),
    })
    renderApp()
    const dialog = await openDetail()
    await within(dialog).findByText('What the author wrote.')

    await user.click(within(dialog).getByRole('button', { name: /mark content reviewed/i }))

    await waitFor(() =>
      // The dialog names the revision whose body it displayed.
      expect(api.recordTicketReview).toHaveBeenCalledWith(
        CHECKOUT,
        TICKET_ID,
        '',
        detail().revision,
      ),
    )
    expect(screen.getByRole('dialog')).toBeTruthy()
    await waitFor(() =>
      expect(
        within(screen.getByRole('dialog')).queryByRole('button', {
          name: /mark content reviewed/i,
        }),
      ).toBeNull(),
    )
    expect(within(screen.getByRole('dialog')).getByText(/reviewed by you/i)).toBeTruthy()
    // The dialog re-read the ticket rather than trusting its earlier copy.
    expect((api.readTicket as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1)
  })

  it('hands completion to the confirmation, which still asks first', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({ tickets: [ticket({ status: 'verification' })] }),
    })
    renderApp()
    const dialog = await openDetail()

    await user.click(within(dialog).getByRole('button', { name: /accept as done/i }))

    expect(await screen.findByText(/records that you accepted the work/i)).toBeTruthy()
    expect(api.completeTicket).not.toHaveBeenCalled()
    // Only one dialog at a time: the detail view stepped aside.
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })
})

describe('following a document from a ticket', () => {
  const SPEC = 'docs/spec.md'

  function documentApi() {
    api.listDocuments = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        documents: [
          {
            path: SPEC,
            title: 'spec',
            includedVia: 'docs',
            review: { state: 'unreviewed', lastReviewedAt: null, changeSummary: null },
          },
        ],
        problems: [],
        folderTitles: [],
      },
    })
    api.readDocument = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        path: SPEC,
        content: '# The specification\n',
        revision: 'doc-rev',
        review: { state: 'unreviewed', lastReviewedAt: null, changeSummary: null },
      },
    })
  }

  it('opens a related document in the Documents view', async () => {
    documentApi()
    api.readTicket = vi.fn().mockResolvedValue({
      ok: true,
      value: detail({ relatedDocuments: [SPEC] }),
    })
    renderApp()
    const dialog = await openDetail()

    await user.click(await within(dialog).findByRole('button', { name: SPEC }))

    await waitFor(() => expect(api.readDocument).toHaveBeenCalledWith(CHECKOUT, SPEC))
    expect(await screen.findByRole('heading', { name: 'The specification' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens a document linked from inside the ticket body', async () => {
    documentApi()
    // Relative to where the ticket file really is, .projectspace/tickets/, the
    // way any Markdown editor reads the same link.
    api.readTicket = vi.fn().mockResolvedValue({
      ok: true,
      value: detail({ body: 'See [the spec](../../docs/spec.md) first.' }),
    })
    renderApp()
    const dialog = await openDetail()

    await user.click(await within(dialog).findByRole('link', { name: 'the spec' }))

    expect(api.resolveLink).toHaveBeenCalledWith(CHECKOUT, SPEC)
    await waitFor(() => expect(api.readDocument).toHaveBeenCalledWith(CHECKOUT, SPEC))
  })
})
