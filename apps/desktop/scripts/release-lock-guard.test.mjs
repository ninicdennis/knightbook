// @vitest-environment node
import { spawn } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkReleaseDir, heldFiles } from './release-lock-guard.mjs'

/**
 * The guard in front of `pack:dir` (ticket 5ebdd851). A real process is run from
 * the folder on Windows, because a running executable is what refused the delete
 * that left the package half-removed; no mock reproduces that lock.
 */

let release

beforeEach(async () => {
  release = await mkdtemp(join(tmpdir(), 'knightbook-release-guard-'))
})

afterEach(async () => {
  await rm(release, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})

async function packagedLayout() {
  const output = join(release, 'win-unpacked')
  await mkdir(join(output, 'resources', 'mcp'), { recursive: true })
  await writeFile(join(output, 'resources.pak'), 'pak')
  await writeFile(join(output, 'resources', 'mcp', 'server.mjs'), '')
  return output
}

describe('the release folder guard', () => {
  it('lets packaging go ahead when nothing has been packaged yet', async () => {
    expect(await checkReleaseDir(release, 'win32')).toBeNull()
  })

  it('lets packaging go ahead when nothing in the package is in use', async () => {
    await packagedLayout()
    expect(await checkReleaseDir(release, 'win32')).toBeNull()
  })

  it('never checks on macOS or Linux, where a running file can be replaced', async () => {
    expect(await checkReleaseDir(join(release, 'missing'), 'linux')).toBeNull()
    expect(await checkReleaseDir(join(release, 'missing'), 'darwin')).toBeNull()
  })

  it.runIf(process.platform === 'win32')(
    'refuses while a program runs from the package, and changes nothing',
    async () => {
      const output = await packagedLayout()
      const runtime = join(output, 'resources', 'mcp', 'node.exe')
      await copyFile(process.execPath, runtime)
      const before = (await stat(runtime)).mtimeMs

      const child = spawn(runtime, ['-e', 'setTimeout(() => {}, 20000)'], { stdio: 'ignore' })
      try {
        await new Promise((resolve) => child.once('spawn', resolve))
        expect(await heldFiles(output)).toEqual(['resources/mcp/node.exe'])

        const refusal = await checkReleaseDir(release, 'win32')
        expect(refusal).toContain('resources/mcp/node.exe')
        expect(refusal).toContain('Nothing has been changed')
        expect((await stat(runtime)).mtimeMs).toBe(before)
        expect((await stat(join(output, 'resources.pak'))).size).toBe(3)
      } finally {
        child.kill()
        await new Promise((resolve) => child.once('exit', resolve))
      }
    },
    30_000,
  )
})
