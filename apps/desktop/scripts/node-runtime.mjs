import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { chmod, mkdir, mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'

/**
 * Obtains the Node runtime a release ships, for a named target rather than for
 * whatever machine happens to be building.
 *
 * The build host's own Node is only the right answer when it is the same
 * platform, the same CPU, and the same version as the one this project ships.
 * Anything else is downloaded from nodejs.org and checked against that release's
 * published SHASUMS256.txt before it is unpacked, so a truncated or substituted
 * archive fails the build instead of being installed into the application.
 *
 * What that check is and is not: it proves the bytes match what nodejs.org
 * published over TLS. It is not a signature check — Node signs SHASUMS256.txt
 * separately with GPG, and verifying that would need a trusted key shipped with
 * this repository. That is a real gap and it is named here rather than implied
 * away.
 */

/**
 * The one runtime every target ships. Pinned deliberately: without it the app
 * carries whichever Node the person who ran the build happened to have, so two
 * builds of the same commit would not contain the same thing.
 */
export const NODE_VERSION = '24.19.0'

/** Only what electron-builder.yml actually builds. */
const SUPPORTED = new Set(['win32-x64', 'darwin-x64', 'darwin-arm64', 'linux-x64', 'linux-arm64'])

const DIST = 'https://nodejs.org/dist'

/** Node's own name for a platform, where it differs from Node's `process.platform`. */
const DIST_PLATFORM = { win32: 'win', darwin: 'darwin', linux: 'linux' }

export function resolveTarget(platform = process.platform, arch = process.arch) {
  const key = `${platform}-${arch}`
  if (!SUPPORTED.has(key)) {
    throw new Error(
      `No Node runtime is staged for ${key}. Supported targets: ${[...SUPPORTED].sort().join(', ')}.`,
    )
  }
  return { platform, arch, key }
}

/**
 * Where the runtime lives inside the published archive, which differs by
 * platform: Windows ships a zip with the binary at the top level, the others
 * ship a tarball with it under `bin/`.
 */
export function archiveFor(target, version = NODE_VERSION) {
  const folder = `node-v${version}-${DIST_PLATFORM[target.platform]}-${target.arch}`
  const windows = target.platform === 'win32'

  return {
    file: windows ? `${folder}.zip` : `${folder}.tar.gz`,
    kind: windows ? 'zip' : 'tar.gz',
    binaryName: windows ? 'node.exe' : 'node',
    /** Path to the binary inside the extracted archive, as POSIX segments. */
    binaryPath: windows ? [folder, 'node.exe'] : [folder, 'bin', 'node'],
  }
}

export function distUrl(file, version = NODE_VERSION) {
  return `${DIST}/v${version}/${file}`
}

/**
 * The checksum line for one file. A missing entry means the archive name and
 * the release do not agree, which is worth failing on rather than skipping the
 * check for.
 */
export function checksumFor(shasums, file) {
  for (const line of shasums.split('\n')) {
    const [hash, name] = line.trim().split(/\s+/)
    if (name === file) return hash
  }
  throw new Error(`${file} is not listed in SHASUMS256.txt for this release.`)
}

export async function sha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

/** True when the Node running this build is exactly the runtime being staged. */
export function hostProvides(target, version = NODE_VERSION) {
  return (
    target.platform === process.platform &&
    target.arch === process.arch &&
    process.versions.node === version
  )
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function run(command, args, cwd) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: 'ignore', shell: false })
    child.on('error', (error) => resolve({ ok: false, reason: error.message }))
    child.on('close', (code) => resolve({ ok: code === 0, reason: `${command} exited ${code}` }))
  })
}

/**
 * Unpacks with a tool the operating system already has, because adding an
 * archive dependency to a build script to extract one file is not worth it.
 * `tar` reads both formats on Windows and macOS; GNU tar on Linux does not read
 * zip, so a Windows target built there falls back to `unzip`.
 */
async function extract(archive, kind, into) {
  /*
   * Named relative to `into`, never as an absolute path: GNU tar reads a
   * leading `C:` as a remote host and fails with "cannot connect", which is how
   * this first broke on Windows where Git ships its own tar ahead of the
   * system one.
   */
  const file = basename(archive)
  const attempts =
    kind === 'zip' && process.platform === 'linux'
      ? [['unzip', ['-q', file]]]
      : [
          ['tar', ['-xf', file]],
          ['unzip', ['-q', file]],
        ]

  const reasons = []
  for (const [command, args] of attempts) {
    const result = await run(command, args, into)
    if (result.ok) return
    reasons.push(result.reason)
  }

  throw new Error(
    `Could not unpack ${file}. Tried: ${reasons.join('; ')}. ` +
      'Install tar (Windows 10 1803 and later ship it) or unzip, and build again.',
  )
}

async function download(url, to, fetchImpl) {
  const response = await fetchImpl(url)
  if (!response.ok) throw new Error(`${url} returned ${response.status} ${response.statusText}.`)
  await writeFile(to, Buffer.from(await response.arrayBuffer()))
}

/**
 * Returns a path to the Node binary for the target, downloading and verifying
 * it if it is not already cached. The cache is keyed by version and target, so
 * changing either fetches a new one rather than reusing the wrong binary.
 */
export async function ensureRuntime({
  target,
  version = NODE_VERSION,
  cacheDir,
  fetchImpl = fetch,
  log = () => {},
}) {
  const archive = archiveFor(target, version)
  const cached = join(cacheDir, `v${version}`, target.key, archive.binaryName)
  if (await exists(cached)) {
    log(`using the cached ${target.key} runtime`)
    return cached
  }

  const work = await mkdtemp(join(tmpdir(), 'knightbook-runtime-'))
  try {
    log(`fetching checksums for Node v${version}`)
    const shasums = await (await fetchImpl(distUrl('SHASUMS256.txt', version))).text()
    const expected = checksumFor(shasums, archive.file)

    log(`downloading ${archive.file}`)
    const downloaded = join(work, archive.file)
    await download(distUrl(archive.file, version), downloaded, fetchImpl)

    const actual = await sha256(downloaded)
    if (actual !== expected) {
      throw new Error(
        `${archive.file} does not match its published checksum.\n` +
          `  expected ${expected}\n  actual   ${actual}\n` +
          'The download was discarded. Nothing was staged.',
      )
    }
    log('checksum verified')

    await extract(downloaded, archive.kind, work)
    const unpacked = join(work, ...archive.binaryPath)
    if (!(await exists(unpacked))) {
      throw new Error(`${archive.file} did not contain ${archive.binaryPath.join('/')}.`)
    }

    // The tarball carries the executable bit; a zip does not record one, and a
    // binary staged without it is an application that cannot start its server.
    if (target.platform !== 'win32') await chmod(unpacked, 0o755)

    await mkdir(dirname(cached), { recursive: true })
    await rename(unpacked, cached).catch(async (error) => {
      // A cache on another volume cannot be renamed into; copying is correct
      // there and the permission has to be set again on the copy.
      if (error.code !== 'EXDEV') throw error
      const { copyFile } = await import('node:fs/promises')
      await copyFile(unpacked, cached)
      if (target.platform !== 'win32') await chmod(cached, 0o755)
    })

    return cached
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}
