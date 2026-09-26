import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi } from '../../shared/contract.js'
import { makeApi, project, renderApp, ticket } from '../test/test-fixtures.js'

/**
 * Refreshing came from the user's first real session with the app: tickets an AI
 * tool wrote through MCP did not appear until the app was closed and reopened.
 */

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  window.knightbook = api
})

describe('refreshing', () => {
  it('reloads from disk when asked, without a loading screen', async () => {
    renderApp()
    await screen.findByText('A ticket')

    api.readProject = vi.fn().mockResolvedValue({
      ok: true,
      value: project({
        tickets: [
          ticket(),
          ticket({ id: '22222222-2222-4222-8222-222222222222', title: 'Written by an AI tool' }),
        ],
      }),
    })
    await user.click(screen.getByRole('button', { name: /refresh from disk/i }))

    expect(await screen.findByText('Written by an AI tool')).toBeTruthy()
    // The user kept their place: the board never gave way to a spinner.
    expect(screen.queryByText(/reading project files/i)).toBeNull()
  })

  it('confirms a refresh the user asked for, and only once it succeeded', async () => {
    renderApp()
    await screen.findByText('A ticket')

    await user.click(screen.getByRole('button', { name: /refresh from disk/i }))
    expect(await screen.findByText('Refreshed from disk')).toBeTruthy()
  })

  it('shows no confirmation for a refresh on focus', async () => {
    renderApp()
    await screen.findByText('A ticket')

    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(api.readProject).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Refreshed from disk')).toBeNull()
  })

  it('reloads when the window regains focus', async () => {
    renderApp()
    await screen.findByText('A ticket')
    expect(api.readProject).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event('focus'))

    await waitFor(() => expect(api.readProject).toHaveBeenCalledTimes(2))
  })

  it('ignores a burst of focus events', async () => {
    renderApp()
    await screen.findByText('A ticket')

    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('focus'))

    await waitFor(() => expect(api.readProject).toHaveBeenCalledTimes(2))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(api.readProject).toHaveBeenCalledTimes(2)
  })

  it('keeps the last good board and says so when a refresh fails', async () => {
    renderApp()
    await screen.findByText('A ticket')

    api.readProject = vi.fn().mockResolvedValue({
      ok: false,
      code: 'invalid_record',
      message: 'A ticket file is malformed.',
    })
    await user.click(screen.getByRole('button', { name: /refresh from disk/i }))

    expect(await screen.findByText(/could not refresh/i)).toBeTruthy()
    expect(screen.getByText(/last version that loaded/i)).toBeTruthy()
    expect(screen.queryByText('Refreshed from disk')).toBeNull()
    expect(screen.getByText('A ticket')).toBeTruthy()
  })
})
