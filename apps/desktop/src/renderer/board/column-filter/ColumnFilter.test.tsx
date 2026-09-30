import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi, ProjectView } from '../../../shared/contract.js'
import { CHECKOUT, makeApi, project, renderApp, ticket } from '../../test/test-fixtures.js'

/**
 * Filtering one board column by type and condition (ticket 0addbe6b). The
 * filter is view state for one column: it must never change another column,
 * write to the project, or let a hidden card look missing.
 */

const ids = {
  bug: 'c1000000-0000-4000-8000-000000000001',
  feature: 'c1000000-0000-4000-8000-000000000002',
  untyped: 'c1000000-0000-4000-8000-000000000003',
  blocked: 'c1000000-0000-4000-8000-000000000004',
  doing: 'c1000000-0000-4000-8000-000000000005',
}

function board(overrides: Partial<ProjectView> = {}): ProjectView {
  return project({
    tickets: [
      ticket({ id: ids.bug, title: 'Crash on save', type: 'bug' }),
      ticket({ id: ids.feature, title: 'Dark mode', type: 'feature' }),
      ticket({ id: ids.untyped, title: 'Old note', type: null }),
      ticket({
        id: ids.blocked,
        title: 'Signed build',
        type: 'task',
        blocker: 'Needs a certificate',
        dependencyReady: false,
      }),
      // A feature, so a Bug filter leaking out of Backlog would hide it.
      ticket({ id: ids.doing, title: 'Flaky test', type: 'feature', status: 'in_progress' }),
    ],
    ...overrides,
  })
}

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  window.localStorage.clear()
  user = userEvent.setup()
  api = makeApi()
  api.readProject = vi.fn().mockResolvedValue({ ok: true, value: board() })
  window.knightbook = api
})

async function tick(column: string, option: string) {
  await user.click(await screen.findByRole('button', { name: new RegExp(`^Filter the ${column}`) }))
  await user.click(await screen.findByRole('checkbox', { name: option }))
  await user.keyboard('{Escape}')
}

const visible = (title: string) => screen.queryByText(title) !== null

/** Every operation that writes to the project. */
const WRITES = [
  'setTicketStatus',
  'setTicketType',
  'setTicketBlocker',
  'editTicketContent',
  'setTicketLinks',
  'completeTicket',
  'recordVerificationIssue',
  'resolveVerificationIssue',
  'recordTicketReview',
  'archiveTickets',
  'restoreTicket',
  'createTicket',
  'reorderBacklog',
] as const

/** Presses Tab until `target` has focus, as a keyboard user would reach it. */
async function tabTo(target: HTMLElement) {
  for (let i = 0; i < 80 && document.activeElement !== target; i++) await user.tab()
  expect(document.activeElement).toBe(target)
}

