import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi } from '../../shared/contract.js'
import type { RoutineRunView, RoutineView } from '../../shared/routines-contract.js'
import { CHECKOUT, TICKET_ID, makeApi, project, renderApp, ticket } from '../test/test-fixtures.js'

/**
 * The Routines pane (D-051): creating and editing a routine, starting a run,
 * and reading the history. Accepted runs come from the tickets; a run in
 * Verification or a Done ticket with no recorded decision is never shown as
 * accepted, and a second run while one is open must be asked for.
 */

const ROUTINE_ID = '3b1f6a2e-8c4d-4e5f-9a0b-1c2d3e4f5a6b'
const NEW_ID = '44444444-4444-4444-8444-444444444444'

function run(partial: Partial<RoutineRunView> & Pick<RoutineRunView, 'ticketId'>): RoutineRunView {
  return {
    title: 'Weekly review',
    status: 'backlog',
    archived: false,
    startedAt: '2026-10-01T09:00:00.000Z',
    acceptedAt: null,
    completionUnattributed: false,
    ...partial,
  }
}

function routine(partial: Partial<RoutineView> = {}): RoutineView {
  return {
    id: ROUTINE_ID,
    title: 'Weekly review',
    instructions: '# Weekly review\n\nCheck the packages.\n',
    file: `.projectspace/routines/${ROUTINE_ID}.md`,
    revision: 'rev-read',
    runs: [],
    openRunIds: [],
    lastCompletedAt: null,
    completedCount: 0,
    ...partial,
  }
}

const listing = (routines: RoutineView[], unreadableTickets = 0) => ({
  ok: true,
  value: { routines, problems: [], unreadableTickets },
})

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  api.readProject = vi.fn().mockResolvedValue({ ok: true, value: project({ tickets: [ticket()] }) })
  window.knightbook = api
})

async function openRoutines() {
  renderApp()
  await screen.findByText('A ticket')
  await user.click(screen.getByRole('tab', { name: 'Routines' }))
}

describe('the Routines pane', () => {
  it('creates a routine from a title and instructions', async () => {
    api.listRoutines = vi.fn().mockResolvedValue(listing([]))
    api.createRoutine = vi.fn().mockResolvedValue({
      ok: true,
      value: { id: NEW_ID, routines: listing([routine({ id: NEW_ID, title: 'Security' })]).value },
    })
    await openRoutines()

    await user.click(await screen.findByRole('button', { name: 'New routine' }))
    const dialog = await screen.findByRole('dialog', { name: 'New routine' })
    await user.type(within(dialog).getByRole('textbox', { name: 'Title' }), 'Security')
    const instructions = within(dialog).getByRole('textbox', { name: 'Instructions' })
    await user.clear(instructions)
    await user.type(instructions, 'Run the audit.')
    await user.click(within(dialog).getByRole('button', { name: 'Create routine' }))

    expect(api.createRoutine).toHaveBeenCalledWith(CHECKOUT, {
      title: 'Security',
      instructions: '# Security\n\nRun the audit.\n',
    })
    expect(await screen.findByRole('region', { name: 'Security' })).toBeTruthy()
  })

  it('edits a routine at the revision it read', async () => {
    api.listRoutines = vi.fn().mockResolvedValue(listing([routine()]))
    api.updateRoutine = vi
      .fn()
      .mockResolvedValue(listing([routine({ title: 'Package review', revision: 'rev-2' })]))
    await openRoutines()

    const region = await screen.findByRole('region', { name: 'Weekly review' })
    await user.click(within(region).getByRole('button', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit routine' })
    const title = within(dialog).getByRole('textbox', { name: 'Title' })
    await user.clear(title)
    await user.type(title, 'Package review')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(api.updateRoutine).toHaveBeenCalledWith(
      CHECKOUT,
      ROUTINE_ID,
      { title: 'Package review', instructions: '# Weekly review\n\nCheck the packages.\n' },
      'rev-read',
    )
    expect(await screen.findByRole('region', { name: 'Package review' })).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('starts a run and re-reads the board so the new ticket appears', async () => {
    const started = listing([
      routine({ runs: [run({ ticketId: TICKET_ID })], openRunIds: [TICKET_ID] }),
    ])
    api.listRoutines = vi.fn().mockResolvedValue(listing([routine()]))
    api.startRoutineRun = vi.fn().mockImplementation(async () => {
      api.listRoutines = vi.fn().mockResolvedValue(started)
      return { ok: true, value: { ticketId: TICKET_ID, routines: started.value } }
    })
    await openRoutines()
    const reads = (api.readProject as ReturnType<typeof vi.fn>).mock.calls.length

    const region = await screen.findByRole('region', { name: 'Weekly review' })
    await user.click(within(region).getByRole('button', { name: 'Start run' }))

    expect(api.startRoutineRun).toHaveBeenCalledWith(CHECKOUT, ROUTINE_ID, false)
    await waitFor(() =>
      expect((api.readProject as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
        reads,
      ),
    )
    expect(await within(region).findByText(/A run is open/)).toBeTruthy()
  })

  it('asks before starting a second run while one is open, and offers the open one', async () => {
    api.listRoutines = vi.fn().mockResolvedValue(
      listing([
        routine({
          runs: [run({ ticketId: TICKET_ID, status: 'in_progress' })],
          openRunIds: [TICKET_ID],
        }),
      ]),
    )
    api.startRoutineRun = vi.fn().mockResolvedValue({
      ok: true,
      value: { ticketId: TICKET_ID, routines: listing([routine()]).value },
    })
    await openRoutines()

    const region = await screen.findByRole('region', { name: 'Weekly review' })
    await user.click(within(region).getByRole('button', { name: 'Start run' }))
    const dialog = await screen.findByRole('dialog', { name: 'Start another run?' })
    expect(api.startRoutineRun).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Start another run' }))
    expect(api.startRoutineRun).toHaveBeenCalledWith(CHECKOUT, ROUTINE_ID, true)
  })

  it('shows only accepted runs as accepted, and says when history may be partial', async () => {
    api.listRoutines = vi.fn().mockResolvedValue(
      listing(
        [
          routine({
            runs: [
              run({ ticketId: 'a', status: 'verification', startedAt: '2026-10-20T09:00:00.000Z' }),
              run({ ticketId: 'b', status: 'done', completionUnattributed: true }),
              run({
                ticketId: 'c',
                status: 'done',
                acceptedAt: '2026-10-08T12:00:00.000Z',
              }),
            ],
            openRunIds: ['a'],
            lastCompletedAt: '2026-10-08T12:00:00.000Z',
            completedCount: 1,
          }),
        ],
        2,
      ),
    )
    await openRoutines()

    const runs = await screen.findByRole('region', { name: 'Runs' })
    expect(within(runs).getByText(/1 of 3 runs accepted/)).toBeTruthy()
    expect(within(runs).getByText('Not accepted yet')).toBeTruthy()
    expect(within(runs).getByText('Done, with no recorded acceptance')).toBeTruthy()
    expect(within(runs).getAllByText(/^Accepted /)).toHaveLength(1)
    expect(within(runs).getByText(/2 ticket files could not be read/)).toBeTruthy()
  })

  it('opens a run as an ordinary ticket', async () => {
    api.listRoutines = vi
      .fn()
      .mockResolvedValue(listing([routine({ runs: [run({ ticketId: TICKET_ID })] })]))
    await openRoutines()

    const runs = await screen.findByRole('region', { name: 'Runs' })
    await user.click(within(runs).getByRole('button', { name: /Open the run started/ }))
    expect(await screen.findByRole('dialog', { name: /A ticket/ })).toBeTruthy()
  })
})
