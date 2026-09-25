import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi } from '../shared/contract.js'
import type { PlanView, ProgressView } from '../shared/plans-contract.js'
import { CHECKOUT, TICKET_ID, detail, makeApi, renderApp } from './test-fixtures.js'

/**
 * The Plans pane. Progress comes from the host (plan-view.test.ts); these cover
 * what the pane must never do: make nothing planned look finished, hide a
 * missing ticket, or fold Verification into Done.
 */

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  window.knightbook = api
})

function progress(overrides: Partial<ProgressView> = {}): ProgressView {
  return {
    total: 0,
    byStatus: { backlog: 0, in_progress: 0, verification: 0, done: 0 },
    unattributedDone: 0,
    missing: [],
    unreadable: [],
    state: 'empty',
    ...overrides,
  }
}

const MISSING = '99999999-9999-4999-8999-999999999999'

const MVP: PlanView = {
  id: '7c1e0f52-4b8a-4c1d-9e0f-3a5b6c7d8e9f',
  title: 'MVP',
  body: '# MVP\n\nThe smallest useful version.\n',
  file: '.projectspace/plans/7c1e0f52-4b8a-4c1d-9e0f-3a5b6c7d8e9f.md',
  progress: progress({
    total: 2,
    byStatus: { backlog: 0, in_progress: 0, verification: 1, done: 0 },
    missing: [MISSING],
    state: 'in_progress',
  }),
  phases: [
    {
      id: 'p1',
      title: 'Foundation',
      scope: null,
      value: 'Everything rests on it.',
      progress: progress({
        total: 2,
        byStatus: { backlog: 0, in_progress: 0, verification: 1, done: 0 },
        missing: [MISSING],
        state: 'in_progress',
      }),
      tickets: [
        {
          id: TICKET_ID,
          title: 'A ticket',
          status: 'verification',
          archived: false,
          problem: null,
        },
        { id: MISSING, title: null, status: null, archived: false, problem: 'missing' },
      ],
    },
    { id: 'p2', title: 'Later', scope: null, value: null, progress: progress(), tickets: [] },
  ],
}

async function openPlans() {
  await screen.findByText('A ticket')
  await user.click(screen.getByRole('radio', { name: 'Plans' }))
}

describe('the Plans pane', () => {
  it('explains how plans are made when there are none, instead of showing an empty list', async () => {
    renderApp()
    await openPlans()

    expect(await screen.findByText('No plans yet')).toBeTruthy()
    expect(api.listPlans).toHaveBeenCalledWith(CHECKOUT)
  })

  it('shows phases, Verification apart from Done, and a missing ticket as missing', async () => {
    api.listPlans = vi.fn().mockResolvedValue({ ok: true, value: { plans: [MVP], problems: [] } })
    renderApp()
    await openPlans()

    const plan = await screen.findByRole('region', { name: 'MVP' })
    expect(within(plan).getByText('The smallest useful version.')).toBeTruthy()
    expect(within(plan).getAllByText(/0 of 2 done · 1 verification · 1 not found/)).toHaveLength(2)
    expect(within(plan).getByText('No ticket with this id in the project')).toBeTruthy()
    expect(within(plan).getByText(/nothing is planned here, which is not the same as finished/i))
  })

  it('opens a linked ticket in the usual dialog', async () => {
    api.listPlans = vi.fn().mockResolvedValue({ ok: true, value: { plans: [MVP], problems: [] } })
    renderApp()
    await openPlans()

    const plan = await screen.findByRole('region', { name: 'MVP' })
    await user.click(within(plan).getByRole('button', { name: /a ticket/i }))

    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(api.readTicket).toHaveBeenCalledWith(CHECKOUT, TICKET_ID)
  })

  it('opens the plan file externally by id, and says so when that fails', async () => {
    api.listPlans = vi.fn().mockResolvedValue({ ok: true, value: { plans: [MVP], problems: [] } })
    api.openPlanExternally = vi
      .fn()
      .mockResolvedValue({ ok: false, code: 'unexpected_error', message: 'No editor for .md.' })
    renderApp()
    await openPlans()

    const plan = await screen.findByRole('region', { name: 'MVP' })
    await user.click(within(plan).getByRole('button', { name: /edit externally/i }))

    expect(api.openPlanExternally).toHaveBeenCalledWith(CHECKOUT, MVP.id)
    expect((await within(plan).findByRole('alert')).textContent).toMatch(/no editor/i)
  })

  it('lists a plan file that could not be read without hiding the others', async () => {
    api.listPlans = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        plans: [MVP],
        problems: [{ file: '.projectspace/plans/bad.md', reason: 'Conflict markers.' }],
      },
    })
    renderApp()
    await openPlans()

    expect(await screen.findByText(/some plans could not be read/i)).toBeTruthy()
    expect(screen.getByRole('region', { name: 'MVP' })).toBeTruthy()
  })
})

describe("a ticket's plans in its dialog", () => {
  it('lists each plan phase the ticket is in, and opens that plan in the Plans tab', async () => {
    api.readTicket = vi.fn().mockResolvedValue({
      ok: true,
      value: detail({
        plans: [{ planId: MVP.id, planTitle: 'MVP', phaseId: 'p1', phaseTitle: 'Foundation' }],
      }),
    })
    api.listPlans = vi.fn().mockResolvedValue({ ok: true, value: { plans: [MVP], problems: [] } })
    renderApp()
    await user.click(await screen.findByText('A ticket'))
    const dialog = await screen.findByRole('dialog')

    await user.click(await within(dialog).findByRole('button', { name: 'MVP · Foundation' }))

    expect(await screen.findByRole('region', { name: 'MVP' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows no Plans section for a ticket in no plan', async () => {
    renderApp()
    await user.click(await screen.findByText('A ticket'))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('What the author wrote.')

    expect(within(dialog).queryByText('Plans')).toBeNull()
  })
})
