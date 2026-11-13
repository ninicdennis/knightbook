import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi } from '../../shared/contract.js'
import { DOWNLOAD_PAGE_URL, type UpdateView } from '../../shared/updates-contract.js'
import { makeApi, renderApp } from '../test/test-fixtures.js'

/**
 * What a person sees of an update (D-056): the corner notice and the line in
 * Settings. Each state comes from the host as it would send it.
 */

const RELEASE = {
  version: '0.4.0',
  notesUrl: 'https://github.com/ninicdennis/knightbook/releases/tag/v0.4.0',
  installable: true,
}

function view(status: UpdateView['status'], mode: UpdateView['mode'] = 'install'): UpdateView {
  return { currentVersion: '0.3.1', mode, status }
}

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>
let push: (next: UpdateView) => void

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  vi.mocked(api.onUpdateView).mockImplementation((listener) => {
    push = listener
    return () => undefined
  })
  window.knightbook = api
})

function showing(start: UpdateView) {
  vi.mocked(api.updateView).mockResolvedValue(start)
  renderApp()
}

const notice = () => screen.findByRole('region', { name: 'Update' })

describe('the update notice', () => {
  it('offers a download on Windows and downloads only when clicked', async () => {
    showing(view({ phase: 'available', release: RELEASE }))
    const card = await notice()

    expect(card.textContent).toContain('Knightbook 0.4.0 is available')
    expect(card.textContent).toContain('Nothing is downloaded until you choose to')
    expect(api.downloadUpdate).not.toHaveBeenCalled()
    await user.click(within(card).getByRole('button', { name: 'Download' }))
    expect(api.downloadUpdate).toHaveBeenCalledTimes(1)
  })

  it('sends macOS and Linux to the download page instead', async () => {
    showing(view({ phase: 'available', release: RELEASE }, 'notify'))
    const card = await notice()

    expect(within(card).queryByRole('button', { name: 'Download' })).toBeNull()
    await user.click(within(card).getByRole('button', { name: 'Open download page' }))
    expect(api.openExternalLink).toHaveBeenCalledWith(DOWNLOAD_PAGE_URL)
  })

  it('shows progress, then asks before restarting', async () => {
    showing(view({ phase: 'downloading', release: RELEASE, percent: 42 }))
    expect((await notice()).textContent).toContain('Downloading Knightbook 0.4.0 (42%)')

    act(() => push(view({ phase: 'ready', release: RELEASE })))
    const card = await notice()
    expect(card.textContent).toContain('ready to install')
    expect(card.textContent).toContain('installs the next time you quit')
    expect(api.installUpdate).not.toHaveBeenCalled()
    await user.click(within(card).getByRole('button', { name: 'Restart now' }))
    expect(api.installUpdate).toHaveBeenCalledTimes(1)
  })

  it('explains an MCP server in use, and that Knightbook does not stop it', async () => {
    showing(view({ phase: 'in-use', release: RELEASE, heldFiles: ['node.exe'] }))
    const card = await notice()

    expect(card.textContent).toContain('cannot be installed yet')
    expect(card.textContent).toContain('node.exe')
    expect(card.textContent).toContain('does not stop it')
    expect(within(card).getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('says a failed download failed, and offers another try', async () => {
    const message = 'The download failed: net::ERR_CONNECTION_RESET. Nothing was installed.'
    showing(view({ phase: 'failed', stage: 'download', message, release: RELEASE }))
    const card = await notice()

    expect(card.textContent).toContain('did not download')
    expect(card.textContent).toContain(message)
    await user.click(within(card).getByRole('button', { name: 'Try again' }))
    expect(api.downloadUpdate).toHaveBeenCalledTimes(1)
  })

  it('goes away on Later until something changes', async () => {
    showing(view({ phase: 'available', release: RELEASE }))
    await user.click(within(await notice()).getByRole('button', { name: 'Later' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Update' })).toBeNull())

    act(() => push(view({ phase: 'ready', release: RELEASE })))
    expect((await notice()).textContent).toContain('ready to install')
  })

  it('stays away for a failed scheduled check and for a development build', async () => {
    showing(view({ phase: 'failed', stage: 'check', message: 'Could not check', release: null }))
    await screen.findByText('Demo')
    expect(screen.queryByRole('region', { name: 'Update' })).toBeNull()

    act(() => push(view({ phase: 'idle' }, 'off')))
    expect(screen.queryByRole('region', { name: 'Update' })).toBeNull()
  })
})

describe('when the host cannot answer about updates', () => {
  it('leaves the project usable and shows no notice or update line', async () => {
    vi.mocked(api.updateView).mockRejectedValue(new Error('no handler for update:view'))
    renderApp()
    await screen.findByText('Demo')
    expect(screen.queryByRole('region', { name: 'Update' })).toBeNull()

    await user.click(screen.getByRole('button', { name: /open settings/i }))
    await screen.findByRole('dialog')
    expect(screen.queryByTestId('update-line')).toBeNull()
  })
})

describe('updates in Settings', () => {
  async function settingsLine() {
    await screen.findByText('Demo')
    await user.click(screen.getByRole('button', { name: /open settings/i }))
    return await screen.findByTestId('update-line')
  }

  it('checks on request and says when it last found nothing newer', async () => {
    showing(view({ phase: 'idle' }))
    vi.mocked(api.checkForUpdates).mockResolvedValue(
      view({ phase: 'up-to-date', checkedAt: '2026-11-13T12:00:00.000Z' }),
    )
    expect((await settingsLine()).textContent).toContain('Not checked yet')

    await user.click(screen.getByRole('button', { name: 'Check for updates' }))
    expect(api.checkForUpdates).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(screen.getByTestId('update-line').textContent).toContain('Up to date'),
    )
  })

  it('shows a failed check as a failure, not as up to date', async () => {
    const message = 'Could not check for updates: net::ERR_INTERNET_DISCONNECTED'
    showing(view({ phase: 'failed', stage: 'check', message, release: null }))
    const line = await settingsLine()

    expect(line.textContent).toBe(message)
    expect(line.textContent).not.toContain('Up to date')
  })

  it('says a development build does not check, and offers no button', async () => {
    showing(view({ phase: 'idle' }, 'off'))
    expect((await settingsLine()).textContent).toContain('does not check for updates')
    expect(screen.queryByRole('button', { name: 'Check for updates' })).toBeNull()
  })
})
