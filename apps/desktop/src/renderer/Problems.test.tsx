import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectspaceApi, RecordProblemView } from '../shared/contract.js'
import { detail, makeApi, project, renderApp, ticket } from './test-fixtures.js'

/**
 * One malformed ticket or an unresolved merge conflict used to send the whole
 * project to the could-not-open screen. The board now opens with what loaded, and
 * says plainly what did not.
 */

const CONFLICT: RecordProblemView = {
  file: '.projectspace/tickets/aaaa.md',
  reason: '.projectspace/tickets/aaaa.md contains unresolved merge conflict markers.',
}
const BAD_STATUS: RecordProblemView = {
  file: '.projectspace/tickets/bbbb.md',
  reason: 'Ticket bbbb is not valid: status must be one of backlog, in_progress.',
}

let api: ProjectspaceApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  window.projectspace = api
})

function withProblems(problems: RecordProblemView[]) {
  api.readProject = vi.fn().mockResolvedValue({
    ok: true,
    value: project({ problems, tickets: [ticket()] }),
  })
}

describe('a board with unreadable records', () => {
  it('still shows the tickets that loaded', async () => {
    withProblems([CONFLICT])
    renderApp()

    expect(await screen.findByText('A ticket')).toBeTruthy()
    expect(screen.queryByText(/could not open this project/i)).toBeNull()
  })

  it('says how many records could not be read, and that they are not on the board', async () => {
    withProblems([CONFLICT, BAD_STATUS])
    renderApp()

    expect(await screen.findByText(/2 records could not be read, so they are not on the board/i)).toBeTruthy()
  })

  it('uses the singular for one record', async () => {
    withProblems([CONFLICT])
    renderApp()

    expect(await screen.findByText(/1 record could not be read, so it is not on the board/i)).toBeTruthy()
  })

  it('lists each file with its reason once asked, and says nothing was rewritten', async () => {
    withProblems([CONFLICT, BAD_STATUS])
    renderApp()
    await screen.findByText('A ticket')

    await user.click(screen.getByRole('button', { name: /show files/i }))

    expect(await screen.findByText('.projectspace/tickets/bbbb.md')).toBeTruthy()
    expect(screen.getByText(/status must be one of/i)).toBeTruthy()
    expect(screen.getByText(/contains unresolved merge conflict markers/i)).toBeTruthy()
    expect(screen.getByText(/nothing was changed or rewritten/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /hide files/i })).toBeTruthy()
  })

  it('offers no way to repair or edit an unreadable record from the board', async () => {
    withProblems([CONFLICT])
    renderApp()
    await screen.findByText('A ticket')
    await user.click(screen.getByRole('button', { name: /show files/i }))

    const banner = (await screen.findByText(/could not be read, so it is not on the board/i)).closest(
      '[role="alert"]',
    ) as HTMLElement
    const buttons = within(banner).getAllByRole('button').map((b) => b.textContent)

    expect(buttons).toEqual(['Hide files'])
  })

  it('shows no banner at all when every record loaded', async () => {
    renderApp()
    await screen.findByText('A ticket')

    expect(screen.queryByText(/could not be read/i)).toBeNull()
  })
})

describe('the detail view around unreadable records', () => {
  it('says a prerequisite could not be read, rather than that it does not exist', async () => {
    withProblems([CONFLICT])
    api.readTicket = vi.fn().mockResolvedValue({
      ok: true,
      value: detail({
        dependencies: [
          { id: 'aaaa', title: null, status: null, satisfied: false, unreadable: true },
        ],
      }),
    })
    renderApp()
    await user.click(await screen.findByText('A ticket'))
    const dialog = await screen.findByRole('dialog')

    expect(await within(dialog).findByText('Ticket aaaa could not be read')).toBeTruthy()
    expect(within(dialog).getByText('Unreadable')).toBeTruthy()
    expect(within(dialog).getByText(/its file could not be read, so this cannot be checked/i)).toBeTruthy()
    expect(within(dialog).queryByText(/missing from this project/i)).toBeNull()
  })

  it('says why a ticket that became unreadable cannot be opened, and changes nothing', async () => {
    api.readTicket = vi.fn().mockResolvedValue({
      ok: false,
      code: 'invalid_record',
      message: '.projectspace/tickets/aaaa.md could not be read: contains unresolved merge conflict markers.',
    })
    renderApp()
    await user.click(await screen.findByText('A ticket'))
    const dialog = await screen.findByRole('dialog')

    expect(await within(dialog).findByText(/could not read this ticket/i)).toBeTruthy()
    expect(within(dialog).getByText(/merge conflict markers/i)).toBeTruthy()
    expect(within(dialog).getByText(/nothing was changed/i)).toBeTruthy()
  })
})
