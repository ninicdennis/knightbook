import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi } from '../shared/contract.js'
import { makeApi, project, renderApp, ticket } from './test-fixtures.js'

/**
 * Opening a folder with no project records used to tell the user to spend AI
 * credit just to get an empty project. It now sets the folder up in the app.
 */

const FOLDER = 'C:\\code\\my-app'

let api: KnightbookApi
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  user = userEvent.setup()
  api = makeApi()
  api.rememberedProjects = vi.fn().mockResolvedValue([])
  api.chooseProject = vi.fn().mockResolvedValue({ path: FOLDER, initialized: false })
  api.inspectFolder = vi.fn().mockResolvedValue({
    ok: true,
    value: { name: 'my-app', suggestions: ['README.md', 'docs'] },
  })
  api.setUpFolder = vi.fn().mockResolvedValue({ ok: true, value: { path: FOLDER, warning: null } })
  api.readProject = vi.fn().mockResolvedValue({
    ok: true,
    value: project({ name: 'my-app', checkoutPath: FOLDER, tickets: [ticket()] }),
  })
  window.knightbook = api
})

async function chooseBareFolder() {
  renderApp()
  await user.click(await screen.findByRole('button', { name: /choose a project folder/i }))
  return await screen.findByRole('heading', { name: /set up this folder/i })
}

describe('a folder with no project records', () => {
  it('explains what a project is and what setup touches, without calling it an error', async () => {
    await chooseBareFolder()

    expect(
      screen.getByText(/shared workspace of markdown documents and a kanban board/i),
    ).toBeTruthy()
    expect(screen.getByText(/adds one folder/i)).toBeTruthy()
    expect(screen.getByText(/changes no existing file/i)).toBeTruthy()
    expect(screen.getByText(FOLDER)).toBeTruthy()
    expect(screen.queryByText(/could not set up/i)).toBeNull()
  })

  it('writes nothing until the person asks', async () => {
    await chooseBareFolder()
    await screen.findByLabelText(/project name/i)

    expect(api.setUpFolder).not.toHaveBeenCalled()
  })

  it('offers the folder name as the project name, and the documents already there', async () => {
    await chooseBareFolder()

    expect(((await screen.findByLabelText(/project name/i)) as HTMLInputElement).value).toBe(
      'my-app',
    )
    expect(screen.getByRole('checkbox', { name: 'README.md' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: /the docs folder/i })).toBeTruthy()
    expect(screen.getByText(/nothing is moved, copied or edited/i)).toBeTruthy()
  })

  it('offers no documents when there are none', async () => {
    api.inspectFolder = vi
      .fn()
      .mockResolvedValue({ ok: true, value: { name: 'bare', suggestions: [] } })
    await chooseBareFolder()
    await screen.findByLabelText(/project name/i)

    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})

describe('setting up from the app', () => {
  it('sets up the folder and opens the project straight away', async () => {
    await chooseBareFolder()

    await user.click(await screen.findByRole('button', { name: /set up this folder/i }))

    await waitFor(() =>
      expect(api.setUpFolder).toHaveBeenCalledWith(FOLDER, 'my-app', ['README.md', 'docs']),
    )
    expect(await screen.findByText('A ticket')).toBeTruthy()
    expect(api.readProject).toHaveBeenLastCalledWith(FOLDER)
  })

  it('includes only the documents that are still ticked, under the name that was typed', async () => {
    await chooseBareFolder()
    const name = await screen.findByLabelText(/project name/i)
    await user.clear(name)
    await user.type(name, 'Renamed')
    await user.click(screen.getByRole('checkbox', { name: 'README.md' }))

    await user.click(screen.getByRole('button', { name: /set up this folder/i }))

    await waitFor(() => expect(api.setUpFolder).toHaveBeenCalledWith(FOLDER, 'Renamed', ['docs']))
  })

  it('names the specific failure, stays on the screen, and can try again', async () => {
    api.setUpFolder = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        code: 'unexpected_error',
        message: 'Permission denied: Knightbook is not allowed to write in this folder.',
      })
      .mockResolvedValueOnce({ ok: true, value: { path: FOLDER, warning: null } })
    await chooseBareFolder()

    await user.click(await screen.findByRole('button', { name: /set up this folder/i }))

    expect(await screen.findByText(/permission denied/i)).toBeTruthy()
    expect(screen.getByRole('heading', { name: /set up this folder/i })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /set up this folder/i }))
    expect(await screen.findByText('A ticket')).toBeTruthy()
  })

  it('reports an existing .projectspace with unrelated files and does not open anything', async () => {
    api.setUpFolder = vi.fn().mockResolvedValue({
      ok: false,
      code: 'already_exists',
      message: '.projectspace/ already exists and holds unrelated files (notes.txt).',
    })
    await chooseBareFolder()

    await user.click(await screen.findByRole('button', { name: /set up this folder/i }))

    expect(await screen.findByText(/unrelated files \(notes\.txt\)/i)).toBeTruthy()
    expect(api.readProject).not.toHaveBeenCalledWith(FOLDER)
  })

  it('opens the project and says so when a document could not be included', async () => {
    api.setUpFolder = vi.fn().mockResolvedValue({
      ok: true,
      value: { path: FOLDER, warning: 'The project was set up, but docs could not be included.' },
    })
    await chooseBareFolder()

    await user.click(await screen.findByRole('button', { name: /set up this folder/i }))

    expect(await screen.findByText('A ticket')).toBeTruthy()
    expect(await screen.findByText(/could not be included/i)).toBeTruthy()
  })

  it('says why it cannot look at the folder, instead of showing a form that will fail', async () => {
    api.inspectFolder = vi.fn().mockResolvedValue({
      ok: false,
      code: 'unexpected_error',
      message: 'Choose the folder again to set it up.',
    })
    await chooseBareFolder()

    expect(await screen.findByText(/choose the folder again/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^set up this folder$/i })).toBeNull()
  })

  it('lets the person pick a different folder instead', async () => {
    await chooseBareFolder()
    await screen.findByLabelText(/project name/i)

    await user.click(screen.getByRole('button', { name: /choose a different folder/i }))

    await waitFor(() => expect(api.chooseProject).toHaveBeenCalledTimes(2))
  })
})

describe('connecting an AI tool afterwards', () => {
  it('puts the copy-configuration action on the setup screen, for this folder', async () => {
    await chooseBareFolder()
    const section = (await screen.findByText(/connecting an ai tool/i)).parentElement as HTMLElement

    expect(
      await within(section).findByRole('button', { name: /copy mcp configuration/i }),
    ).toBeTruthy()
    expect(api.mcpLaunchCommand).toHaveBeenCalledWith(FOLDER)
  })
})
