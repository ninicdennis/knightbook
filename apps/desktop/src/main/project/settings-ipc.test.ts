// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  app: { getVersion: vi.fn(() => '0.10.3') },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }),
  },
}))

const { registerSettingsHandlers } = await import('./settings-ipc.js')

/**
 * The version the settings screen shows comes from Electron's own reading of the
 * packaged app (ticket b411cc60), not from a copy kept in the renderer.
 */
describe('the app version operation', () => {
  beforeEach(() => {
    handlers.clear()
    registerSettingsHandlers()
  })

  it('answers with what app.getVersion() reports', async () => {
    const handler = handlers.get('app:version')

    expect(handler).toBeDefined()
    expect(await handler!({})).toBe('0.10.3')
  })
})