describe('a column filter', () => {
  it('offers every type, untyped, conditions and review state', async () => {
    renderApp()
    await user.click(await screen.findByRole('button', { name: /^Filter the Backlog/ }))

    for (const option of [
      'Feature',
      'Bug',
      'Research',
      'Documentation',
      'Task',
      'Untyped',
      'Blocked',
      'Waiting on prerequisites',
      'Ready to start',
      'Affected by a failed prerequisite',
      'Unreviewed',
      'Reviewed',
      'Changed since review',
    ]) {
      expect(screen.getByRole('checkbox', { name: option })).toBeTruthy()
    }
  })

  it('offers readiness in Backlog only', async () => {
    renderApp()
    await user.click(await screen.findByRole('button', { name: /^Filter the In progress/ }))
    expect(screen.getByRole('checkbox', { name: 'Blocked' })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: 'Ready to start' })).toBeNull()
  })

  it('narrows its own column only, and says how many are hidden', async () => {
    renderApp()
    await tick('Backlog', 'Bug')

    expect(visible('Crash on save')).toBe(true)
    expect(visible('Dark mode')).toBe(false)
    expect(visible('Old note')).toBe(false)
    // A non-bug in another column is untouched, and so is its count.
    expect(visible('Flaky test')).toBe(true)
    expect(screen.getByLabelText('1 in In progress')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Filter the In progress column' })).toBeTruthy()
    expect(screen.getByText('Showing 1 of 4. 3 hidden by this filter.')).toBeTruthy()
    expect(screen.getByLabelText('1 in Backlog')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Filter the Backlog column (filtered)' }),
    ).toBeTruthy()
  })

  it('treats untyped as a choice of its own, and combines with conditions', async () => {
    renderApp()
    await tick('Backlog', 'Untyped')
    expect(visible('Old note')).toBe(true)
    expect(visible('Crash on save')).toBe(false)

    await tick('Backlog', 'Task')
    await tick('Backlog', 'Blocked')
    // Untyped or Task, and blocked: only the blocked task.
    expect(visible('Signed build')).toBe(true)
    expect(visible('Old note')).toBe(false)
  })

  it('says when nothing matches, which an empty column never says', async () => {
    renderApp()
    await tick('In progress', 'Bug')
    expect(screen.getByText('The 1 ticket here does not match this filter.')).toBeTruthy()
    expect(screen.queryByText(/Nothing being worked on/)).toBeNull()

    await tick('Backlog', 'Research')
    expect(screen.getByText('None of the 4 tickets here match this filter.')).toBeTruthy()
  })

  it('leaves an empty column reading as empty, even with a filter set', async () => {
    window.localStorage.setItem(
      `knightbook.board.columns:${CHECKOUT}`,
      JSON.stringify({ verification: { types: ['bug'] } }),
    )
    renderApp()

    expect(await screen.findByText(/Finished work waits here/)).toBeTruthy()
    expect(screen.queryByText(/match this filter|hidden by this filter/)).toBeNull()
  })

  it('clears in one action', async () => {
    renderApp()
    await tick('Backlog', 'Bug')
    await user.click(screen.getByRole('button', { name: 'Clear filter' }))

    expect(visible('Dark mode')).toBe(true)
    expect(screen.queryByText(/hidden by this filter/)).toBeNull()
  })

  it('never writes to the project, and hides whole-column archiving while filtered', async () => {
    renderApp()
    await tick('Backlog', 'Bug')

    for (const write of WRITES) expect(api[write]).not.toHaveBeenCalled()
    expect(api.readProject).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /Actions for the Backlog column/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Actions for the In progress column/ })).toBeTruthy()
  })

  it('moves a card past the visible card above it, sending the full order', async () => {
    renderApp()
    await tick('Backlog', 'Bug')
    await tick('Backlog', 'Task')
    // Drawn: Crash on save, Signed build. Hidden between them: Dark mode, Old note.
    await user.click(screen.getByLabelText('Actions for Signed build'))
    await user.click(await screen.findByText('Move up'))

    expect(api.reorderBacklog).toHaveBeenCalledWith(CHECKOUT, [
      ids.blocked,
      ids.bug,
      ids.feature,
      ids.untyped,
    ])
  })

  it('is reachable from the keyboard', async () => {
    renderApp()
    const button = await screen.findByRole('button', { name: /^Filter the Backlog/ })
    await tabTo(button)
    await user.keyboard('{Enter}')
    // Focus moves into the popover, so Tab reaches its checkboxes from there.
    await tabTo(await screen.findByRole('checkbox', { name: 'Bug' }))
    await user.keyboard(' ')

    expect(within(document.body).getByText('Showing 1 of 4. 3 hidden by this filter.')).toBeTruthy()
  })
})

describe('remembering column filters', () => {
  it('keeps them per checkout across reopening', async () => {
    const first = renderApp()
    await tick('Backlog', 'Bug')
    first.unmount()

    renderApp()
    expect(await screen.findByText('Showing 1 of 4. 3 hidden by this filter.')).toBeTruthy()
    expect(window.localStorage.getItem(`knightbook.board.columns:${CHECKOUT}`)).toContain('bug')
  })

  it('does not carry them to another checkout', async () => {
    const first = renderApp()
    await tick('Backlog', 'Bug')
    first.unmount()

    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: board({ checkoutPath: 'C:\\other\\clone' }),
    })
    renderApp()
    expect(await screen.findByText('Dark mode')).toBeTruthy()
    expect(screen.queryByText(/hidden by this filter/)).toBeNull()
  })
})
