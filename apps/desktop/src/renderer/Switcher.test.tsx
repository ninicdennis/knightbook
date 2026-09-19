import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectspaceApi, RememberedProject } from '../shared/contract.js'
import { CHECKOUT, REMEMBERED, makeApi, project, renderApp, ticket } from './test-fixtures.js'

/**
 * Switching projects came from the user's first real session: choosing a new
 * project meant a folder picker every time, with no list to move between them.
 */

const SECOND = 'C:\\projects\\second'
const GONE = 'D:\\old\\archived'

const SECOND_PROJECT: RememberedProject = { path: SECOND, name: 'Second app', unavailable: null }
const GONE_PROJECT: RememberedProject = {
  path: GONE,
  name: 'Archived',
  unavailable: 'This folder was not found. It may have been moved, renamed, or deleted.',
}

let api: ProjectspaceApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  api.rememberedProjects = vi.fn().mockResolvedValue([REMEMBERED, SECOND_PROJECT, GONE_PROJECT])
  window.projectspace = api
})

async function openMenu() {
  await screen.findByText('A ticket')
  await user.click(screen.getByRole('button', { name: /open project menu/i }))
  return await screen.findByRole('dialog')
}

describe('the project menu', () => {
  it('lists remembered projects with name and path, and marks the open one', async () => {
    renderApp()
    const menu = await openMenu()

    const current = await within(menu).findByRole('button', { name: /switch to demo/i })
    expect(current.getAttribute('aria-current')).toBe('true')
    expect(within(menu).getByText(CHECKOUT)).toBeTruthy()
    expect(within(menu).getByText('Second app')).toBeTruthy()
    expect(within(menu).getByText(SECOND)).toBeTruthy()
    expect(
      within(menu)
        .getByRole('button', { name: /switch to second app/i })
        .getAttribute('aria-current'),
    ).toBeNull()
  })

  it('replaces the header folder button rather than sitting beside it', async () => {
    renderApp()
    await screen.findByText('A ticket')

    expect(screen.queryByRole('button', { name: /open another project/i })).toBeNull()
  })

  it('switches to the chosen project and lands on its board', async () => {
    const secondTicket = ticket({ id: '33333333-3333-4333-8333-333333333333', title: 'Second one' })
    api.readProject = vi.fn().mockImplementation(async (path: string) => ({
      ok: true,
      value:
        path === SECOND
          ? project({ name: 'Second app', checkoutPath: SECOND, tickets: [secondTicket] })
          : project(),
    }))
    renderApp()
    const menu = await openMenu()

    await user.click(within(menu).getByRole('button', { name: /switch to second app/i }))

    expect(await screen.findByText('Second one')).toBeTruthy()
    expect(api.readProject).toHaveBeenLastCalledWith(SECOND)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('goes back to the board when switching from the documents view', async () => {
    api.readProject = vi.fn().mockImplementation(async (path: string) => ({
      ok: true,
      value: path === SECOND ? project({ name: 'Second app', checkoutPath: SECOND }) : project(),
    }))
    renderApp()
    await screen.findByText('A ticket')
    await user.click(screen.getByText('Documents'))
    await user.click(screen.getByRole('button', { name: /open project menu/i }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: /switch to second app/i,
      }),
    )

    expect(await screen.findByText('A ticket')).toBeTruthy()
  })

  it('does not reload the project that is already open', async () => {
    renderApp()
    const menu = await openMenu()
    const loadsBefore = (api.readProject as ReturnType<typeof vi.fn>).mock.calls.length

    await user.click(within(menu).getByRole('button', { name: /switch to demo/i }))

    expect((api.readProject as ReturnType<typeof vi.fn>).mock.calls.length).toBe(loadsBefore)
  })

  it('offers Open folder at the bottom, and it uses the folder picker', async () => {
    api.chooseProject = vi.fn().mockResolvedValue({ path: SECOND, initialized: true })
    renderApp()
    const menu = await openMenu()

    await user.click(within(menu).getByRole('button', { name: /open folder/i }))

    await waitFor(() => expect(api.chooseProject).toHaveBeenCalled())
    await waitFor(() => expect(api.readProject).toHaveBeenLastCalledWith(SECOND))
  })

  it('says AI tools already connected are unaffected', async () => {
    renderApp()
    const menu = await openMenu()

    expect(
      within(menu).getByText(/AI tools already connected keep using the project/i),
    ).toBeTruthy()
  })
})

describe('projects that cannot be opened', () => {
  it('shows a missing folder as unavailable with the reason, and will not open it', async () => {
    renderApp()
    const menu = await openMenu()

    expect(await within(menu).findByText(/unavailable\. this folder was not found/i)).toBeTruthy()
    const row = within(menu).getByRole('button', { name: /switch to archived/i })
    expect(row.hasAttribute('disabled')).toBe(true)
  })

  it('can still forget an unavailable project', async () => {
    api.forgetProject = vi.fn().mockResolvedValue([REMEMBERED, SECOND_PROJECT])
    renderApp()
    const menu = await openMenu()

    await user.click(await within(menu).findByRole('button', { name: /forget archived/i }))

    expect(api.forgetProject).toHaveBeenCalledWith(GONE)
    await waitFor(() => expect(within(menu).queryByText('Archived')).toBeNull())
  })
})

describe('forgetting a project', () => {
  it('only forgets: nothing on the project is written', async () => {
    api.forgetProject = vi.fn().mockResolvedValue([REMEMBERED, GONE_PROJECT])
    renderApp()
    const menu = await openMenu()

    await user.click(await within(menu).findByRole('button', { name: /forget second app/i }))

    expect(api.forgetProject).toHaveBeenCalledWith(SECOND)
    expect(api.setTicketStatus).not.toHaveBeenCalled()
    expect(api.completeTicket).not.toHaveBeenCalled()
  })

  it('offers no way to forget the project that is open', async () => {
    renderApp()
    const menu = await openMenu()

    await within(menu).findByRole('button', { name: /switch to demo/i })
    expect(within(menu).queryByRole('button', { name: /forget demo/i })).toBeNull()
  })

  it('says so when forgetting fails, and changes nothing', async () => {
    api.forgetProject = vi.fn().mockRejectedValue(new Error('disk full'))
    renderApp()
    const menu = await openMenu()

    await user.click(await within(menu).findByRole('button', { name: /forget second app/i }))

    expect(await within(menu).findByText(/could not forget that project/i)).toBeTruthy()
    expect(within(menu).getByText('Second app')).toBeTruthy()
  })
})

describe('when the list cannot be read', () => {
  it('says so instead of showing an empty list', async () => {
    renderApp()
    await screen.findByText('A ticket')
    api.rememberedProjects = vi.fn().mockRejectedValue(new Error('boom'))
    await user.click(screen.getByRole('button', { name: /open project menu/i }))
    const menu = await screen.findByRole('dialog')

    expect(await within(menu).findByText(/could not read the list/i)).toBeTruthy()
    expect(within(menu).queryByText(/no projects remembered yet/i)).toBeNull()
  })
})

describe('switching while a move is in flight', () => {
  it('refuses, and says why', async () => {
    api.setTicketStatus = vi.fn().mockReturnValue(new Promise(() => {}))
    renderApp()
    await screen.findByText('A ticket')
    await user.click(screen.getByRole('button', { name: /actions for a ticket/i }))
    await user.click(within(await screen.findByRole('menu')).getByText('In progress'))
    await waitFor(() => expect(api.setTicketStatus).toHaveBeenCalled())

    await user.click(screen.getByRole('button', { name: /open project menu/i }))
    const menu = await screen.findByRole('dialog')

    expect(within(menu).getByText(/a ticket is being updated/i)).toBeTruthy()
    expect(
      within(menu)
        .getByRole('button', { name: /switch to second app/i })
        .hasAttribute('disabled'),
    ).toBe(true)
    expect(
      within(menu)
        .getByRole('button', { name: /open folder/i })
        .hasAttribute('disabled'),
    ).toBe(true)
  })
})
