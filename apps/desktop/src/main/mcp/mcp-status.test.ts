// @vitest-environment node
import {
  grantCheckoutAccess,
  initializeProject,
  openProject,
  recordMcpActivity,
  resolveProjectRoot,
  startMcpSession,
  startSharedMcpSession,
} from '@knightbook/core'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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
  mcpRuntimeDir: () => runtimeDir,
  mcpLaunchCommand: () => ({ command: 'node.exe', args: [] }),
}))

const { readMcpStatus } = await import('./mcp-status.js')

let sandbox: string
let projectDir: string
let runtimeDir: string
let registryPath: string

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'knightbook-mcp-status-'))
  projectDir = join(sandbox, 'project')
  // Deliberately absent: a source checkout that has not been staged yet.
  runtimeDir = join(sandbox, 'no-runtime-here')
  registryPath = join(sandbox, 'app-data', 'mcp-access.json')
  await initializeProject(projectDir, { name: 'Fixture' })
})

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true })
})

describe('observing MCP status', () => {
  it('reports nothing running for a project no server has served', async () => {
    const status = await readMcpStatus(projectDir, registryPath)

    expect(status.live).toHaveLength(0)
    expect(status.stale).toHaveLength(0)
    expect(status.unobservable).toBeNull()
  })

  it('sees a server that recorded itself against this project', async () => {
    const { resolveProjectRoot } = await import('@knightbook/core')
    const session = await startMcpSession(await resolveProjectRoot(projectDir), 4321)
    await session.markConnected()

    const status = await readMcpStatus(projectDir, registryPath)

    expect(status.live).toHaveLength(1)
    expect(status.live[0]!.pid).toBe(4321)
    expect(status.live[0]!.connectedAt).not.toBeNull()
  })

  it('does not see a server serving a different project', async () => {
    const { resolveProjectRoot } = await import('@knightbook/core')
    const other = join(sandbox, 'other')
    await initializeProject(other, { name: 'Other' })
    await startMcpSession(await resolveProjectRoot(other), 4321)

    expect((await readMcpStatus(projectDir, registryPath)).live).toHaveLength(0)
  })

  it('reports a missing bundled runtime without guessing about connections', async () => {
    const status = await readMcpStatus(projectDir, registryPath)

    expect(status.runtimeAvailable).toBe(false)
    expect(status.unobservable).toBeNull()
  })

  it('carries a failed AppImage copy into the status the panel reads', async () => {
    const { prepareAppImageRuntime } = await import('./appimage-runtime.js')
    // No runtime in the source folder, so the copy fails the way a real one would.
    await prepareAppImageRuntime(join(sandbox, 'empty-mount'), join(sandbox, 'app-data'), 'node')

    const status = await readMcpStatus(projectDir, registryPath)

    expect(status.runtimeProblem).toContain('could not be copied')
  })

  it('names the checkout it describes, so a late reply can be discarded', async () => {
    expect((await readMcpStatus(projectDir, registryPath)).checkoutPath).toBe(projectDir)
  })
})

describe('observing the shared connection', () => {
  it('reads whether this checkout is allowed, without touching anything', async () => {
    expect((await readMcpStatus(projectDir, registryPath)).access.enabled).toBe(false)

    const project = await openProject(projectDir)
    await grantCheckoutAccess(registryPath, {
      path: project.root.path,
      projectId: project.frontmatter.id,
      name: 'Fixture',
    })

    const status = await readMcpStatus(project.root.path, registryPath)
    expect(status.access.enabled).toBe(true)
    expect(status.access.checkoutId).not.toBeNull()
  })

  it('reports an unreadable access list as a problem, not as "not allowed"', async () => {
    await mkdir(join(sandbox, 'app-data'), { recursive: true })
    await writeFile(registryPath, 'not json', 'utf8')

    const status = await readMcpStatus(projectDir, registryPath)
    expect(status.access.problem).toMatch(/could not be read/)
  })

  it('counts activity only from a shared session that is still alive', async () => {
    const root = await resolveProjectRoot(projectDir)
    const session = await startSharedMcpSession(registryPath, 99)
    await session.markConnected()
    await recordMcpActivity(root, session.sessionId)
    // Left by a session that has gone: not current use.
    await recordMcpActivity(root, 'gone-session')

    const status = await readMcpStatus(projectDir, registryPath)
    expect(status.shared).toHaveLength(1)
    expect(status.lastActivityAt).not.toBeNull()
    // The shared server never shows up as a server for this project.
    expect(status.live).toHaveLength(0)

    await session.end()
    expect((await readMcpStatus(projectDir, registryPath)).lastActivityAt).toBeNull()
  })
})
