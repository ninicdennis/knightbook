// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkInstallers, checkUpdateMetadata } from './release-assets.mjs'

const complete = [
  { name: 'Knightbook-0.2.0-windows-x64.exe', size: 1 },
  { name: 'Knightbook-0.2.0-macos-arm64.dmg', size: 1 },
  { name: 'Knightbook-0.2.0-macos-x64.dmg', size: 1 },
  { name: 'Knightbook-0.2.0-linux-x64.deb', size: 1 },
  { name: 'Knightbook-0.2.0-windows-x64.exe.blockmap', size: 1 },
  { name: 'latest.yml', size: 1 },
]

describe('checking the installers before a release', () => {
  it('accepts one installer per target, with or without a checksum list beside them', () => {
    expect(checkInstallers(complete, '0.2.0')).toHaveLength(4)
    expect(
      checkInstallers([...complete, { name: 'SHA256SUMS.txt', size: 1 }], '0.2.0'),
    ).toHaveLength(4)
  })

  it('accepts Debian’s amd64 name for the x64 deb', () => {
    const assets = complete.map((asset) =>
      asset.name.endsWith('.deb') ? { ...asset, name: 'Knightbook-0.2.0-linux-amd64.deb' } : asset,
    )
    expect(checkInstallers(assets, '0.2.0')).toHaveLength(4)
  })

  it('names every problem at once', () => {
    const assets = [
      complete[0],
      complete[1],
      complete[5],
      { name: 'Knightbook-0.1.9-macos-x64.dmg', size: 1 },
      { name: 'Knightbook-0.2.0-linux-x64.AppImage', size: 1 },
    ]
    const attempt = () => checkInstallers(assets, '0.2.0')
    expect(attempt).toThrow(/missing: Linux x64 deb package/)
    expect(attempt).toThrow(/not version 0\.2\.0: Knightbook-0\.1\.9-macos-x64\.dmg/)
    expect(attempt).toThrow(/unexpected files: Knightbook-0\.2\.0-linux-x64\.AppImage/)
  })

  it('refuses a target built twice', () => {
    const assets = [...complete, { name: 'Knightbook-0.2.0-linux-amd64.deb', size: 1 }]
    expect(() => checkInstallers(assets, '0.2.0')).toThrow(/more than one Linux x64 deb package/)
  })
})

describe('the Windows update files (D-056)', () => {
  it('refuses a release without latest.yml or the installer block map', () => {
    const withoutUpdates = complete.slice(0, 4)
    const attempt = () => checkInstallers(withoutUpdates, '0.2.0')
    expect(attempt).toThrow(/missing: Windows update metadata/)
    expect(attempt).toThrow(/missing: Windows installer block map/)
  })

  it('refuses a block map from another version', () => {
    const assets = complete.map((asset) =>
      asset.name.endsWith('.blockmap')
        ? { ...asset, name: 'Knightbook-0.1.9-windows-x64.exe.blockmap' }
        : asset,
    )
    expect(() => checkInstallers(assets, '0.2.0')).toThrow(/not version 0\.2\.0: .*blockmap/)
  })

  async function releaseDir(latest) {
    const dir = await mkdtemp(join(tmpdir(), 'knightbook-update-files-'))
    const installer = 'installer bytes'
    await writeFile(join(dir, 'Knightbook-0.2.0-windows-x64.exe'), installer)
    const sha512 = createHash('sha512').update(installer).digest('base64')
    await writeFile(join(dir, 'latest.yml'), latest(sha512))
    return dir
  }

  // The shape electron-builder 26 writes.
  const yaml = (version, path, sha512) =>
    [
      `version: ${version}`,
      'files:',
      `  - url: ${path}`,
      `    sha512: ${sha512}`,
      '    size: 15',
      `path: ${path}`,
      `sha512: ${sha512}`,
      "releaseDate: '2026-11-13T12:00:00.000Z'",
      '',
    ].join('\n')

  it('accepts metadata that names this version, its installer and that installer’s SHA-512', async () => {
    const dir = await releaseDir((sha) => yaml('0.2.0', 'Knightbook-0.2.0-windows-x64.exe', sha))
    await expect(checkUpdateMetadata(dir, '0.2.0')).resolves.toBeUndefined()
  })

  it('refuses metadata for another version or another installer', async () => {
    const dir = await releaseDir((sha) => yaml('0.1.9', 'Knightbook-0.1.9-windows-x64.exe', sha))
    const attempt = checkUpdateMetadata(dir, '0.2.0')
    await expect(attempt).rejects.toThrow(/names version 0\.1\.9, not 0\.2\.0/)
  })

  it('refuses metadata whose SHA-512 is not the installer’s', async () => {
    const dir = await releaseDir(() => yaml('0.2.0', 'Knightbook-0.2.0-windows-x64.exe', 'AAAA'))
    await expect(checkUpdateMetadata(dir, '0.2.0')).rejects.toThrow(/SHA-512 does not match/)
  })
})
