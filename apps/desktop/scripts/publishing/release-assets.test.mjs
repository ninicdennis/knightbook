// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { checkInstallers } from './release-assets.mjs'

const complete = [
  { name: 'Knightbook-0.2.0-windows-x64.exe', size: 1 },
  { name: 'Knightbook-0.2.0-macos-arm64.dmg', size: 1 },
  { name: 'Knightbook-0.2.0-macos-x64.dmg', size: 1 },
  { name: 'Knightbook-0.2.0-linux-x64.deb', size: 1 },
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
