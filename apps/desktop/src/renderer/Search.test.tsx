import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi, TicketSearchView } from '../shared/contract.js'
import { CHECKOUT, makeApi, project, renderApp, ticket } from './test-fixtures.js'

/**
 * Finding a ticket by what is written in it. The behaviour worth protecting is
 * that a body-only match is findable at all, that the shortcut never interrupts
 * typing, and that ticket text reaching the results is rendered as text.
 */

const IMPORTER = '22222222-2222-4222-8222-222222222222'
const REPORT = '33333333-3333-4333-8333-333333333333'

function answer(overrides: Partial<TicketSearchView> = {}): TicketSearchView {
  return {
    checkoutPath: CHECKOUT,
    query: 'import',
    hits: [
      {
        id: IMPORTER,
        title: 'Import dated records',
        status: 'verification',
        type: 'bug',
        titleHighlights: [{ start: 0, length: 6 }],
        excerpt: null,
        excerptHighlights: [],
        archivedAt: null,
      },
      {
        id: REPORT,
        title: 'Summarize records by week',
        status: 'backlog',
        type: null,
        titleHighlights: [],
        excerpt: 'Reads from the importer output.',
        excerptHighlights: [{ start: 15, length: 6 }],
        archivedAt: null,
      },
    ],
    totalMatches: 2,
    unsearchable: [],
    ...overrides,
  }
}

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  api.readProject = vi.fn().mockResolvedValue({
    ok: true,
    value: project({
      tickets: [
        ticket({ id: IMPORTER, title: 'Import dated records', status: 'verification' }),
        ticket({ id: REPORT, title: 'Summarize records by week' }),
      ],
    }),
  })
  window.knightbook = api
})

async function openSearch() {
  renderApp()
  await screen.findByText('Import dated records')
  await user.click(screen.getByRole('button', { name: /search tickets/i }))
  return await screen.findByRole('textbox', { name: 'Search tickets' })
}

describe('opening search', () => {
  it('opens from the header control and from the keyboard shortcut', async () => {
    const input = await openSearch()
    expect(input).toBeTruthy()

    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Search tickets' })).toBeNull(),
    )

    await user.keyboard('{Control>}k{/Control}')
    expect(await screen.findByRole('textbox', { name: 'Search tickets' })).toBeTruthy()
  })

  it('says what it searches before anything is typed, rather than listing everything', async () => {
    await openSearch()

    expect(screen.getByText(/Searches ticket titles and everything written in them/)).toBeTruthy()
    expect(api.searchTickets).not.toHaveBeenCalled()
  })

  it('leaves the shortcut alone while the user is typing', async () => {
    renderApp()
    await screen.findByText('Import dated records')

    // The reason box on a failed verification is the case that matters: opening
    // a dialog over it would throw the typed reason away.
    await user.click(screen.getByLabelText('Actions for Import dated records'))
    await user.click(await screen.findByText('Did not pass verification…'))
    const reason = screen.getByLabelText('Reason')
    await user.type(reason, 'Dates are off')
    await user.keyboard('{Control>}k{/Control}')

    expect(screen.queryByRole('textbox', { name: 'Search tickets' })).toBeNull()
    expect((reason as HTMLTextAreaElement).value).toBe('Dates are off')
  })
})

