import { describe, expect, it } from 'vitest'
import checkedIn from './releases.json'
import { downloadView } from './download-view'
import { parseReleaseData } from './release-data'
import { fixtureAsset, fixtureRelease } from './test-releases'

/** The error message parseReleaseData gives for `releases`, or '' if it accepts them. */
function problemsWith(releases: unknown[]) {
  try {
    parseReleaseData({ releases })
    return ''
  } catch (error) {
    return (error as Error).message
  }
}

describe('validating the release data', () => {
  it('accepts the checked-in file, which has no releases yet', () => {
    expect(parseReleaseData(checkedIn).releases).toEqual([])
  })

  it('accepts a complete release', () => {
    expect(problemsWith([fixtureRelease('0.3.0')])).toBe('')
  })

  it('names the file and each problem with its location', () => {
    const release = fixtureRelease('0.3.0')
    const { sha256: _dropped, ...withoutChecksum } = release.assets[0]!
    release.assets[0] = withoutChecksum as (typeof release.assets)[0]
    release.assets[1]!.url = release.assets[1]!.url.replace('https:', 'http:')
    const message = problemsWith([release])
    expect(message).toContain('release data in releases.json is not valid')
    expect(message).toMatch(/releases\[0\]\.assets\[0\]\.sha256: /)
    expect(message).toMatch(/releases\[0\]\.assets\[1\]\.url: must be an https:\/\/ URL/)
  })

  it.each(['os', 'arch', 'format', 'minimumOs', 'url', 'filename', 'size', 'sha256', 'signing'])(
    'rejects an asset without its %s, naming it',
    (field) => {
      const release = fixtureRelease('0.3.0')
      delete (release.assets[0] as Record<string, unknown>)[field]
      expect(problemsWith([release])).toMatch(
        new RegExp(`releases\\[0\\]\\.assets\\[0\\]\\.${field}: `),
      )
    },
  )

  it.each(['version', 'channel', 'date', 'notesUrl', 'withdrawn', 'knownIssues', 'assets'])(
    'rejects a release without its %s, naming it',
    (field) => {
      const release = fixtureRelease('0.3.0')
      delete (release as Record<string, unknown>)[field]
      expect(problemsWith([release])).toMatch(new RegExp(`releases\\[0\\]\\.${field}: `))
    },
  )

  it.each([
    [
      'a malformed checksum',
      (r: ReturnType<typeof fixtureRelease>) => (r.assets[0]!.sha256 = 'ABC'),
      /sha256: must be 64/,
    ],
    [
      'a URL that is not the file',
      (r: ReturnType<typeof fixtureRelease>) => (r.assets[0]!.url += '/latest'),
      /url: must end with the filename/,
    ],
    [
      'a filename without the version',
      (r: ReturnType<typeof fixtureRelease>) => (r.assets[0]!.filename = 'Knightbook.exe'),
      /must name version 0\.3\.0/,
    ],
    [
      'a missing minimum OS',
      (r: ReturnType<typeof fixtureRelease>) => (r.assets[0]!.minimumOs = ''),
      /minimumOs/,
    ],
    [
      'an unknown signing state',
      (r: ReturnType<typeof fixtureRelease>) => (r.assets[0]!.signing = 'maybe'),
      /signing/,
    ],
  ])('rejects %s', (_name, spoil, expected) => {
    const release = fixtureRelease('0.3.0')
    spoil(release)
    expect(problemsWith([release])).toMatch(expected)
  })

  it('refuses a build that is not a launch target, such as an AppImage', () => {
    const release = fixtureRelease('0.3.0')
    release.assets.push({ ...fixtureAsset('0.3.0', 'linux-x64'), format: 'appimage' as never })
    expect(problemsWith([release])).toMatch(/format/)
  })

  it('refuses two builds for one platform', () => {
    const release = fixtureRelease('0.3.0')
    release.assets.push(fixtureAsset('0.3.0', 'macos-arm64'))
    expect(problemsWith([release])).toMatch(/a second macos-arm64 asset/)
  })

  it('requires a preview to list its known issues and a withdrawal to give its reason', () => {
    const preview = { ...fixtureRelease('0.4.0', { channel: 'preview' }), knownIssues: [] }
    expect(problemsWith([preview])).toMatch(/a preview must list its known issues/)
    const withdrawn = { ...fixtureRelease('0.3.1'), withdrawn: true }
    expect(problemsWith([withdrawn])).toMatch(/a withdrawn release must say why/)
  })

  it('refuses the same version twice', () => {
    expect(problemsWith([fixtureRelease('0.3.0'), fixtureRelease('0.3.0')])).toMatch(
      /0\.3\.0 appears twice/,
    )
  })
})

describe('choosing what to offer', () => {
  const view = (...releases: ReturnType<typeof fixtureRelease>[]) =>
    downloadView(parseReleaseData({ releases }))

  it('offers nothing when there is no release', () => {
    expect(view()).toEqual({ recommended: null, optInPreview: null, withdrawn: [] })
  })

  it('makes the newest stable release the default, ahead of an older or newer preview', () => {
    const result = view(
      fixtureRelease('0.2.0'),
      fixtureRelease('0.3.0'),
      fixtureRelease('0.4.0', { channel: 'preview' }),
    )
    expect(result.recommended?.release.version).toBe('0.3.0')
    expect(result.optInPreview?.release.version).toBe('0.4.0')
  })

  it('offers no opt-in preview older than the stable release', () => {
    const result = view(fixtureRelease('0.3.0'), fixtureRelease('0.2.0', { channel: 'preview' }))
    expect(result.optInPreview).toBeNull()
  })

  it('compares versions by number, so 0.10.0 is newer than 0.9.0', () => {
    expect(
      view(fixtureRelease('0.9.0'), fixtureRelease('0.10.0')).recommended?.release.version,
    ).toBe('0.10.0')
  })

  it('never recommends a withdrawn release, even the newest', () => {
    const result = view(
      fixtureRelease('0.3.0'),
      fixtureRelease('0.3.1', { withdrawnReason: 'It could not open existing projects.' }),
    )
    expect(result.recommended?.release.version).toBe('0.3.0')
    expect(result.withdrawn.map((release) => release.version)).toEqual(['0.3.1'])
  })

  it('leaves a platform without a build empty rather than substituting another', () => {
    const result = view(fixtureRelease('0.3.0', { targets: ['windows-x64', 'macos-arm64'] }))
    const byTarget = Object.fromEntries(
      result.recommended!.choices.map((choice) => [
        choice.target.key,
        choice.asset?.filename ?? null,
      ]),
    )
    expect(byTarget).toEqual({
      'windows-x64': 'Knightbook-0.3.0-windows-x64.exe',
      'macos-arm64': 'Knightbook-0.3.0-macos-arm64.dmg',
      'macos-x64': null,
      'linux-x64': null,
    })
  })
})
