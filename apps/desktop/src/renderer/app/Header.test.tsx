import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeApi, project, renderApp } from '../test/test-fixtures.js'

/**
 * The header is two rows: the project menu, search and settings, then the view
 * tabs (D-029). The name truncates on screen so it cannot push the controls out
 * of the window, but truncation is visual only: the full text stays in the
 * document, where assistive technology reads it. The checkout path moved into
 * the project menu, where it is shown whole and can be copied.
 */

const LONG_PATH = String.raw`C:\Users\someone\Projects\clients\acme\worktrees\feature-branch\second-clone`
const LONG_NAME = 'A long project name'

let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  const api = makeApi()
  api.readProject = async () => ({
    ok: true,
    value: project({ name: LONG_NAME, checkoutPath: LONG_PATH }),
  })
  window.knightbook = api
})

describe('the project header', () => {
  it('names the project as the page heading, and the name opens the project menu', async () => {
    renderApp()
    const heading = await screen.findByRole('heading', { level: 1, name: LONG_NAME })
    const trigger = within(heading).getByRole('button', { name: LONG_NAME })
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')

    await user.click(trigger)
    const menu = await screen.findByRole('dialog')
    expect(within(menu).getByText(/open now/i)).toBeTruthy()
  })

  it('keeps the checkout path out of the header and whole in the project menu', async () => {
    renderApp()
    await screen.findByRole('heading', { level: 1, name: LONG_NAME })
    expect(screen.queryByText(LONG_PATH)).toBeNull()

    await user.click(screen.getByRole('button', { name: LONG_NAME }))
    expect(within(await screen.findByRole('dialog')).getByText(LONG_PATH)).toBeTruthy()
  })

  it('copies the checkout path from the project menu', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    renderApp()
    await user.click(await screen.findByRole('button', { name: LONG_NAME }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /copy path/i }),
    )

    expect(writeText).toHaveBeenCalledWith(LONG_PATH)
    expect(await screen.findByRole('button', { name: /copied/i })).toBeTruthy()
  })

  it('keeps every header control reachable', async () => {
    renderApp()
    await screen.findByRole('heading', { level: 1, name: LONG_NAME })
    for (const name of [/search tickets and documents/i, /open settings/i, /refresh from disk/i]) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
    const views = screen.getByRole('tablist', { name: 'Project views' })
    for (const name of ['Board', 'Documents', 'Plans', 'Archive']) {
      expect(within(views).getByRole('tab', { name })).toBeTruthy()
    }
  })

  it('marks the open view and switches on click', async () => {
    renderApp()
    const board = await screen.findByRole('tab', { name: 'Board' })
    expect(board.getAttribute('aria-selected')).toBe('true')

    await user.click(screen.getByRole('tab', { name: 'Plans' }))
    expect(screen.getByRole('tab', { name: 'Plans' }).getAttribute('aria-selected')).toBe('true')
    expect(board.getAttribute('aria-selected')).toBe('false')
  })
})
