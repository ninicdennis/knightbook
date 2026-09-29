import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi, TicketView } from '../../shared/contract.js'
import { makeApi, project, renderApp, ticket } from '../test/test-fixtures.js'

/**
 * What a card says about its prerequisites. The count is of prerequisites still
 * unmet, never of every one listed, and a ticket whose prerequisites are all met
 * says so, so finished prerequisites never read as something to wait on.
 */

const PREREQUISITE_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_ID = '33333333-3333-4333-8333-333333333333'
const DEPENDENT_ID = '44444444-4444-4444-8444-444444444444'

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  window.knightbook = api
})

function showBoard(...tickets: TicketView[]) {
  api.readProject = vi.fn().mockResolvedValue({ ok: true, value: project({ tickets }) })
  renderApp()
}

async function cardFor(title: string): Promise<HTMLElement> {
  return (await screen.findByText(title)).closest('.mantine-Card-root') as HTMLElement
}

const unmetNote = 'waiting on "Safe writes" (2222…), which is in_progress'

describe('the prerequisite badges on a card', () => {
  it('counts only the prerequisites still unmet', async () => {
    showBoard(
      ticket({
        title: 'Build the board',
        dependsOn: [PREREQUISITE_ID, OTHER_ID],
        dependencyReady: false,
        unmetPrerequisites: [unmetNote],
      }),
    )

    const card = await cardFor('Build the board')

    expect(within(card).getByText('Waiting on 1')).toBeTruthy()
    expect(within(card).queryByText('Waiting on 2')).toBeNull()
    expect(within(card).queryByText('Unlocked')).toBeNull()
  })

  it('says Unlocked when every prerequisite is met, beside a blocker it does not hide', async () => {
    showBoard(
      ticket({
        title: 'Publish a release',
        dependsOn: [PREREQUISITE_ID, OTHER_ID],
        dependencyReady: false,
        prerequisitesMet: true,
        blocker: 'Deferred until the user decides.',
      }),
    )

    const card = await cardFor('Publish a release')

    expect(within(card).getByText('Unlocked')).toBeTruthy()
    expect(within(card).getByText('Blocked')).toBeTruthy()
    expect(within(card).queryByText(/Waiting on/)).toBeNull()
    // Green, the one prerequisite state that means nothing is holding it back.
    const badge = within(card).getByText('Unlocked').closest('.mantine-Badge-root') as HTMLElement
    expect(badge.getAttribute('style')).toContain('green')
  })

  it('counts a failed prerequisite once, beside its own failure badge', async () => {
    const failed = 'rests on "Import" (2222…), which failed verification: Dates are off.'
    showBoard(
      ticket({
        title: 'Weekly report',
        dependsOn: [PREREQUISITE_ID, OTHER_ID],
        dependencyReady: false,
        dependencyNotes: [unmetNote, failed],
        unmetPrerequisites: [failed],
        affectedBy: [
          { ticketId: PREREQUISITE_ID, title: 'Import', issue: 'Dates are off.', direct: true },
          { ticketId: OTHER_ID, title: 'Upstream', issue: 'Wrong totals.', direct: false },
        ],
      }),
    )

    const card = await cardFor('Weekly report')

    expect(within(card).getByText('Affected by 2 failures')).toBeTruthy()
    expect(within(card).getByText('Waiting on 1')).toBeTruthy()
    expect(within(card).queryByText('Unlocked')).toBeNull()
  })

  it('explains that Unlocked is not acceptance', async () => {
    showBoard(ticket({ title: 'Follows on', dependsOn: [PREREQUISITE_ID], prerequisitesMet: true }))

    await user.hover(within(await cardFor('Follows on')).getByText('Unlocked'))

    expect(await screen.findByText(/Verification or Done/)).toBeTruthy()
    expect(screen.getByText(/does not mean they were accepted/)).toBeTruthy()
  })

  it('shows neither badge for a blocked ticket with no prerequisites', async () => {
    showBoard(
      ticket({
        title: 'Formatted editor',
        dependencyReady: false,
        blocker: 'Waiting on an upstream release.',
      }),
    )

    const card = await cardFor('Formatted editor')

    expect(within(card).getByText('Blocked')).toBeTruthy()
    expect(within(card).queryByText(/Waiting on \d/)).toBeNull()
    expect(within(card).queryByText('Unlocked')).toBeNull()
  })

  it('shows a cycle by its own badge, not as waiting', async () => {
    showBoard(
      ticket({
        title: 'Circular',
        dependsOn: [PREREQUISITE_ID],
        dependencyReady: false,
        dependencyCycle: 'is part of a dependency cycle: a -> b -> a',
      }),
    )

    const card = await cardFor('Circular')

    expect(within(card).getByText('Dependency cycle')).toBeTruthy()
    expect(within(card).queryByText(/Waiting on/)).toBeNull()
    expect(within(card).queryByText('Unlocked')).toBeNull()
  })

  it('shows Unlocked in Backlog only', async () => {
    showBoard(
      ticket({
        title: 'Under way',
        status: 'in_progress',
        dependsOn: [PREREQUISITE_ID],
        prerequisitesMet: true,
      }),
    )

    expect(within(await cardFor('Under way')).queryByText('Unlocked')).toBeNull()
  })

  it('turns Waiting into Unlocked as soon as the last prerequisite moves', async () => {
    const prerequisite = ticket({
      id: PREREQUISITE_ID,
      title: 'Safe writes',
      status: 'in_progress',
    })
    const waiting = ticket({
      id: DEPENDENT_ID,
      title: 'Build the board',
      revision: 'rev-dependent',
      dependsOn: [PREREQUISITE_ID],
      dependencyReady: false,
      unmetPrerequisites: [unmetNote],
    })
    showBoard(prerequisite, waiting)
    // The host recomputes every card when it answers a move, as the real one does.
    api.setTicketStatus = vi.fn().mockResolvedValue({
      ok: true,
      value: project({
        tickets: [
          { ...prerequisite, status: 'verification' },
          { ...waiting, dependencyReady: true, unmetPrerequisites: [], prerequisitesMet: true },
        ],
      }),
    })

    expect(within(await cardFor('Build the board')).getByText('Waiting on 1')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /actions for safe writes/i }))
    await user.click(within(await screen.findByRole('menu')).getByText('Verification'))

    await waitFor(async () =>
      expect(within(await cardFor('Build the board')).getByText('Unlocked')).toBeTruthy(),
    )
    expect(within(await cardFor('Build the board')).queryByText(/Waiting on/)).toBeNull()
    expect(api.readProject).toHaveBeenCalledTimes(1)
  })
})
