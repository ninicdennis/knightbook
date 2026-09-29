import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi, TicketView } from '../../shared/contract.js'
import {
  CHECKOUT,
  TICKET_ID,
  chooseEdit,
  detail,
  makeApi,
  project,
  renderApp,
  ticket,
} from '../test/test-fixtures.js'

/**
 * Editing a ticket's prerequisites and related documents from its detail view.
 * The refusals themselves (D-032) and the revision check are covered on real
 * files in main/tickets/ticket-links-edit.test.ts; this covers what the window
 * offers, sends and shows.
 */

const SCHEMA_ID = '22222222-2222-4222-8222-222222222222'
const OLD_ID = '33333333-3333-4333-8333-333333333333'

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

const schema = ticket({ id: SCHEMA_ID, title: 'Define the schema' })
const board = (overrides: Partial<TicketView> = {}) =>
  project({
    tickets: [ticket(overrides), schema],
    archivedTickets: [ticket({ id: OLD_ID, title: 'Old archived work' })],
  })

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  api.readProject = vi.fn().mockResolvedValue({ ok: true, value: board() })
  api.readTicket = vi.fn().mockResolvedValue({ ok: true, value: detail({ revision: 'rev-read' }) })
  api.listDocuments = vi.fn().mockResolvedValue({
    ok: true,
    value: {
      documents: [
        { path: 'docs/spec.md', title: 'Spec', includedVia: 'docs', review: ticket().review },
      ],
      problems: [],
      folderTitles: [],
    },
  })
  window.knightbook = api
})

async function openLinksEditor() {
  await user.click(await screen.findByText('A ticket'))
  const dialog = await screen.findByRole('dialog')
  await chooseEdit(user, dialog, 'Prerequisites and documents')
  return dialog
}

async function optionsOf(dialog: HTMLElement, label: string) {
  // Mantine also renders a hidden input under the same label; the combobox is the one to use.
  const field = within(dialog)
    .getAllByLabelText(label)
    .find((element) => element.getAttribute('aria-haspopup') === 'listbox')
  await user.click(field!)
  return within(dialog)
    .getAllByRole('option')
    .map((option) => option.textContent)
}

