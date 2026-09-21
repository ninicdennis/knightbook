// @vitest-environment node
import { initializeProject, startMcpSession } from '@knightbook/core'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Electron's `app` is only reachable inside a running Electron process, and the
 * only thing this module needs from it is where the bundled runtime sits. Mocking
 * that one answer keeps the observation logic testable in plain Node.
 */
vi.mock('./mcp-resources.js', () => ({
  NODE_BINARY: 'node.exe',
  mcpResourcesDir: () => runtimeDir,
  mcpLaunchCommand: () => ({ command: 'node.exe', args: [] }),
}))

const { readMcpStatus } = await import('./mcp-status.js')

let sandbox: string
let projectDir: string
let runtimeDir: string

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'knightbook-mcp-status-'))
  projectDir = join(sandbox, 'project')
  // Deliberately absent: a source checkout that has not been staged yet.
  runtimeDir = join(sandbox, 'no-runtime-here')
  await initializeProject(projectDir, { name: 'Fixture' })
})

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true })
})

describe('observing MCP status', () => {
  it('reports nothing running for a project no server has served', async () => {
    const status = await readMcpStatus(projectDir)

    expect(status.live).toHaveLength(0)
    expect(status.stale).toHaveLength(0)
    expect(status.unobservable).toBeNull()
  })

  it('sees a server that recorded itself against this project', async () => {
    const { resolveProjectRoot } = await import('@knightbook/core')
    const session = await startMcpSession(await resolveProjectRoot(projectDir), 4321)
    await session.markConnected()

    const status = await readMcpStatus(projectDir)

    expect(status.live).toHaveLength(1)
    expect(status.live[0]!.pid).toBe(4321)
    expect(status.live[0]!.connectedAt).not.toBeNull()
  })

  it('does not see a server serving a different project', async () => {
    const { resolveProjectRoot } = await import('@knightbook/core')
    const other = join(sandbox, 'other')
    await initializeProject(other, { name: 'Other' })
    await startMcpSession(await resolveProjectRoot(other), 4321)

    expect((await readMcpStatus(projectDir)).live).toHaveLength(0)
  })

  it('reports a missing bundled runtime without guessing about connections', async () => {
    const status = await readMcpStatus(projectDir)

    expect(status.runtimeAvailable).toBe(false)
    expect(status.unobservable).toBeNull()
  })

  it('names the checkout it describes, so a late reply can be discarded', async () => {
    expect((await readMcpStatus(projectDir)).checkoutPath).toBe(projectDir)
  })
})
