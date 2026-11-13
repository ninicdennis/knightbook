import type { UpdateMode, UpdateRelease } from '../../shared/updates-contract.js'

/**
 * Chooses the release to offer from GitHub's list of releases (D-056).
 *
 * Every Knightbook release so far is a prerelease (D-040), so the newest
 * release, prerelease or not, is the one to offer. A draft is never public. A
 * release whose title starts with "Withdrawn" has been pulled by the maintainer
 * and is skipped, so an older good release can still be offered. Tags that are
 * not a version are ignored rather than guessed at.
 */

export const RELEASES_URL =
  'https://api.github.com/repos/ninicdennis/knightbook/releases?per_page=30'

/** The update metadata electron-builder writes for the Windows installer. */
export const WINDOWS_METADATA = 'latest.yml'

const WITHDRAWN = /^\s*withdrawn\b/i

interface Version {
  core: [number, number, number]
  pre: string[]
}

/** `1.2.3` or `v1.2.3-beta.1`; null for anything else. */
export function parseVersion(text: string): Version | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
    text.trim(),
  )
  if (!match) return null
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] ? match[4].split('.') : [],
  }
}

/** Semantic-version order: negative when a is older than b. */
export function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < 3; i++) {
    const difference = a.core[i]! - b.core[i]!
    if (difference !== 0) return difference
  }
  // A version without a prerelease part is newer than one with it.
  if (a.pre.length === 0 || b.pre.length === 0) return b.pre.length - a.pre.length
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i]
    const y = b.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xNumeric = /^\d+$/.test(x)
    const yNumeric = /^\d+$/.test(y)
    if (xNumeric && yNumeric && Number(x) !== Number(y)) return Number(x) - Number(y)
    if (xNumeric !== yNumeric) return xNumeric ? -1 : 1
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

export interface OfferedRelease extends UpdateRelease {
  tag: string
}

interface RawRelease {
  tag_name?: unknown
  name?: unknown
  draft?: unknown
  html_url?: unknown
  assets?: unknown
}

/**
 * The newest usable release newer than `currentVersion`, or null when there is
 * none. Throws when `releases` is not the list GitHub returns, so a broken
 * response is a failed check, never "up to date".
 */
export function pickUpdate(releases: unknown, currentVersion: string): OfferedRelease | null {
  if (!Array.isArray(releases)) throw new Error('GitHub did not return a list of releases.')
  const current = parseVersion(currentVersion)
  if (!current) throw new Error(`This build's version, ${currentVersion}, is not a version number.`)

  let best: { version: Version; offer: OfferedRelease } | null = null
  for (const raw of releases as RawRelease[]) {
    if (typeof raw !== 'object' || raw === null) continue
    if (raw.draft === true) continue
    if (typeof raw.name === 'string' && WITHDRAWN.test(raw.name)) continue
    if (typeof raw.tag_name !== 'string' || typeof raw.html_url !== 'string') continue
    const version = parseVersion(raw.tag_name)
    if (!version || compareVersions(version, current) <= 0) continue
    if (best && compareVersions(version, best.version) <= 0) continue
    best = {
      version,
      offer: {
        tag: raw.tag_name,
        version: raw.tag_name.replace(/^v/, ''),
        notesUrl: raw.html_url,
        installable: hasAsset(raw.assets, WINDOWS_METADATA),
      },
    }
  }
  return best?.offer ?? null
}

function hasAsset(assets: unknown, name: string): boolean {
  return (
    Array.isArray(assets) &&
    assets.some((asset) => typeof asset === 'object' && asset !== null && asset.name === name)
  )
}

/** Where electron-updater reads one release's `latest.yml` and installer. */
export function releaseDownloadBase(tag: string): string {
  return `https://github.com/ninicdennis/knightbook/releases/download/${encodeURIComponent(tag)}/`
}

/**
 * What this build can do with an update. Only an installed release checks: a
 * development run or an unstamped package (0.0.0) has no release to compare
 * with. Windows replaces itself in place; macOS and Linux are told a version is
 * out and sent to the download page (D-056).
 */
export function updateMode(platform: string, isPackaged: boolean, version: string): UpdateMode {
  if (!isPackaged || version === '0.0.0' || !parseVersion(version)) return 'off'
  return platform === 'win32' ? 'install' : 'notify'
}
