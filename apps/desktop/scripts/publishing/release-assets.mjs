import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The files a release must carry, checked before anything is published: one
 * installer per target D-028 ships, and a checksum list. A release missing one is
 * refused outright rather than published partially.
 *
 * Names come from `artifactName` in electron-builder.yml. The deb may be named
 * `amd64` rather than `x64`, which is Debian's name for the same CPU.
 */
export const REQUIRED_INSTALLERS = [
  { label: 'Windows x64 installer', pattern: /-windows-x64\.exe$/ },
  { label: 'macOS Apple silicon disk image', pattern: /-macos-arm64\.dmg$/ },
  { label: 'macOS Intel disk image', pattern: /-macos-x64\.dmg$/ },
  { label: 'Linux x64 deb package', pattern: /-linux-(?:x64|amd64)\.deb$/ },
]

export const CHECKSUMS_FILE = 'SHA256SUMS.txt'

/** Every file directly in `directory`, with its size, sorted by name. */
export async function listAssets(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
  const assets = []
  for (const name of files.sort()) {
    assets.push({ name, size: (await stat(join(directory, name))).size })
  }
  return assets
}

/**
 * The installers among `assets`, or an error naming every problem at once: a
 * missing target, a target built twice, a file for another version, or a file
 * nobody expects. A stray file is refused too, so nothing unreviewed is published.
 */
export function checkInstallers(assets, version) {
  const problems = []
  const installers = []

  for (const { label, pattern } of REQUIRED_INSTALLERS) {
    const matches = assets.filter(({ name }) => pattern.test(name))
    if (matches.length === 0) problems.push(`missing: ${label}`)
    if (matches.length > 1) problems.push(`more than one ${label}: ${names(matches)}`)
    installers.push(...matches)
  }

  for (const { name } of installers) {
    if (!name.includes(`-${version}-`)) problems.push(`not version ${version}: ${name}`)
  }

  const expected = new Set([...installers.map(({ name }) => name), CHECKSUMS_FILE])
  const unexpected = assets.filter(({ name }) => !expected.has(name))
  if (unexpected.length > 0) problems.push(`unexpected files: ${names(unexpected)}`)

  if (problems.length > 0) {
    throw new Error(`The release assets are not complete:\n  ${problems.join('\n  ')}`)
  }
  return installers
}

function names(assets) {
  return assets.map(({ name }) => name).join(', ')
}

export function sha256File(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')))
  })
}

/**
 * Writes `SHA256SUMS.txt` in the format `sha256sum --check` reads: the hash, two
 * spaces, the file name.
 */
export async function writeChecksums(directory, installers) {
  const lines = []
  for (const { name } of installers) {
    lines.push(`${await sha256File(join(directory, name))}  ${name}`)
  }
  await writeFile(join(directory, CHECKSUMS_FILE), `${lines.join('\n')}\n`)
}