describe('results', () => {
  it('finds a ticket by text that only appears in its body', async () => {
    api.searchTickets = vi.fn().mockResolvedValue({ ok: true, value: answer() })
    await openSearch()
    await user.type(screen.getByRole('textbox', { name: 'Search tickets' }), 'import')

    const options = await screen.findAllByRole('option')
    expect(options).toHaveLength(2)
    // The body-only match shows its context, which is the only way to tell why
    // a ticket whose title does not contain the query came back.
    // textContent, because the match inside it is wrapped in its own element.
    expect(options[1]!.textContent).toContain('Reads from the importer output.')
  })

  it('marks matches as text, so a ticket containing markup cannot inject any', async () => {
    api.searchTickets = vi.fn().mockResolvedValue({
      ok: true,
      value: answer({
        hits: [
          {
            id: IMPORTER,
            title: '<img src=x onerror=alert(1)> import',
            status: 'backlog',
            type: null,
            titleHighlights: [{ start: 29, length: 6 }],
            excerpt: null,
            excerptHighlights: [],
            archivedAt: null,
          },
        ],
        totalMatches: 1,
      }),
    })
    await openSearch()
    await user.type(screen.getByRole('textbox', { name: 'Search tickets' }), 'import')

    const option = await screen.findByRole('option')
    expect(option.textContent).toContain('<img src=x onerror=alert(1)>')
    expect(option.querySelector('img')).toBeNull()
    // The matched part is marked, and the marking came from offsets, not markup.
    expect(option.querySelector('mark')?.textContent).toBe('import')
  })

  it('says when a ticket file could not be searched, so it cannot look like no match', async () => {
    api.searchTickets = vi.fn().mockResolvedValue({
      ok: true,
      value: answer({
        hits: [],
        totalMatches: 0,
        unsearchable: [{ file: '.projectspace/tickets/broken.md', reason: 'Conflict markers.' }],
      }),
    })
    await openSearch()
    await user.type(screen.getByRole('textbox', { name: 'Search tickets' }), 'import')

    expect(await screen.findByText(/1 ticket file could not be read/)).toBeTruthy()
  })

  it('says how many matches were withheld rather than silently cutting the list', async () => {
    api.searchTickets = vi.fn().mockResolvedValue({ ok: true, value: answer({ totalMatches: 34 }) })
    await openSearch()
    await user.type(screen.getByRole('textbox', { name: 'Search tickets' }), 'import')

    expect(await screen.findByText(/Showing 2 of 34 matches/)).toBeTruthy()
  })

  it('reports a failed search instead of showing an empty result', async () => {
    api.searchTickets = vi
      .fn()
      .mockResolvedValue({ ok: false, code: 'not_found', message: 'That project is gone.' })
    await openSearch()
    await user.type(screen.getByRole('textbox', { name: 'Search tickets' }), 'import')

    expect(await screen.findByText(/That project is gone\./)).toBeTruthy()
    expect(screen.queryByRole('option')).toBeNull()
  })

  it('discards a reply to a query the user has already moved on from', async () => {
    api.searchTickets = vi.fn().mockImplementation(async (_root: string, query: string) => ({
      ok: true,
      // The host answers a different question than the one now on screen.
      value: answer({ query: `${query}-stale` }),
    }))
    await openSearch()
    await user.type(screen.getByRole('textbox', { name: 'Search tickets' }), 'import')

    await waitFor(() => expect(api.searchTickets).toHaveBeenCalled())
    expect(screen.queryByRole('option')).toBeNull()
  })
})

describe('keyboard use', () => {
  it('moves through results and opens the highlighted one', async () => {
    api.searchTickets = vi.fn().mockResolvedValue({ ok: true, value: answer() })
    await openSearch()
    await user.type(screen.getByRole('textbox', { name: 'Search tickets' }), 'import')
    await screen.findAllByRole('option')

    // The first result starts highlighted, so Enter alone opens it.
    await user.keyboard('{ArrowDown}')
    expect(screen.getAllByRole('option')[1]!.getAttribute('aria-selected')).toBe('true')

    await user.keyboard('{Enter}')
    expect(await screen.findByRole('dialog', { name: 'Summarize records by week' })).toBeTruthy()
  })

  it('wraps around rather than stopping at the end', async () => {
    api.searchTickets = vi.fn().mockResolvedValue({ ok: true, value: answer() })
    await openSearch()
    await user.type(screen.getByRole('textbox', { name: 'Search tickets' }), 'import')
    await screen.findAllByRole('option')

    await user.keyboard('{ArrowUp}')
    expect(screen.getAllByRole('option')[1]!.getAttribute('aria-selected')).toBe('true')
  })

  it('gives focus back to the window when closed', async () => {
    const input = await openSearch()
    expect(document.activeElement).toBe(input)

    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Search tickets' })).toBeNull(),
    )
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /search tickets/i }))
  })
})
