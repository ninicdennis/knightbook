// @vitest-environment node
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const USER_DATA = join('/home/you/.config', 'Knightbook')
const RESOURCES = join('/tmp/.mount_KnightAbc123', 'resources')

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getPath: (name: string) => (name === 'userData' ? USER_DATA : ''),
    getAppPath: () => '',
  },
  ipcMain: { handle: vi.fn() },
}))

Object.defineProperty(process, 'resourcesPath', { value: RESOURCES, configurable: true })

const { mcpLaunchCommand, NODE_BINARY } = await import('./mcp-resources.js')

describe('mcpLaunchCommand', () => {
  it('names the installed resources when not running as an AppImage', () => {
    const { command, args } = mcpLaunchCommand({})
    expect(command).toBe(join(RESOURCES, 'mcp', NODE_BINARY))
    expect(args[0]).toBe(join(RESOURCES, 'mcp', 'server.mjs'))
    expect(args.slice(1)).toEqual(['--registry', join(USER_DATA, 'mcp-access.json')])
  })

  it('names the persistent copy, never the AppImage mount, when running as one', () => {
    const { command, args } = mcpLaunchCommand({ APPIMAGE: '/home/you/Knightbook.AppImage' })
    expect(command).toBe(join(USER_DATA, 'mcp-server', NODE_BINARY))
    expect(args[0]).toBe(join(USER_DATA, 'mcp-server', 'server.mjs'))
    expect(args.slice(1)).toEqual(['--registry', join(USER_DATA, 'mcp-access.json')])
    expect(JSON.stringify({ command, args })).not.toContain('.mount_')
  })
})
