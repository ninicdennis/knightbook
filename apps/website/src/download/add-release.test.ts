import { execFile } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import {
  addRelease,
  addReleaseToFile,
  formatReleaseData,
  parseChecksums,
  releaseEntry,
} from './add-release.mjs'
import checkedIn from './releases.json'
import { parseReleaseData, type Release } from './release-data'
import { fixtureRelease } from './test-releases'

const run = promisify(execFile)
const here = import.meta.dirname

/**
 * Fictional installer names, as electron-builder names them; the deb says amd64. The
 * version is one no real release will reach soon: the tests add it to the checked-in
 * releases.json, so a real release of the same version would already be listed.
 */
const FILES = {
  'windows-x64': 'Knightbook-9.9.0-windows-x64.exe',
  'macos-arm64': 'Knightbook-9.9.0-macos-arm64.dmg',
  'macos-x64': 'Knightbook-9.9.0-macos-x64.dmg',
  'linux-x64': 'Knightbook-9.9.0-linux-amd64.deb',
}
const SIZES = { 'windows-x64': 101, 'macos-arm64': 202, 'macos-x64': 303, 'linux-x64': 404 }
const HASHES = {
  'windows-x64': 'a'.repeat(64),
  'macos-arm64': 'b'.repeat(64),
  'macos-x64': 'c'.repeat(64),
  'linux-x64': 'd'.repeat(64),
}
type Key = keyof typeof FILES
const KEYS = Object.keys(FILES) as Key[]

/** What `gh release view --json tagName,publishedAt,isPrerelease,assets` prints. */
function ghRelease(overrides: Record<string, unknown> = {}) {
  return {
    tagName: 'v9.9.0',
    // Late evening in the Americas is already the next day in UTC.
    publishedAt: '2026-11-12T03:15:00Z',
    isPrerelease: true,
    assets: [
      ...KEYS.map((key) => ({ name: FILES[key], size: SIZES[key] })),
      { name: 'SHA256SUMS.txt', size: 400 },
    ],
    ...overrides,
  }
}

const CHECKSUMS = KEYS.map((key) => `${HASHES[key]}  ${FILES[key]}`).join('\n') + '\n'

describe('building the entry for a published release', () => {
  const entry = releaseEntry({
    release: ghRelease(),
    checksums: CHECKSUMS,
    releases: checkedIn.releases,
  })

  it('makes an entry the site accepts, first in the list', () => {
    const { data, added } = addRelease(checkedIn, entry)
    expect(added).toBe(true)
    const parsed = parseReleaseData(data)
    expect(parsed.releases.map((release) => release.version)).toEqual([
      '9.9.0',
      ...checkedIn.releases.map((release) => release.version),
    ])
  })

  it("takes each installer's name and size from the release and its hash from SHA256SUMS.txt", () => {
    const byTarget = Object.fromEntries(
      entry.assets.map((asset) => [`${asset.os}-${asset.arch}`, asset]),
    )
    for (const key of KEYS) {
      expect(byTarget[key], key).toMatchObject({
        filename: FILES[key],
        size: SIZES[key],
        sha256: HASHES[key],
        url: `https://github.com/ninicdennis/knightbook/releases/download/v9.9.0/${FILES[key]}`,
      })
    }
    expect(byTarget['linux-x64']?.format).toBe('deb')
  })

  it('dates it by the UTC day it was published and links its notes', () => {
    expect(entry.version).toBe('9.9.0')
    expect(entry.date).toBe('2026-11-12')
    expect(entry.notesUrl).toBe('https://github.com/ninicdennis/knightbook/releases/tag/v9.9.0')
    expect(entry.withdrawn).toBe(false)
  })

  it('is a preview for a prerelease and stable for a full release', () => {
    expect(entry.channel).toBe('preview')
    const full = releaseEntry({
      release: ghRelease({ isPrerelease: false }),
      checksums: CHECKSUMS,
      releases: checkedIn.releases,
    })
    expect(full.channel).toBe('stable')
  })

  it('copies known issues, systems and signing from the newest release not withdrawn', () => {
    const withdrawn = fixtureRelease('0.3.1', {
      withdrawnReason: 'It lost tickets.',
      knownIssues: ['Only the withdrawn release has this issue.'],
    })
    const kept = fixtureRelease('0.3.0', { knownIssues: ['The kept release has this issue.'] })
    kept.assets.find((asset) => asset.os === 'macos' && asset.arch === 'arm64')!.signing =
      'signed-and-notarized'
    const copied = releaseEntry({
      release: ghRelease(),
      checksums: CHECKSUMS,
      releases: [withdrawn, kept],
    })
    expect(copied.knownIssues).toEqual(['The kept release has this issue.'])
    for (const asset of copied.assets) {
      const earlier = kept.assets.find(
        (old) => old.os === asset.os && old.arch === asset.arch && old.format === asset.format,
      )!
      expect(asset.minimumOs).toBe(earlier.minimumOs)
      expect(asset.signing).toBe(earlier.signing)
    }
  })
})

