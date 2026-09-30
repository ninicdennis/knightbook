import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi } from '../../shared/contract.js'
import type { SkillTargetView } from '../../shared/skill-setup-contract.js'
import {
  CHECKOUT,
  connectedSession,
  findMcpStatusButton,
  makeApi,
  renderApp,
  skillSetup,
} from '../test/test-fixtures.js'

/**
 * Guided setup from the installed app. What matters most is what it will not
 * do: overwrite a copy the user may have edited, or claim a client loaded the
 * skill because a file exists.
 */

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  window.knightbook = api
})

function withStates(states: SkillTargetView['state'][]) {
  const base = skillSetup()
  return skillSetup({
    targets: base.targets.map((target, index) => ({ ...target, state: states[index]! })),
  })
}

async function openSetup() {
  await user.click(await findMcpStatusButton())
  await user.click(await screen.findByRole('button', { name: /set up your ai tool/i }))
  return await screen.findByRole('dialog', { name: /set up your ai tool/i })
}

describe('reaching the setup dialog', () => {
  // The longer wait for the first status reading must not turn a missing button
  // into a pass: with a connected client the footer never says "not connected".
  it('still fails when the "MCP not connected" button never appears', async () => {
    api.mcpStatus = vi.fn().mockResolvedValue(connectedSession())
    renderApp()
    // The footer did read its status; it just says something else.
    await findMcpStatusButton(/MCP connected/i)

    await expect(findMcpStatusButton(/MCP not connected/i, 1_500)).rejects.toThrow(
      /Unable to find role="button"/,
    )
  })

  // The case the CI failure was: a first reading slower than the 1 s default.
  it('waits for a first status reading slower than the default wait', async () => {
    const slow = api.mcpStatus
    api.mcpStatus = vi
      .fn()
      .mockImplementation(
        (path: string) => new Promise((resolve) => setTimeout(() => resolve(slow(path)), 1_500)),
      )
    renderApp()

    expect(await findMcpStatusButton()).toBeTruthy()
  })
})

describe('setting up an AI tool', () => {
  it('shows connection and skill installation as separate steps', async () => {
    renderApp()
    const dialog = await openSetup()

    expect(within(dialog).getByText('1. Connect your AI client')).toBeTruthy()
    expect(within(dialog).getByText('2. Give it the workflow skill')).toBeTruthy()
    expect(await within(dialog).findAllByText('Not installed')).toHaveLength(4)
    expect(api.skillSetup).toHaveBeenCalledWith(CHECKOUT)
    expect(
      within(dialog).getByText(/cannot see whether your client loaded the skill/i),
    ).toBeTruthy()
  })

  it('installs into an absent folder and reports where', async () => {
    const installed = withStates(['matching', 'absent', 'absent', 'absent'])
    api.installSkill = vi.fn().mockResolvedValue({ ok: true, value: installed })
    renderApp()
    const dialog = await openSetup()

    await user.click(
      await within(dialog).findByRole('button', { name: /install for claude code, personal/i }),
    )

    expect(api.installSkill).toHaveBeenCalledWith(CHECKOUT, 'claude-personal', 'absent')
    expect(await within(dialog).findByText(/installed in .*\.claude.skills.projectspace/i))
    expect(within(dialog).getByText('Up to date')).toBeTruthy()
  })

  it('asks before updating an old copy, and offers nothing for a changed one', async () => {
    api.skillSetup = vi.fn().mockResolvedValue({
      ok: true,
      value: withStates(['outdated', 'modified', 'matching', 'absent']),
    })
    api.installSkill = vi.fn().mockResolvedValue({
      ok: true,
      value: withStates(['matching', 'modified', 'matching', 'absent']),
    })
    renderApp()
    const dialog = await openSetup()

    await user.click(await within(dialog).findByRole('button', { name: /update for claude code/i }))
    expect(api.installSkill).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: /replace with this version/i }))
    expect(api.installSkill).toHaveBeenCalledWith(CHECKOUT, 'claude-personal', 'outdated')

    expect(within(dialog).getByText(/will not overwrite it/i)).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: /claude code, project/i })).toBeNull()
  })

  it('shows a refused install without losing the list', async () => {
    api.installSkill = vi.fn().mockResolvedValue({
      ok: false,
      code: 'unexpected_error',
      message: 'The folder changed since it was checked: it is now modified. Nothing was written.',
    })
    renderApp()
    const dialog = await openSetup()

    await user.click(
      await within(dialog).findByRole('button', { name: /install for codex, project/i }),
    )

    expect(await within(dialog).findByText(/nothing was written/i)).toBeTruthy()
    expect(within(dialog).getAllByText('Not installed')).toHaveLength(4)
  })

  it('says so when the bundled skill is missing, rather than showing empty targets', async () => {
    api.skillSetup = vi.fn().mockResolvedValue({
      ok: false,
      code: 'unexpected_error',
      message: 'The workflow skill that should ship with the app is missing.',
    })
    renderApp()
    const dialog = await openSetup()

    await waitFor(() => expect(within(dialog).getByText(/should ship with the app/i)).toBeTruthy())
    expect(within(dialog).queryByText('Not installed')).toBeNull()
  })
})
