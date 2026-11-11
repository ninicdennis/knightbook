import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

/**
 * Adds a published release to the website's release data (`releases.json`), so
 * nobody copies file sizes and checksums by hand (D-055). The Release workflow
 * runs it after publishing and pushes the result to a branch; the maintainer
 * opens the pull request, reads the entry, and merging it deploys the site.
 *
 * The facts come from the published GitHub release: each installer's name and
 * size, and its SHA-256 from the release's `SHA256SUMS.txt`, which is the list
 * visitors check their download against. What a script cannot know is copied
 * from the newest release that was not withdrawn: its known issues, each
 * target's minimum system and its signing. The pull request is where those are
 * corrected for the new release.
 *
 * It has no dependencies, so the workflow runs it without installing anything.
 * `release-data.ts` still validates the result when the site is built and in the
 * tests, so a mistake here fails the build rather than reaching a visitor.
 */

/** Where every installer is downloaded from; the same base as `RELEASE_DOWNLOADS`. */
const RELEASE_DOWNLOADS = 'https://github.com/ninicdennis/knightbook/releases/download'

/**
 * The four builds D-028 ships, matched by the file names electron-builder gives
 * them, as `release-assets.mjs` checks them before publishing. The deb may say
 * `amd64`, Debian's name for x64.
 */
const TARGETS = [
  { os: 'windows', arch: 'x64', format: 'nsis', pattern: /-windows-x64\.exe$/ },
  { os: 'macos', arch: 'arm64', format: 'dmg', pattern: /-macos-arm64\.dmg$/ },
  { os: 'macos', arch: 'x64', format: 'dmg', pattern: /-macos-x64\.dmg$/ },
  { os: 'linux', arch: 'x64', format: 'deb', pattern: /-linux-(?:x64|amd64)\.deb$/ },
]

/** `SHA256SUMS.txt` as a map from file name to hash: `<hash>  <name>` per line. */
export function parseChecksums(text) {
  const sums = new Map()
  for (const line of text.split('\n')) {
    const match = /^([0-9a-f]{64}) [ *](.+)$/.exec(line.trim())
    if (match) sums.set(match[2], match[1])
  }
  return sums
}

/**
 * The release data's entry for one published release.
 *
 * `release` is what `gh release view --json tagName,publishedAt,isPrerelease,assets`
 * prints; `checksums` is the text of its `SHA256SUMS.txt`; `releases` is the
 * current list, newest first. Throws naming every installer that is missing or
 * has no checksum, so a partial entry is never written.
 */
export function releaseEntry({ release, checksums, releases }) {
  const version = String(release.tagName ?? '').replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`The release's tag ${release.tagName} is not v<major>.<minor>.<patch>.`)
  }
  const template = releases.find((entry) => !entry.withdrawn) ?? releases[0]
  if (!template) {
    throw new Error('There is no earlier release to copy known issues and systems from.')
  }

  const sums = parseChecksums(checksums)
  const problems = []
  const assets = []
  for (const target of TARGETS) {
    const found = (release.assets ?? []).filter(({ name }) => target.pattern.test(name))
    const label = `${target.os} ${target.arch} ${target.format}`
    if (found.length !== 1) {
      problems.push(found.length === 0 ? `no ${label} installer` : `more than one ${label}`)
      continue
    }
    const [{ name, size }] = found
    const sha256 = sums.get(name)
    if (!sha256) problems.push(`no checksum for ${name} in SHA256SUMS.txt`)
    const earlier = template.assets.find(
      (asset) =>
        asset.os === target.os && asset.arch === target.arch && asset.format === target.format,
    )
    if (!earlier) problems.push(`${template.version} has no ${label} to copy its system from`)
    assets.push({
      os: target.os,
      arch: target.arch,
      format: target.format,
      minimumOs: earlier?.minimumOs,
      url: `${RELEASE_DOWNLOADS}/v${version}/${name}`,
      filename: name,
      size,
      sha256,
      signing: earlier?.signing,
    })
  }
  if (problems.length > 0) {
    throw new Error(`Release v${version} cannot be added:\n  ${problems.join('\n  ')}`)
  }

  return {
    version,
    channel: release.isPrerelease ? 'preview' : 'stable',
    // The day it was published, in UTC, as GitHub shows it.
    date: String(release.publishedAt).slice(0, 10),
    notesUrl: `https://github.com/ninicdennis/knightbook/releases/tag/v${version}`,
    withdrawn: false,
    knownIssues: [...template.knownIssues],
    assets,
  }
}

/**
 * The release data with `entry` first, or the same data unchanged when that
 * version is already listed, so running it twice adds nothing.
 */
export function addRelease(data, entry) {
  if (data.releases.some((existing) => existing.version === entry.version)) {
    return { data, added: false }
  }
  return { data: { ...data, releases: [entry, ...data.releases] }, added: true }
}

/** The file as it is checked in: two-space JSON and a final newline, as Prettier leaves it. */
export function formatReleaseData(data) {
  return `${JSON.stringify(data, null, 2)}\n`
}

/** Reads the three files, writes `releasesFile` if the release is new, and says which. */
export async function addReleaseToFile({ releasesFile, releaseFile, checksumsFile }) {
  const data = JSON.parse(await readFile(releasesFile, 'utf8'))
  const entry = releaseEntry({
    release: JSON.parse(await readFile(releaseFile, 'utf8')),
    checksums: await readFile(checksumsFile, 'utf8'),
    releases: data.releases,
  })
  const result = addRelease(data, entry)
  if (result.added) await writeFile(releasesFile, formatReleaseData(result.data))
  return { version: entry.version, added: result.added }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [releasesFile, releaseFile, checksumsFile] = process.argv.slice(2)
  if (!checksumsFile) {
    console.error('Usage: add-release.mjs <releases.json> <gh release view JSON> <SHA256SUMS.txt>')
    process.exit(1)
  }
  const { version, added } = await addReleaseToFile({ releasesFile, releaseFile, checksumsFile })
  console.log(
    added
      ? `Added ${version} to ${releasesFile}.`
      : `${version} is already in ${releasesFile}; nothing changed.`,
  )
}
