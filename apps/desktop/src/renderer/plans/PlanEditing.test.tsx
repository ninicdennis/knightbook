import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi } from '../../shared/contract.js'
import type { PlanView, ProgressView } from '../../shared/plans-contract.js'
import { CHECKOUT, TICKET_ID, makeApi, project, renderApp, ticket } from '../test/test-fixtures.js'

/**
 * Editing plans from the Plans pane (ticket c17fc047). Every write is one host
 * operation carrying the revision the pane read; a conflict reloads and says
 * so. Nothing here writes to a ticket.
 */

const PLAN_ID = '7c1e0f52-4b8a-4c1d-9e0f-3a5b6c7d8e9f'
const OTHER = '22222222-2222-4222-8222-222222222222'

const EMPTY: ProgressView = {
  total: 0,
  byStatus: { backlog: 0, in_progress: 0, verification: 0, done: 0 },
  unattributedDone: 0,
  missing: [],
  unreadable: [],
  state: 'empty',
}

const PLAN: PlanView = {
  id: PLAN_ID,
  title: 'MVP',
  body: '# MVP\n',
  file: `.projectspace/plans/${PLAN_ID}.md`,
  revision: 'rev-read',
  progress: EMPTY,
  phases: [
    {
      id: 'p1',
      title: 'Foundation',
      scope: 'The base.',
      value: null,
      progress: EMPTY,
      tickets: [
        { id: TICKET_ID, title: 'A ticket', status: 'backlog', archived: false, problem: null },
      ],
    },
    { id: 'p2', title: 'Later', scope: null, value: null, progress: EMPTY, tickets: [] },
  ],
}

const listing = (plans: PlanView[]) => ({ ok: true, value: { plans, problems: [] } })

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  api.readProject = vi.fn().mockResolvedValue({
    ok: true,
    value: project({
      tickets: [ticket(), ticket({ id: OTHER, title: 'Another ticket', revision: 'rev-2' })],
    }),
  })
  api.listPlans = vi.fn().mockResolvedValue(listing([PLAN]))
  api.setPlanPhases = vi.fn().mockResolvedValue(listing([PLAN]))
  window.knightbook = api
})

async function openPlans() {
  renderApp()
  await screen.findByText('A ticket')
  await user.click(screen.getByRole('tab', { name: 'Plans' }))
  return await screen.findByRole('region', { name: 'MVP' })
}

/** The phase list the last write sent, as [id, title, tickets]. */
function sentPhases() {
  const calls = (api.setPlanPhases as ReturnType<typeof vi.fn>).mock.calls
  const [root, planId, phases, revision] = calls[calls.length - 1]!
  expect([root, planId, revision]).toEqual([CHECKOUT, PLAN_ID, 'rev-read'])
  return (phases as { id?: string; title: string; tickets: string[] }[]).map((phase) => [
    phase.id,
    phase.title,
    phase.tickets,
  ])
}

/** Presses Tab until `target` has focus, as a keyboard user would reach it. */
async function tabTo(target: HTMLElement) {
  for (let i = 0; i < 80 && document.activeElement !== target; i++) await user.tab()
  expect(document.activeElement).toBe(target)
}

async function phaseAction(phase: string, action: string) {
  await user.click(screen.getByRole('button', { name: `Actions for phase ${phase}` }))
  await user.click(await screen.findByRole('menuitem', { name: action }))
}

describe('creating a plan', () => {
  it('creates one from a title when there are none, and shows it', async () => {
    api.listPlans = vi.fn().mockResolvedValue(listing([]))
    api.createPlan = vi.fn().mockResolvedValue({
      ok: true,
      value: { id: PLAN_ID, plans: { plans: [PLAN], problems: [] } },
    })
    renderApp()
    await screen.findByText('A ticket')
    await user.click(screen.getByRole('tab', { name: 'Plans' }))
    await user.click(await screen.findByRole('button', { name: 'New plan' }))
    await user.type(screen.getByRole('textbox', { name: 'Plan title' }), 'MVP')
    await user.click(screen.getByRole('button', { name: 'Create plan' }))

    expect(api.createPlan).toHaveBeenCalledWith(CHECKOUT, 'MVP')
    expect(await screen.findByRole('region', { name: 'MVP' })).toBeTruthy()
  })

  it('does not offer to create a plan with an empty title', async () => {
    await openPlans()
    await user.click(screen.getByRole('button', { name: 'New plan' }))
    await user.type(screen.getByRole('textbox', { name: 'Plan title' }), '   ')
    expect(screen.getByRole('button', { name: 'Create plan' }).hasAttribute('disabled')).toBe(true)
  })
})

