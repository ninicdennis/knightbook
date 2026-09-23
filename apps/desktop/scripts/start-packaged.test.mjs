// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findPackagedApp } from './start-packaged.mjs'

/**
 * Each platform's layout is built here as plain files, so all three are checked
 * from any machine rather than only on the one that happens to run them.
 */

let release

beforeEach(async () => {
  release = await mkdtemp(join(tmpdir(), 'knightbook-start-packaged-'))
})

afterEach(async () => {
  await rm(release, { recursive: true, force: true })
})

async function files(directory, names) {
  await mkdir(directory, { recursive: true })
  for (const name of names) await writeFile(join(directory, name), '')
}

describe('finding the packaged app', () => {
  it('finds the Windows executable among the helper files', async () => {
    const dir = join(release, 'win-unpacked')
    await files(dir, ['Knightbook.exe', 'ffmpeg.dll', 'LICENSE', 'resources.pak'])
    await mkdir(join(dir, 'resources'))

    expect(await findPackagedApp(release, 'win32')).toEqual({
      kind: 'binary',
      path: join(dir, 'Knightbook.exe'),
    })
  })

  it('finds the Linux binary, not the folders or helpers without extensions', async () => {
    const dir = join(release, 'linux-unpacked')
    await files(dir, ['knightbook', 'chrome-sandbox', 'LICENSE', 'version', 'libffmpeg.so'])
    await mkdir(join(dir, 'resources'))
    await mkdir(join(dir, 'locales'))

    expect(await findPackagedApp(release, 'linux')).toEqual({
      kind: 'binary',
      path: join(dir, 'knightbook'),
    })
  })

  it('opens the macOS bundle whatever the output folder is called', async () => {
    await mkdir(join(release, 'mac-arm64', 'Knightbook.app', 'Contents'), { recursive: true })

    expect(await findPackagedApp(release, 'darwin')).toEqual({
      kind: 'bundle',
      path: join(release, 'mac-arm64', 'Knightbook.app'),
    })
  })

  it('reports nothing rather than guessing when nothing has been packaged', async () => {
    expect(await findPackagedApp(release, 'win32')).toBeNull()
    expect(await findPackagedApp(join(release, 'missing'), 'linux')).toBeNull()
  })

  it('refuses to pick when more than one executable could be the app', async () => {
    await files(join(release, 'win-unpacked'), ['Knightbook.exe', 'Other.exe'])

    expect(await findPackagedApp(release, 'win32')).toBeNull()
  })
})
