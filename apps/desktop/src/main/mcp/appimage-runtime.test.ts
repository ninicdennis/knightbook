// @vitest-environment node
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { registrySessionsDir } from '@knightbook/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  appImageRuntimeProblem,
  isAppImage,
  persistentRuntimeDir,
  prepareAppImageRuntime,
  syncRuntimeCopy,
} from './appimage-runtime.js'

const FILES = [
  { name: 'node', executable: true },
  { name: 'server.mjs', executable: false },
]

let sandbox: string
let sourceDir: string
let targetDir: string

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'knightbook-appimage-'))
  // Stands in for /tmp/.mount_…/resources/mcp inside the AppImage.
  sourceDir = join(sandbox, 'mount', 'mcp')
  targetDir = join(sandbox, 'user-data', 'mcp-server')
  await mkdir(sourceDir, { recursive: true })
  await writeFile(join(sourceDir, 'node'), 'node binary v1')
  await writeFile(join(sourceDir, 'server.mjs'), 'server v1')
})

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true })
})

describe('persistentRuntimeDir', () => {
  it('is its own folder, apart from the shared server session records beside the registry', () => {
    const userData = join(sandbox, 'user-data')
    const sessions = registrySessionsDir(join(userData, 'mcp-access.json'))
    const copy = persistentRuntimeDir(userData)
    expect(sessions.startsWith(`${copy}${sep}`)).toBe(false)
    expect(copy.startsWith(`${dirname(sessions)}${sep}`)).toBe(false)
    expect(copy).not.toBe(dirname(sessions))
  })
})

describe('isAppImage', () => {
  it('is true only when the AppImage runtime has set APPIMAGE', () => {
    expect(isAppImage({ APPIMAGE: '/home/you/Knightbook.AppImage' })).toBe(true)
    expect(isAppImage({})).toBe(false)
    expect(isAppImage({ APPIMAGE: '' })).toBe(false)
  })
})

describe('syncRuntimeCopy', () => {
  it('copies both files on the first launch', async () => {
    const result = await syncRuntimeCopy(sourceDir, targetDir, FILES)

    expect(result).toEqual({ copied: ['node', 'server.mjs'], unchanged: [] })
    expect(await readFile(join(targetDir, 'node'), 'utf8')).toBe('node binary v1')
    expect(await readFile(join(targetDir, 'server.mjs'), 'utf8')).toBe('server v1')
  })

  it('leaves an identical copy untouched on the next launch', async () => {
    await syncRuntimeCopy(sourceDir, targetDir, FILES)
    const before = await stat(join(targetDir, 'node'))

    const result = await syncRuntimeCopy(sourceDir, targetDir, FILES)

    expect(result).toEqual({ copied: [], unchanged: ['node', 'server.mjs'] })
    // Same file, not a rewrite: a client running it is not disturbed.
    const after = await stat(join(targetDir, 'node'))
    expect(after.ino).toBe(before.ino)
    expect(after.mtimeMs).toBe(before.mtimeMs)
  })

  it('replaces only the file that changed after an AppImage update', async () => {
    await syncRuntimeCopy(sourceDir, targetDir, FILES)
    await writeFile(join(sourceDir, 'server.mjs'), 'server v2')

    const result = await syncRuntimeCopy(sourceDir, targetDir, FILES)

    expect(result).toEqual({ copied: ['server.mjs'], unchanged: ['node'] })
    expect(await readFile(join(targetDir, 'server.mjs'), 'utf8')).toBe('server v2')
    // No temporary file is left behind beside the runtime.
    expect((await readdir(targetDir)).sort()).toEqual(['node', 'server.mjs'])
  })

  // Windows has no executable bit to keep; the AppImage only ever runs on Linux.
  it.skipIf(process.platform === 'win32')('keeps node executable', async () => {
    await syncRuntimeCopy(sourceDir, targetDir, FILES)
    expect((await stat(join(targetDir, 'node'))).mode & 0o111).toBe(0o111)
    expect((await stat(join(targetDir, 'server.mjs'))).mode & 0o111).toBe(0)
  })
})

describe('prepareAppImageRuntime', () => {
  it('reports nothing when the copy is in place', async () => {
    const userData = join(sandbox, 'user-data')
    expect(await prepareAppImageRuntime(sourceDir, userData, 'node')).toBeNull()
    expect(await appImageRuntimeProblem()).toBeNull()
    expect(await readFile(join(persistentRuntimeDir(userData), 'node'), 'utf8')).toBe(
      'node binary v1',
    )
  })

  it('reports a failed copy with where it was going and why', async () => {
    await rm(join(sourceDir, 'server.mjs'))
    const problem = await prepareAppImageRuntime(sourceDir, join(sandbox, 'user-data'), 'node')

    expect(problem).toContain('could not be copied to')
    expect(problem).toContain('mcp-server')
    expect(problem).toContain('ENOENT')
    expect(await appImageRuntimeProblem()).toBe(problem)
  })
})