describe('editing phases', () => {
  it('adds a phase at the end, keeping the others and their tickets', async () => {
    await openPlans()
    await user.click(screen.getByRole('button', { name: 'Add phase' }))
    await user.type(screen.getByRole('textbox', { name: 'Phase title' }), 'Polish{Enter}')

    expect(sentPhases()).toEqual([
      ['p1', 'Foundation', [TICKET_ID]],
      ['p2', 'Later', []],
      [undefined, 'Polish', []],
    ])
  })

  it('renames a phase and keeps its id, scope and tickets', async () => {
    await openPlans()
    await phaseAction('Foundation', 'Rename…')
    const field = screen.getByRole('textbox', { name: 'Phase title' })
    await user.clear(field)
    await user.type(field, 'Groundwork{Enter}')

    expect(sentPhases()[0]).toEqual(['p1', 'Groundwork', [TICKET_ID]])
    const phases = (api.setPlanPhases as ReturnType<typeof vi.fn>).mock.calls[0]![2]
    expect(phases[0].scope).toBe('The base.')
  })

  it('reorders phases, offering only moves that change something', async () => {
    await openPlans()
    await user.click(screen.getByRole('button', { name: 'Actions for phase Foundation' }))
    expect(screen.queryByRole('menuitem', { name: 'Move up' })).toBeNull()
    await user.click(await screen.findByRole('menuitem', { name: 'Move down' }))

    expect(sentPhases().map(([id]) => id)).toEqual(['p2', 'p1'])
  })

  it('asks before removing a phase that holds tickets, and says the tickets are unchanged', async () => {
    await openPlans()
    await phaseAction('Foundation', 'Remove phase…')
    const dialog = await screen.findByRole('dialog', { name: 'Remove phase Foundation?' })
    expect(within(dialog).getByText(/The tickets themselves are not changed/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Remove phase' }))

    expect(sentPhases()).toEqual([['p2', 'Later', []]])
  })

  it('removes an empty phase without asking', async () => {
    await openPlans()
    await phaseAction('Later', 'Remove phase…')
    expect(sentPhases()).toEqual([['p1', 'Foundation', [TICKET_ID]]])
  })
})

describe('attaching and detaching tickets', () => {
  it('attaches a board ticket that is not already in the phase', async () => {
    await openPlans()
    await user.click(screen.getByRole('combobox', { name: 'Attach a ticket to Foundation' }))
    expect(screen.queryByRole('option', { name: 'A ticket' })).toBeNull()
    await user.click(await screen.findByRole('option', { name: 'Another ticket' }))

    expect(sentPhases()[0]).toEqual(['p1', 'Foundation', [TICKET_ID, OTHER]])
  })

  it('detaches a ticket, and changes nothing on any ticket', async () => {
    await openPlans()
    await user.click(screen.getByRole('button', { name: 'Detach A ticket from Foundation' }))

    expect(sentPhases()[0]).toEqual(['p1', 'Foundation', []])
    expect(api.setTicketStatus).not.toHaveBeenCalled()
    expect(api.setTicketLinks).not.toHaveBeenCalled()
    expect(api.reorderBacklog).not.toHaveBeenCalled()
  })
})

describe('a plan changed elsewhere', () => {
  it('refuses the edit, reloads, and says so', async () => {
    const newer: PlanView = { ...PLAN, revision: 'rev-newer', phases: [PLAN.phases[1]!] }
    api.setPlanPhases = vi.fn().mockResolvedValue({
      ok: false,
      code: 'revision_conflict',
      message: 'Changed.',
      currentRevision: 'rev-newer',
    })
    await openPlans()
    api.listPlans = vi.fn().mockResolvedValue(listing([newer]))
    await user.click(screen.getByRole('button', { name: 'Detach A ticket from Foundation' }))

    expect(
      await screen.findByText(/That plan changed somewhere else, so your change was not applied/),
    ).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Foundation' })).toBeNull())
  })
})

describe('without a mouse', () => {
  it('reaches the phase menu and the attach field with the keyboard', async () => {
    await openPlans()
    const menu = screen.getByRole('button', { name: 'Actions for phase Foundation' })
    await tabTo(menu)
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('menuitem', { name: 'Rename…' })).toBeTruthy()
    await user.keyboard('{Escape}')

    const attach = screen.getByRole('combobox', { name: 'Attach a ticket to Foundation' })
    await tabTo(attach)
    await user.keyboard('Another{ArrowDown}{Enter}')
    expect(sentPhases()[0]).toEqual(['p1', 'Foundation', [TICKET_ID, OTHER]])
  })
})
