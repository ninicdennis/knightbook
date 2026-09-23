import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchableBinaryIn } from './packaged.js'
import { removeWorkspace } from './stage.js'

/**
 * Finding the binary to launch, against the directory layouts electron-builder
 * actually produces.
 *
 * This exists because the Linux branch could only be exercised by running CI,
 * and it was wrong: filtering on the extension alone let `resources/`,
 * `locales/`, `LICENSE` and `version` through, so the search found several
 * candidates and gave up. Worse, the failure surfaced as "no packaged app",
 * which made the MCP suites look unbuilt rather than pointing at the real fault.
 *
 * The layouts below are the contents of a real `--dir` build, so a future
 * electron-builder that adds another extensionless file makes this fail here
 * rather than on one platform's CI job.
 */

let workspace: string

/** Creates a directory of empty files, and real subdirectories for any name ending in `/`. */
async function layout(name: string, entries: string[]): Promise<string> {
  const dir = join(workspace, name)
  await mkdir(dir, { recursive: true })
  for (const entry of entries) {
    if (entry.endsWith('/')) await mkdir(join(dir, entry.slice(0, -1)), { recursive: true })
    else await writeFile(join(dir, entry), '')
  }
  return dir
}

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'knightbook-layout-'))
})

afterAll(async () => {
  await removeWorkspace(workspace)
})

describe('finding the binary a user would launch', () => {
  it('picks the app out of a Linux build', async () => {
    const dir = await layout('linux-unpacked', [
      'knightbook',
      'chrome-sandbox',
      'chrome_crashpad_handler',
      'chrome_100_percent.pak',
      'chrome_200_percent.pak',
      'icudtl.dat',
      'libEGL.so',
      'libGLESv2.so',
      'libffmpeg.so',
      'libvk_swiftshader.so',
      'libvulkan.so.1',
      'resources.pak',
      'snapshot_blob.bin',
      'v8_context_snapshot.bin',
      'vk_swiftshader_icd.json',
      'LICENSE',
      'LICENSES.chromium.html',
      'version',
      'locales/',
      'resources/',
    ])

    expect(await launchableBinaryIn(dir, 'linux')).toBe(join(dir, 'knightbook'))
  })

  it('picks the app out of a macOS bundle', async () => {
    const dir = await layout('Knightbook.app', ['Knightbook'])

    expect(await launchableBinaryIn(dir, 'darwin')).toBe(join(dir, 'Knightbook'))
  })

  it('picks the app out of a Windows build', async () => {
    const dir = await layout('win-unpacked', [
      'Knightbook.exe',
      'chrome_100_percent.pak',
      'd3dcompiler_47.dll',
      'ffmpeg.dll',
      'icudtl.dat',
      'LICENSE.electron.txt',
      'resources/',
      'locales/',
    ])

    expect(await launchableBinaryIn(dir, 'win32')).toBe(join(dir, 'Knightbook.exe'))
  })

  it('gives up rather than guessing when two candidates look alike', async () => {
    const dir = await layout('ambiguous', ['knightbook', 'something-else'])

    // Returning either one would be a coin flip, and the caller turns null into
    // a loud failure when REQUIRE_PACKAGED_APP is set.
    expect(await launchableBinaryIn(dir, 'linux')).toBeNull()
  })

  it('reports nothing for a directory that is not there', async () => {
    expect(await launchableBinaryIn(join(workspace, 'absent'), 'linux')).toBeNull()
  })
})
