import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi } from '../shared/contract.js'
import { NEW_TICKET_SECTIONS, newTicketBody } from './components/NewTicketDialog.js'
import { CHECKOUT, detail, makeApi, project, renderApp, ticket } from './test-fixtures.js'

/**
 * Creating a ticket from the Backlog column. What matters: the title is
 * required, the body starts from the board's usual shape, a failure keeps the
 * form and says why, and the whole thing works from the keyboard.
 */

const NEW_ID = 'bbbbbbbb-0000-4000-8000-000000000001'

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  window.knightbook = api
})

function createSucceeds() {
  const created = ticket({ id: NEW_ID, title: 'Write the guide', type: 'documentation' })
  api.createTicket = vi.fn().mockResolvedValue({
    ok: true,
    value: { id: NEW_ID, project: project({ tickets: [ticket(), created] }) },
  })
  api.readTicket = vi
    .fn()
    .mockResolvedValue({ ok: true, value: detail({ id: NEW_ID, title: 'Write the guide' }) })
}

/** Mantine labels both the input and its option list "Type"; the input is the one to use. */
function typeField(form: HTMLElement): HTMLInputElement {
  const input = within(form)
    .getAllByLabelText('Type')
    .find((element) => element instanceof HTMLInputElement)
  if (!input) throw new Error('No Type input in the form.')
  return input as HTMLInputElement
}

async function openForm() {
  await screen.findByText('A ticket')
  await user.click(screen.getByRole('button', { name: 'New ticket in Backlog' }))
  return await screen.findByRole('dialog', { name: /new ticket/i })
}

describe('the new-ticket form', () => {
  it('starts from the usual sections, with no type chosen', async () => {
    renderApp()
    const form = await openForm()

    expect(within(form).getByRole('textbox', { name: /body/i })).toHaveProperty(
      'value',
      NEW_TICKET_SECTIONS,
    )
    expect(typeField(form)).toHaveProperty('value', 'No type')
  })

  it('cannot be submitted without a title', async () => {
    renderApp()
    const form = await openForm()

    const submit = within(form).getByRole('button', { name: /create ticket/i })
    expect(submit).toHaveProperty('disabled', true)
    await user.type(within(form).getByRole('textbox', { name: /title/i }), '   ')
    expect(submit).toHaveProperty('disabled', true)
    expect(api.createTicket).not.toHaveBeenCalled()
  })

  it('creates the ticket, then shows it in the detail view', async () => {
    createSucceeds()
    renderApp()
    const form = await openForm()

    await user.type(within(form).getByRole('textbox', { name: /title/i }), '  Write the guide ')
    await user.click(typeField(form))
    await user.click(await screen.findByRole('option', { name: /documentation/i }))
    await user.click(within(form).getByRole('button', { name: /create ticket/i }))

    await waitFor(() =>
      expect(api.createTicket).toHaveBeenCalledWith(CHECKOUT, {
        title: 'Write the guide',
        type: 'documentation',
        body: newTicketBody('Write the guide', NEW_TICKET_SECTIONS),
      }),
    )
    expect(await screen.findByRole('dialog', { name: 'Write the guide' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: /new ticket/i })).toBeNull()
  })

  it('keeps the form and says why when the write fails', async () => {
    api.createTicket = vi.fn().mockResolvedValue({
      ok: false,
      code: 'locked',
      message: 'Another Knightbook process is writing to this project. Try again.',
    })
    renderApp()
    const form = await openForm()

    await user.type(within(form).getByRole('textbox', { name: /title/i }), 'Keep me')
    await user.click(within(form).getByRole('button', { name: /create ticket/i }))

    expect(await within(form).findByText(/another knightbook process/i)).toBeTruthy()
    expect(within(form).getByRole('textbox', { name: /title/i })).toHaveProperty('value', 'Keep me')
  })

  it('is reachable and submittable from the keyboard alone', async () => {
    createSucceeds()
    renderApp()
    await screen.findByText('A ticket')

    screen.getByRole('button', { name: 'New ticket in Backlog' }).focus()
    await user.keyboard('{Enter}')
    const form = await screen.findByRole('dialog', { name: /new ticket/i })
    // The title field takes focus on opening, and Enter there submits.
    await waitFor(() =>
      expect(document.activeElement).toBe(within(form).getByRole('textbox', { name: /title/i })),
    )
    await user.keyboard('Write the guide{Enter}')

    await waitFor(() => expect(api.createTicket).toHaveBeenCalled())
  })
})

describe('the body a new ticket is written with', () => {
  it('opens with the title as its heading, as every ticket on the board does', () => {
    expect(newTicketBody('A', '## Notes\n\nSomething.\n\n')).toBe('# A\n\n## Notes\n\nSomething.\n')
  })

  it('is only the heading when the sections were cleared', () => {
    expect(newTicketBody('A', '  \n')).toBe('# A\n\n')
  })
})
