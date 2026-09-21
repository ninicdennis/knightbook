import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { CompletionView, ProjectspaceApi, ReopenedCompletionView } from '../shared/contract.js'
import { detail, makeApi, project, renderApp, ticket, TICKET_ID } from './test-fixtures.js'

/**
 * What a reopened ticket is allowed to say about itself. Core clears the
 * acceptance when the ticket leaves Done, so the board should have nothing to
 * show; these cover the other way in, a record edited outside the app, and the
 * history the detail keeps.
 */

let api: ProjectspaceApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  window.projectspace = api
})

const ACCEPTED: CompletionView = {
  decisionSource: 'direct_user_action',
  recordedBy: 'user',
  recordedAt: '2026-09-02T09:00:00Z',
  instruction: 'Moved to Done in the app.',
}

const REOPENED: ReopenedCompletionView = {
  ...ACCEPTED,
  reopenedAt: '2026-09-05T11:00:00Z',
  reopenedTo: 'in_progress',
}

async function openTicket() {
  await user.click(await screen.findByText('Reopened work'))
  return await screen.findByRole('dialog')
}

describe('a ticket that is not Done', () => {
  it('shows no acceptance on its card', async () => {
    const reopened = ticket({ title: 'Reopened work', status: 'in_progress' })
    api.readProject = async () => ({ ok: true, value: project({ tickets: [reopened] }) })

    renderApp()

    const card = (await screen.findByText('Reopened work')).closest('article, div') as HTMLElement
    expect(within(card).queryByText(/Accepted by you/)).toBeNull()
    expect(within(card).queryByText(/Recorded by AI/)).toBeNull()
  })

  it('says it was reopened, in the past, when it was accepted before', async () => {
    const reopened = ticket({ title: 'Reopened work', status: 'in_progress' })
    api.readProject = async () => ({ ok: true, value: project({ tickets: [reopened] }) })
    api.readTicket = async () => ({
      ok: true,
      value: detail({ ...reopened, id: TICKET_ID, previousCompletions: [REOPENED] }),
    })

    renderApp()
    const dialog = await openTicket()

    expect(await within(dialog).findByText(/Reopened after acceptance/i)).toBeTruthy()
    expect(within(dialog).getByText(/Accepted by you in the app/)).toBeTruthy()
    // The wording has to place the acceptance in the past, not report a state.
    expect(within(dialog).getByText(/took that acceptance back/)).toBeTruthy()
  })

  it('shows nothing about reopening when it was never accepted', async () => {
    const plain = ticket({ title: 'Reopened work', status: 'in_progress' })
    api.readProject = async () => ({ ok: true, value: project({ tickets: [plain] }) })
    api.readTicket = async () => ({ ok: true, value: detail({ ...plain, id: TICKET_ID }) })

    renderApp()
    const dialog = await openTicket()

    await within(dialog).findByText(/What the author wrote/)
    expect(within(dialog).queryByText(/Reopened after acceptance/i)).toBeNull()
  })
})
