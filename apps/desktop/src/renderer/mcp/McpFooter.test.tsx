import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi } from '../../shared/contract.js'
import {
  CHECKOUT,
  connectedSession,
  findMcpStatusButton,
  makeApi,
  mcpStatus,
  project,
  renderApp,
} from '../test/test-fixtures.js'

/**
 * The footer's job is to be trustworthy about a thing the window cannot see
 * directly, so these cover the ways it could lie: showing one project's
 * connection under another's name, keeping a reading after it stops being true,
 * and dressing up "I could not look" as "nothing is running".
 */

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  window.knightbook = api
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the MCP status footer', () => {
  it('reports a live connection with a readable label', async () => {
    api.mcpStatus = vi.fn().mockResolvedValue(connectedSession())
    renderApp()

    expect(await screen.findByText('MCP connected')).toBeTruthy()
  })

  it('says no connection was observed rather than claiming it is stopped', async () => {
    renderApp()

    expect(await screen.findByText('MCP not connected')).toBeTruthy()
    expect(screen.queryByText(/stopped/i)).toBeNull()
  })

  it('describes the state in text for a reader who cannot use colour', async () => {
    api.mcpStatus = vi.fn().mockResolvedValue(connectedSession())
    renderApp()

    const indicator = await screen.findByRole('button', { name: /MCP connected/i })
    expect(indicator.getAttribute('aria-label')).toContain('connected to a server for this project')
  })

  it('separates the three observations in the details panel', async () => {
    api.mcpStatus = vi.fn().mockResolvedValue(connectedSession())
    renderApp()
    await user.click(await screen.findByRole('button', { name: /MCP connected/i }))

    expect(await screen.findByText(/Bundled runtime/)).toBeTruthy()
    expect(screen.getByText(/Server process/)).toBeTruthy()
    expect(screen.getByText(/Client connection/)).toBeTruthy()
  })

  it('explains why there is no Start or Stop instead of offering broken ones', async () => {
    renderApp()
    await user.click(await findMcpStatusButton())

    expect(await screen.findByText(/starts and stops this server itself/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Start$/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Stop$/ })).toBeNull()
  })

  it('puts the MCP configuration action in the footer and not the header', async () => {
    renderApp()
    await screen.findByText('A ticket')

    // The header's plug icon moved here, so connection actions have one home.
    expect(screen.queryByRole('button', { name: /copy mcp configuration/i })).toBeNull()

    await user.click(await findMcpStatusButton())
    expect(await screen.findByRole('button', { name: /copy mcp configuration/i })).toBeTruthy()
  })

  it('turns AI access on for this project from the panel and shows it at once', async () => {
    api.mcpStatus = vi.fn().mockResolvedValue(
      mcpStatus({
        shared: [
          { pid: 1, startedAt: 'x', connectedAt: new Date().toISOString(), lastSeenAt: 'x' },
        ],
      }),
    )
    api.setMcpAccess = vi.fn().mockResolvedValue({
      ok: true,
      value: { checkoutPath: CHECKOUT, enabled: true, checkoutId: 'c1', problem: null },
    })
    renderApp()
    await user.click(await screen.findByRole('button', { name: /MCP not allowed here/i }))

    const toggle = await screen.findByRole('switch', { name: /allow ai access through mcp/i })
    expect(screen.getByText(/every project with this on, not only this one/i)).toBeTruthy()
    await user.click(toggle)

    expect(api.setMcpAccess).toHaveBeenCalledWith(CHECKOUT, true)
    await waitFor(() => expect((toggle as HTMLInputElement).checked).toBe(true))
    expect(await screen.findByText(/Allowed through the shared connection/)).toBeTruthy()
  })

  it('keeps the setting as it was and says why when saving fails', async () => {
    api.setMcpAccess = vi.fn().mockResolvedValue({
      ok: false,
      code: 'registry_write_failed',
      message: 'The MCP project access list could not be saved.',
    })
    renderApp()
    await user.click(await findMcpStatusButton())

    const toggle = await screen.findByRole('switch', { name: /allow ai access through mcp/i })
    await user.click(toggle)

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect((toggle as HTMLInputElement).checked).toBe(false)
  })

  it('reports unknown when the folder could not be read', async () => {
    api.mcpStatus = vi.fn().mockResolvedValue(mcpStatus({ unobservable: 'EPERM' }))
    renderApp()

    expect(await screen.findByText('MCP status unknown')).toBeTruthy()
  })

  it('picks up a connection that appears while the window stays open', async () => {
    api.mcpStatus = vi.fn().mockResolvedValue(mcpStatus())
    renderApp()
    await screen.findByText('MCP not connected')

    api.mcpStatus = vi.fn().mockResolvedValue(connectedSession())

    expect(await screen.findByText('MCP connected', undefined, { timeout: 8_000 })).toBeTruthy()
  }, 10_000)

  it('discards a reading that arrives for a project the user has left', async () => {
    const other = 'C:\\projects\\other'
    api.mcpStatus = vi.fn().mockImplementation(async (path: string) =>
      path === CHECKOUT
        ? connectedSession()
        : // The other project has nothing running; its footer must say so.
          mcpStatus({ checkoutPath: other }),
    )
    api.rememberedProjects = vi.fn().mockResolvedValue([
      { path: CHECKOUT, name: 'Demo', unavailable: null },
      { path: other, name: 'Other', unavailable: null },
    ])
    api.readProject = vi.fn().mockImplementation(async (path: string) => ({
      ok: true,
      value: project({ name: path === CHECKOUT ? 'Demo' : 'Other', checkoutPath: path }),
    }))

    renderApp()
    await screen.findByText('MCP connected')

    await user.click(screen.getByRole('button', { name: 'Demo' }))
    const menu = await screen.findByRole('dialog')
    await user.click(within(menu).getByRole('button', { name: /switch to other/i }))

    await waitFor(() => expect(screen.getByText('MCP not connected')).toBeTruthy())
    expect(screen.queryByText('MCP connected')).toBeNull()
  })
})
