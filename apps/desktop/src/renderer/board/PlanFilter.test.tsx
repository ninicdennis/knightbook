import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardPlanView, KnightbookApi, ProjectView } from '../../shared/contract.js'
import type { PlanView } from '../../shared/plans-contract.js'
import { CHECKOUT, makeApi, project, renderApp, ticket } from '../test/test-fixtures.js'

/**
 * Narrowing the whole board to one plan (ticket 294c2961, D-035). The filter is
 * view state: it changes which cards are drawn and nothing else, and it must
 * never let a filtered board pass for a board with fewer tickets.
 */

const ids = {
  site: 'a1000000-0000-4000-8000-000000000001',
  shared: 'a1000000-0000-4000-8000-000000000002',
  app: 'a1000000-0000-4000-8000-000000000003',
  loose: 'a1000000-0000-4000-8000-000000000004',
  prerequisite: 'a1000000-0000-4000-8000-000000000005',
}

const REVIEW = 'a1000000-0000-4000-8000-000000000006'
const OLD = 'a1000000-0000-4000-8000-000000000007'

const WEBSITE: BoardPlanView = {
  id: 'website',
  title: 'Website',
  ticketIds: [ids.site, ids.shared],
}
const DESKTOP: BoardPlanView = {
  id: 'desktop',
  title: 'Desktop app',
  ticketIds: [ids.app, ids.shared],
}
const EMPTY: BoardPlanView = { id: 'someday', title: 'Someday', ticketIds: [] }

function board(overrides: Partial<ProjectView> = {}): ProjectView {
  return project({
    tickets: [
      ticket({ id: ids.site, title: 'Landing page', status: 'backlog' }),
      ticket({ id: ids.shared, title: 'Shared logo', status: 'in_progress' }),
      ticket({
        id: ids.app,
        title: 'Window chrome',
        status: 'backlog',
        dependsOn: [ids.prerequisite],
        dependencyReady: false,
        unmetPrerequisites: ['waiting on "Loose end" (a100…5), which is backlog'],
      }),
      ticket({ id: ids.loose, title: 'Loose end', status: 'done' }),
      ticket({ id: ids.prerequisite, title: 'Prerequisite', status: 'backlog' }),
    ],
    plans: [WEBSITE, DESKTOP, EMPTY],
    nextTicketId: ids.prerequisite,
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

async function choosePlan(label: string) {
  await user.click(await screen.findByRole('combobox', { name: 'Plan' }))
  await user.click(await screen.findByRole('option', { name: label }))
}

const visible = (title: string) => screen.queryByText(title) !== null

describe('the plan filter', () => {
  it('starts on All tickets and shows every active ticket', async () => {
    renderApp()

    expect(await screen.findByRole('combobox', { name: 'Plan' })).toHaveProperty(
      'value',
      'All tickets',
    )
    for (const title of ['Landing page', 'Shared logo', 'Window chrome', 'Loose end']) {
      expect(visible(title), title).toBe(true)
    }
    expect(screen.queryByText(/Showing \d+ of/)).toBeNull()
  })

  it('offers All tickets, each plan and No plan', async () => {
    renderApp()
    await user.click(await screen.findByRole('combobox', { name: 'Plan' }))

    const names = screen.getAllByRole('option').map((option) => option.textContent)
    expect(names).toEqual(['All tickets', 'Website', 'Desktop app', 'Someday', 'No plan'])
  })

  it('shows one plan across every column, a shared ticket under each plan', async () => {
    renderApp()
    await choosePlan('Website')

    expect(visible('Landing page')).toBe(true)
    expect(visible('Shared logo')).toBe(true)
    expect(visible('Window chrome')).toBe(false)
    expect(visible('Loose end')).toBe(false)
    expect(screen.getByText('Showing 2 of 5 active tickets in Website.')).toBeTruthy()

    await choosePlan('Desktop app')
    expect(visible('Shared logo')).toBe(true)
    expect(visible('Window chrome')).toBe(true)
    expect(visible('Landing page')).toBe(false)
  })

  it('counts only matching tickets in each column, and says what the filter hides', async () => {
    renderApp()
    await choosePlan('Website')

    // Backlog holds three tickets, one of them in the plan; Done holds one, not in it.
    expect(screen.getByLabelText('1 in Backlog')).toBeTruthy()
    expect(screen.getByLabelText('0 in Done')).toBeTruthy()
    // Done's only card is hidden, which must not read as an empty column.
    expect(screen.getByText('1 ticket here is hidden by the plan filter.')).toBeTruthy()
  })

  it('filters Verification too, and never counts an archived ticket a plan links', async () => {
    const base = board()
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: board({
        tickets: [
          ...base.tickets,
          ticket({ id: REVIEW, title: 'Review copy', status: 'verification' }),
        ],
        archivedTickets: [
          ticket({
            id: OLD,
            title: 'Old banner',
            status: 'done',
            archivedAt: '2026-09-01T00:00:00Z',
          }),
        ],
        plans: [{ ...WEBSITE, ticketIds: [...WEBSITE.ticketIds, OLD] }, DESKTOP, EMPTY],
      }),
    })
    renderApp()
    await choosePlan('Website')

    expect(screen.getByLabelText('0 in Verification')).toBeTruthy()
    expect(screen.getByLabelText('1 in In progress')).toBeTruthy()
    expect(visible('Review copy')).toBe(false)
    expect(visible('Old banner')).toBe(false)
    expect(screen.getByText('Showing 2 of 6 active tickets in Website.')).toBeTruthy()
  })

  it('shows tickets in no plan', async () => {
    renderApp()
    await choosePlan('No plan')

    expect(visible('Loose end')).toBe(true)
    expect(visible('Prerequisite')).toBe(true)
    expect(visible('Shared logo')).toBe(false)
    expect(screen.getByText('Showing 2 of 5 active tickets with no plan.')).toBeTruthy()
  })

  it('shows an empty plan as empty, with a way back', async () => {
    renderApp()
    await choosePlan('Someday')

    expect(screen.getByText('No active tickets in Someday.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Show all tickets' }))

    expect(visible('Landing page')).toBe(true)
    expect(screen.getByRole('combobox', { name: 'Plan' })).toHaveProperty('value', 'All tickets')
  })

  it('keeps dependencies and next up project-wide', async () => {
    renderApp()
    // Unfiltered, next up is the prerequisite, which is in no plan.
    expect(await screen.findByText('Next up')).toBeTruthy()
    await choosePlan('Desktop app')

    // The prerequisite is outside the plan and hidden, and still counted as unmet.
    expect(visible('Prerequisite')).toBe(false)
    expect(screen.getByText('Waiting on 1')).toBeTruthy()
    // The filter does not re-pick next up from the plan's tickets.
    expect(screen.queryByText('Next up')).toBeNull()
  })

  it('offers archiving a whole column only on the unfiltered board', async () => {
    renderApp()
    expect(
      await screen.findByRole('button', { name: /Actions for the Backlog column/ }),
    ).toBeTruthy()

    await choosePlan('Website')
    expect(screen.queryByRole('button', { name: /Actions for the Backlog column/ })).toBeNull()
  })

  it('never writes the choice to the project', async () => {
    renderApp()
    await choosePlan('Website')

    expect(api.setTicketStatus).not.toHaveBeenCalled()
    expect(api.reorderBacklog).not.toHaveBeenCalled()
    expect(api.readProject).toHaveBeenCalledTimes(1)
  })
})

