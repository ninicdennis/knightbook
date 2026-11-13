import { describe, expect, it } from 'vitest'
import {
  compareVersions,
  parseVersion,
  pickUpdate,
  releaseDownloadBase,
  updateMode,
} from './release-feed.js'

/**
 * Which release the app offers (D-056), from data shaped like GitHub's
 * `GET /repos/{owner}/{repo}/releases` answer.
 */

function release(tag: string, extra: Record<string, unknown> = {}) {
  return {
    tag_name: tag,
    name: `Knightbook ${tag.replace(/^v/, '')}`,
    draft: false,
    prerelease: true,
    html_url: `https://github.com/ninicdennis/knightbook/releases/tag/${tag}`,
    assets: [{ name: `Knightbook-${tag.slice(1)}-windows-x64.exe` }, { name: 'latest.yml' }],
    ...extra,
  }
}

describe('choosing the release to offer', () => {
  it('offers the newest prerelease, since every release so far is one', () => {
    const offer = pickUpdate([release('v0.4.0'), release('v0.3.1')], '0.3.1')
    expect(offer).toMatchObject({ tag: 'v0.4.0', version: '0.4.0', installable: true })
    expect(offer?.notesUrl).toBe('https://github.com/ninicdennis/knightbook/releases/tag/v0.4.0')
  })

  it('compares versions as numbers, so 0.10.0 is newer than 0.9.0', () => {
    // Listed oldest first on purpose: the order GitHub returns is not trusted.
    expect(pickUpdate([release('v0.9.0'), release('v0.10.0')], '0.3.1')?.version).toBe('0.10.0')
  })

  it('offers nothing when the newest release is this version or older', () => {
    expect(pickUpdate([release('v0.3.1'), release('v0.3.0')], '0.3.1')).toBeNull()
    expect(pickUpdate([release('v0.3.0')], '0.4.0')).toBeNull()
    expect(pickUpdate([], '0.4.0')).toBeNull()
  })

  it('skips drafts and withdrawn releases and offers the next good one', () => {
    const offer = pickUpdate(
      [
        release('v0.6.0', { draft: true }),
        release('v0.5.0', { name: 'Withdrawn: Knightbook 0.5.0' }),
        release('v0.4.0'),
      ],
      '0.3.1',
    )
    expect(offer?.version).toBe('0.4.0')
  })

  it('ignores tags that are not versions rather than guessing', () => {
    expect(pickUpdate([release('nightly'), release('website-1')], '0.3.1')).toBeNull()
  })

  it('marks a release without latest.yml as not installable in place', () => {
    const offer = pickUpdate([release('v0.4.0', { assets: [{ name: 'x.exe' }] })], '0.3.1')
    expect(offer?.installable).toBe(false)
  })

  it('throws on an answer that is not a list, so the check fails instead of reading as up to date', () => {
    expect(() => pickUpdate({ message: 'API rate limit exceeded' }, '0.3.1')).toThrow(/list/)
  })

  it('reads one release download folder per tag', () => {
    expect(releaseDownloadBase('v0.4.0')).toBe(
      'https://github.com/ninicdennis/knightbook/releases/download/v0.4.0/',
    )
  })
})

describe('version order', () => {
  const order = (a: string, b: string) =>
    Math.sign(compareVersions(parseVersion(a)!, parseVersion(b)!))

  it('puts a prerelease before its release and orders prerelease parts', () => {
    expect(order('1.0.0-beta.1', '1.0.0')).toBe(-1)
    expect(order('1.0.0-beta.2', '1.0.0-beta.10')).toBe(-1)
    expect(order('1.0.0-alpha', '1.0.0-beta')).toBe(-1)
    expect(order('v1.2.3', '1.2.3')).toBe(0)
  })

  it('refuses text that is not a version', () => {
    expect(parseVersion('1.2')).toBeNull()
    expect(parseVersion('latest')).toBeNull()
  })
})

describe('what each build does with an update', () => {
  it('installs in place on Windows and only notifies on macOS and Linux', () => {
    expect(updateMode('win32', true, '0.4.0')).toBe('install')
    expect(updateMode('darwin', true, '0.4.0')).toBe('notify')
    expect(updateMode('linux', true, '0.4.0')).toBe('notify')
  })

  it('never checks from a development run or an unstamped package', () => {
    expect(updateMode('win32', false, '0.4.0')).toBe('off')
    expect(updateMode('win32', true, '0.0.0')).toBe('off')
  })
})