describe('refusing what cannot be added', () => {
  it('names every missing installer and missing checksum at once', () => {
    const release = ghRelease()
    release.assets = release.assets.filter((asset) => asset.name !== FILES['macos-x64'])
    const checksums = CHECKSUMS.split('\n')
      .filter((line) => !line.endsWith(FILES['linux-x64']))
      .join('\n')
    expect(() => releaseEntry({ release, checksums, releases: checkedIn.releases })).toThrow(
      /no macos x64 dmg installer\n.*no checksum for Knightbook-9\.9\.0-linux-amd64\.deb/,
    )
  })

  it('refuses a tag that is not a version', () => {
    expect(() =>
      releaseEntry({
        release: ghRelease({ tagName: 'nightly' }),
        checksums: CHECKSUMS,
        releases: checkedIn.releases,
      }),
    ).toThrow(/not v<major>/)
  })

  it('refuses when there is no earlier release to copy known issues from', () => {
    expect(() =>
      releaseEntry({ release: ghRelease(), checksums: CHECKSUMS, releases: [] as Release[] }),
    ).toThrow(/no earlier release/)
  })

  it('leaves the data as it is when the version is already listed', () => {
    const entry = releaseEntry({
      release: ghRelease(),
      checksums: CHECKSUMS,
      releases: checkedIn.releases,
    })
    const { data, added } = addRelease(checkedIn, { ...entry, version: '0.3.0' })
    expect(added).toBe(false)
    expect(data).toBe(checkedIn)
  })
})

describe('the file it writes', () => {
  it('keeps the checked-in formatting, so the pull request shows only the new entry', async () => {
    const text = await readFile(join(here, 'releases.json'), 'utf8')
    expect(formatReleaseData(JSON.parse(text))).toBe(text)
  })

  it('reads sha256sum output written in binary mode too', () => {
    expect(parseChecksums(`${'e'.repeat(64)} *Knightbook.exe\n`).get('Knightbook.exe')).toBe(
      'e'.repeat(64),
    )
  })

  it('adds the release from the command line once, then changes nothing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'knightbook-add-release-'))
    const releasesFile = join(dir, 'releases.json')
    const releaseFile = join(dir, 'release.json')
    const checksumsFile = join(dir, 'SHA256SUMS.txt')
    await writeFile(releasesFile, formatReleaseData(checkedIn))
    await writeFile(releaseFile, JSON.stringify(ghRelease()))
    await writeFile(checksumsFile, CHECKSUMS)
    const script = join(here, 'add-release.mjs')

    const first = await run('node', [script, releasesFile, releaseFile, checksumsFile])
    expect(first.stdout).toMatch(/Added 9\.9\.0/)
    const written = await readFile(releasesFile, 'utf8')
    expect(parseReleaseData(JSON.parse(written)).releases[0]?.version).toBe('9.9.0')

    const second = await addReleaseToFile({ releasesFile, releaseFile, checksumsFile })
    expect(second).toEqual({ version: '9.9.0', added: false })
    expect(await readFile(releasesFile, 'utf8')).toBe(written)
  })
})

describe('the Release workflow', () => {
  it('runs this script after publishing and pushes a branch, never main', async () => {
    const workflow = await readFile(join(here, '../../../../.github/workflows/release.yml'), 'utf8')
    const job = workflow.slice(workflow.indexOf('\n  website:'))
    expect(job).toMatch(/needs: \[version, publish\]/)
    expect(job).toContain('apps/website/src/download/add-release.mjs')
    expect(job).toMatch(/git push [^\n]*:refs\/heads\/\$BRANCH"/)
    expect(job).not.toMatch(/git push [^\n]*main/)
  })
})
