import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnightbookApi } from '../../shared/contract.js'
import { CHECKOUT, makeApi, project, renderApp } from '../test/test-fixtures.js'

/**
 * The window names the open project so the right one can be found from the
 * taskbar. The title text itself is built by the host (window-title.ts); this
 * covers when the renderer asks for it.
 */

let api: KnightbookApi

beforeEach(() => {
  api = makeApi()
  window.knightbook = api
})

describe('the window title', () => {
  it('names the open project and its checkout, from the loaded record', async () => {
    renderApp()
    await screen.findByText('A ticket')

    expect(api.showProjectInWindowTitle).toHaveBeenLastCalledWith({
      name: 'Demo',
      checkoutPath: CHECKOUT,
    })
  })

  it('claims no project on the welcome screen', async () => {
    api.rememberedProjects = vi.fn().mockResolvedValue([])
    renderApp()

    await waitFor(() => expect(api.showProjectInWindowTitle).toHaveBeenCalled())
    expect(api.showProjectInWindowTitle).toHaveBeenLastCalledWith(null)
    expect(api.showProjectInWindowTitle).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: expect.any(String) }),
    )
  })

  it('claims no project when the last project could not be opened', async () => {
    api.readProject = vi
      .fn()
      .mockResolvedValue({ ok: false, code: 'not_found', message: 'The folder is gone.' })
    renderApp()

    await screen.findByText(/the folder is gone/i)
    expect(api.showProjectInWindowTitle).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: expect.any(String) }),
    )
  })

  it('follows a name changed on disk and picked up by a refresh', async () => {
    renderApp()
    await screen.findByText('A ticket')

    api.readProject = vi.fn().mockResolvedValue({ ok: true, value: project({ name: 'Renamed' }) })
    window.dispatchEvent(new Event('focus'))

    await waitFor(() =>
      expect(api.showProjectInWindowTitle).toHaveBeenLastCalledWith({
        name: 'Renamed',
        checkoutPath: CHECKOUT,
      }),
    )
  })
})