describe('remembering the plan', () => {
  it('keeps the choice per checkout across reopening', async () => {
    const first = renderApp()
    await choosePlan('Website')
    first.unmount()

    renderApp()
    expect(await screen.findByText('Showing 2 of 5 active tickets in Website.')).toBeTruthy()
    expect(window.localStorage.getItem(`knightbook.board.plan:${CHECKOUT}`)).toBe('plan:website')
  })

  it('does not carry the choice to another checkout of the same project', async () => {
    const first = renderApp()
    await choosePlan('Website')
    first.unmount()

    // Same plans, another clone on disk.
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: board({ checkoutPath: 'C:\\other\\clone' }),
    })
    renderApp()

    expect(await screen.findByRole('combobox', { name: 'Plan' })).toHaveProperty(
      'value',
      'All tickets',
    )
  })

  it('falls back to All tickets when the remembered plan is gone', async () => {
    window.localStorage.setItem(`knightbook.board.plan:${CHECKOUT}`, 'plan:deleted')
    renderApp()

    expect(await screen.findByRole('combobox', { name: 'Plan' })).toHaveProperty(
      'value',
      'All tickets',
    )
    expect(visible('Loose end')).toBe(true)
  })
})

describe('View on board', () => {
  it('opens the board narrowed to the plan', async () => {
    const plan: PlanView = {
      id: 'desktop',
      title: 'Desktop app',
      body: '# Desktop app\n',
      file: '.projectspace/plans/desktop.md',
      revision: 'rev-1',
      progress: {
        total: 0,
        byStatus: { backlog: 0, in_progress: 0, verification: 0, done: 0 },
        unattributedDone: 0,
        missing: [],
        unreadable: [],
        state: 'empty',
      },
      phases: [],
    }
    api.listPlans = vi.fn().mockResolvedValue({ ok: true, value: { plans: [plan], problems: [] } })
    renderApp()
    await user.click(await screen.findByText('Plans'))
    await user.click(await screen.findByRole('button', { name: 'View on board' }))

    expect(await screen.findByText('Showing 2 of 5 active tickets in Desktop app.')).toBeTruthy()
    expect(visible('Window chrome')).toBe(true)
  })
})