describe('choosing prerequisites and documents', () => {
  it('offers board tickets by title, but not this ticket or an archived one', async () => {
    renderApp()
    const dialog = await openLinksEditor()

    const offered = await optionsOf(dialog, 'Prerequisites')

    expect(offered).toEqual(['Define the schema'])
  })

  it('narrows the prerequisites to the titles that match what is typed', async () => {
    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({
        tickets: [ticket(), schema, ticket({ id: OLD_ID, title: 'Write the importer' })],
      }),
    })
    renderApp()
    const dialog = await openLinksEditor()
    expect(await optionsOf(dialog, 'Prerequisites')).toHaveLength(2)

    await user.keyboard('schema')

    expect(
      within(dialog)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Define the schema'])
  })

  it('keeps existing links it would not offer now, labelled, so they can be removed', async () => {
    api.readTicket = vi.fn().mockResolvedValue({
      ok: true,
      value: detail({
        revision: 'rev-read',
        relatedDocuments: ['docs/gone.md'],
        dependencies: [
          {
            id: OLD_ID,
            title: 'Old archived work',
            status: 'backlog',
            satisfied: false,
            unreadable: false,
          },
        ],
      }),
    })
    renderApp()
    const dialog = await openLinksEditor()

    expect(await optionsOf(dialog, 'Prerequisites')).toContain('Archived: Old archived work')
    await waitFor(async () =>
      // Each option is its short label, then its full path.
      expect(await optionsOf(dialog, 'Related documents')).toEqual([
        'Specdocs/spec.md',
        'Not included: gone.mddocs/gone.md',
      ]),
    )
  })

  it('offers the workspace’s included documents', async () => {
    renderApp()
    const dialog = await openLinksEditor()
    await waitFor(() => expect(api.listDocuments).toHaveBeenCalledWith(CHECKOUT))

    await waitFor(async () =>
      expect(await optionsOf(dialog, 'Related documents')).toEqual(['Specdocs/spec.md']),
    )
  })

  it('shows a chosen document by its title, and finds it by its path as well', async () => {
    renderApp()
    const dialog = await openLinksEditor()
    await waitFor(async () => expect(await optionsOf(dialog, 'Related documents')).toHaveLength(1))

    await user.keyboard('spec.md')
    expect(within(dialog).getAllByRole('option')).toHaveLength(1)
    await user.click(within(dialog).getByRole('option', { name: /docs\/spec\.md/ }))

    // The pill holds the short title, not the path that would fill a whole row.
    const pills = [...dialog.querySelectorAll('.mantine-Pill-label')].map(
      (pill) => pill.textContent,
    )
    expect(pills).toContain('Spec')
    expect(pills).not.toContain('docs/spec.md')
  })

  it('saves the chosen ids and paths against the revision it read', async () => {
    renderApp()
    const dialog = await openLinksEditor()

    await optionsOf(dialog, 'Prerequisites')
    await user.click(within(dialog).getByRole('option', { name: 'Define the schema' }))
    await waitFor(async () => expect(await optionsOf(dialog, 'Related documents')).toHaveLength(1))
    await user.click(within(dialog).getByRole('option', { name: /docs\/spec\.md/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Save links' }))

    await waitFor(() =>
      expect(api.setTicketLinks).toHaveBeenCalledWith(
        CHECKOUT,
        TICKET_ID,
        { dependsOn: [SCHEMA_ID], relatedDocuments: ['docs/spec.md'] },
        'rev-read',
      ),
    )
  })

  it('will not open the text editor over an open links draft', async () => {
    renderApp()
    const dialog = await openLinksEditor()

    await user.click(within(dialog).getByRole('button', { name: 'Edit ticket' }))

    const item = await screen.findByRole('menuitem', { name: 'Title and text' })
    expect(item.hasAttribute('disabled') || item.getAttribute('data-disabled') === 'true').toBe(
      true,
    )
  })

  it('writes nothing when saved without a change', async () => {
    renderApp()
    const dialog = await openLinksEditor()

    await user.click(within(dialog).getByRole('button', { name: 'Save links' }))

    await waitFor(() => expect(within(dialog).queryByText('Save links')).toBeNull())
    expect(api.setTicketLinks).not.toHaveBeenCalled()
  })
})

describe('after saving', () => {
  it('shows the new readiness on the card and in the dialog without a refresh', async () => {
    api.setTicketLinks = vi.fn().mockImplementation(async () => {
      api.readTicket = vi.fn().mockResolvedValue({
        ok: true,
        value: detail({
          revision: 'rev-2',
          dependencies: [
            {
              id: SCHEMA_ID,
              title: 'Define the schema',
              status: 'backlog',
              satisfied: false,
              unreadable: false,
            },
          ],
        }),
      })
      return {
        ok: true,
        value: board({
          revision: 'rev-2',
          dependsOn: [SCHEMA_ID],
          dependencyReady: false,
          dependencyNotes: ['waiting on "Define the schema"'],
        }),
      }
    })
    renderApp()
    const dialog = await openLinksEditor()
    expect(screen.queryByText('Waiting on 1')).toBeNull()

    await optionsOf(dialog, 'Prerequisites')
    await user.click(within(dialog).getByRole('option', { name: 'Define the schema' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save links' }))

    // The card behind the dialog, then the dialog itself.
    expect(await screen.findByText('Waiting on 1')).toBeTruthy()
    expect(await within(dialog).findByText('Depends on')).toBeTruthy()
    expect(within(dialog).getByText('is not ready yet')).toBeTruthy()
    expect(api.readProject).toHaveBeenCalledTimes(1)
  })
})

describe('a save that is refused', () => {
  it('explains a refused prerequisite in the dialog and keeps the choice', async () => {
    api.setTicketLinks = vi.fn().mockResolvedValue({
      ok: false,
      code: 'invalid_dependency',
      message:
        'The prerequisites were not changed. "Define the schema" already leads back to this ticket.',
    })
    renderApp()
    const dialog = await openLinksEditor()

    await optionsOf(dialog, 'Prerequisites')
    await user.click(within(dialog).getByRole('option', { name: 'Define the schema' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save links' }))

    expect(await within(dialog).findByText(/already leads back to this ticket/)).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Save links' })).toBeTruthy()
    expect(api.readProject).toHaveBeenCalledTimes(1)
  })

  it('reloads and says so when the ticket changed elsewhere, writing nothing over it', async () => {
    api.setTicketLinks = vi
      .fn()
      .mockResolvedValue({ ok: false, code: 'revision_conflict', message: 'stale' })
    renderApp()
    const dialog = await openLinksEditor()

    await optionsOf(dialog, 'Prerequisites')
    await user.click(within(dialog).getByRole('option', { name: 'Define the schema' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save links' }))

    expect(await within(dialog).findByText(/changed somewhere else/)).toBeTruthy()
    expect(api.readProject).toHaveBeenCalledTimes(2)
    await user.click(within(dialog).getByRole('button', { name: 'Load the current version' }))
    await waitFor(() => expect(within(dialog).queryByText('Save links')).toBeNull())
  })
})
