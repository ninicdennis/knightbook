import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi } from '../../shared/contract.js'
import { makeApi, renderApp } from '../test/test-fixtures.js'

/**
 * The colour scheme is this installation's own state, so the host stores it. What
 * these cover is the part a user would notice: the choice is applied and saved,
 * and a choice that could not be saved says so instead of looking stored.
 */

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  window.knightbook = api
})

/**
 * The shared render helper mounts Mantine with its own defaults, so these start
 * in the light scheme. Each test therefore changes to something else, which is
 * also what a person does: clicking the scheme already in effect changes nothing.
 */
async function openSettings() {
  renderApp()
  // The header, and so the settings icon, only exists once a project is open.
  await screen.findByText('Demo')
  await user.click(screen.getByRole('button', { name: /open settings/i }))
  return await screen.findByRole('dialog')
}

describe('the settings screen', () => {
  it('offers light, dark, and following the system', async () => {
    const dialog = await openSettings()

    expect(dialog.textContent).toContain('Appearance')
    for (const label of ['Light', 'Dark', 'Follow system']) {
      expect(screen.getByRole('radio', { name: label })).toBeTruthy()
    }
  })

  it('saves the choice as app state, not into the project', async () => {
    await openSettings()
    await user.click(screen.getByRole('radio', { name: 'Dark' }))

    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ colorScheme: 'dark' }))
    expect(document.documentElement.getAttribute('data-mantine-color-scheme')).toBe('dark')
    // The project's own records are never touched by a preference.
    expect(api.setTicketStatus).not.toHaveBeenCalled()
  })

  it('keeps following the system as its own choice rather than a resolved scheme', async () => {
    await openSettings()
    await user.click(screen.getByRole('radio', { name: 'Follow system' }))

    // Stored as "auto": what is saved is the intent, not the scheme it resolved
    // to today, or the app would stop following the system after one restart.
    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ colorScheme: 'auto' }))
    const following = screen.getByRole('radio', { name: 'Follow system' }) as HTMLInputElement
    expect(following.checked).toBe(true)
  })

  it('says the choice will not survive a restart when it could not be saved', async () => {
    api.saveSettings = vi.fn().mockResolvedValue({
      ok: false,
      code: 'unexpected_error',
      message: 'The settings file could not be written.',
    })
    await openSettings()
    await user.click(screen.getByRole('radio', { name: 'Dark' }))

    expect(await screen.findByText(/could not be saved/i)).toBeTruthy()
    // Applied anyway: what is on screen is still what was asked for.
    expect(document.documentElement.getAttribute('data-mantine-color-scheme')).toBe('dark')
  })
})

/**
 * Ticket b411cc60: someone reporting a problem reads the version here. Each case
 * gives the host a different answer, so the line has to show what it was told.
 */
describe('the version in settings', () => {
  it('shows the version the host reports', async () => {
    api.appVersion = vi.fn().mockResolvedValue('0.10.3')
    const dialog = await openSettings()

    expect(dialog.textContent).toContain('About')
    const line = await screen.findByTestId('app-version')
    expect(line.textContent).toBe('Knightbook 0.10.3')
    expect(api.appVersion).toHaveBeenCalled()
  })

  it('labels an unstamped build as unreleased rather than as version 0.0.0', async () => {
    api.appVersion = vi.fn().mockResolvedValue('0.0.0')
    await openSettings()

    const line = await screen.findByTestId('app-version')
    expect(line.textContent).toContain('Knightbook 0.0.0')
    expect(line.textContent).toContain('a development build, not a release')
  })

  it('says the version could not be read instead of leaving it blank', async () => {
    api.appVersion = vi.fn().mockRejectedValue(new Error('no handler'))
    await openSettings()

    expect(await screen.findByText('The version could not be read.')).toBeTruthy()
    expect(screen.queryByTestId('app-version')).toBeNull()
  })
})
