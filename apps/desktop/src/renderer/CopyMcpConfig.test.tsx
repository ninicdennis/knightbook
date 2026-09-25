import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi } from '../shared/contract.js'
import { makeApi, renderApp } from './test-fixtures.js'

/**
 * Copying the MCP configuration for one client. The snippet formats have their
 * own tests in shared; these cover what the window does with them: the choice,
 * what reaches the clipboard, and saying where it goes or that it failed.
 */

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  window.knightbook = api
})

async function openCopyMenu() {
  renderApp()
  await user.click(await screen.findByRole('button', { name: /MCP not connected/i }))
  await user.click(await screen.findByRole('button', { name: /copy mcp configuration/i }))
  return await screen.findByRole('menu')
}

describe('copying the MCP configuration', () => {
  it('offers Claude, Codex, OpenCode and a plain fallback', async () => {
    const menu = await openCopyMenu()
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]')).map((i) => i.textContent)
    expect(items).toEqual(['Claude Code or Claude Desktop', 'Codex', 'OpenCode', 'Another client'])
  })

  it('copies the complete snippet for the chosen client and says where it goes', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    await openCopyMenu()
    await user.click(screen.getByRole('menuitem', { name: 'Codex' }))

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    const copied = writeText.mock.calls[0]![0]
    expect(copied).toMatch(/^\[mcp_servers\.knightbook\]\ncommand = 'node\.exe'\n/)
    expect(copied).toContain("args = ['server.mjs', '--registry', 'access.json']")
    expect(
      await screen.findByText(/Copied for Codex\. Paste it into ~\/\.codex\/config\.toml/),
    ).toBeTruthy()
  })

  it('says so when the clipboard refused, rather than claiming it copied', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    await openCopyMenu()
    await user.click(screen.getByRole('menuitem', { name: 'OpenCode' }))

    expect(await screen.findByText(/nothing was copied for OpenCode/)).toBeTruthy()
    expect(screen.queryByText(/Copied for/)).toBeNull()
  })
})
