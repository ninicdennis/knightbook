import { access, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { binaryArchitecture } from '../../../apps/desktop/scripts/binary-architecture.mjs'
import { REPO_ROOT, type StagedResources } from './stage.js'

/**
 * Finds the output of a real `electron-builder --dir` build.
 *
 * Everything here is discovered rather than written down, because the one thing
 * these tests must never do is quietly stop checking. Spelling the macOS bundle
 * name out once already caused that: renaming the product to Knightbook left the
 * suite looking for an app that no longer existed, so it skipped on a developer's
 * machine and only CI's REQUIRE_PACKAGED_APP turned it back into a failure.
 */

export const RELEASE_DIR = join(REPO_ROOT, 'apps', 'desktop', 'release')

const NODE_BINARY = process.platform === 'win32' ? 'node.exe' : 'node'

export interface PackagedApp extends StagedResources {
  /** The binary a user would double-click, for launching the real window. */
  readonly executablePath: string
}

/** The `.app` bundles electron-builder left behind, newest naming scheme included. */
async function macBundles(): Promise<string[]> {
  const bundles: string[] = []
  for (const output of await readdir(RELEASE_DIR).catch(() => [])) {
    if (!output.startsWith('mac')) continue
    for (const entry of await readdir(join(RELEASE_DIR, output)).catch(() => [])) {
      if (entry.endsWith('.app')) bundles.push(join(output, entry))
    }
  }
  return bundles
}

/**
 * Where each platform keeps the resources folder, paired with the directory that
 * holds the launchable binary.
 */
async function candidates(): Promise<Array<{ resources: string; executableIn: string }>> {
  if (process.platform === 'win32') {
    return [{ resources: join('win-unpacked', 'resources'), executableIn: 'win-unpacked' }]
  }
  if (process.platform === 'linux') {
    return [{ resources: join('linux-unpacked', 'resources'), executableIn: 'linux-unpacked' }]
  }
  if (process.platform !== 'darwin') return []

  return (await macBundles()).map((bundle) => ({
    resources: join(bundle, 'Contents', 'Resources'),
    executableIn: join(bundle, 'Contents', 'MacOS'),
  }))
}

/*
 * Electron ships helper binaries beside the app, and electron-builder leaves a
 * licence and a version stamp there too. None of them is the thing a user
 * launches, so they are excluded by name rather than by guessing which of the
 * remaining entries is the product.
 */
const NOT_THE_APP = new Set(['chrome-sandbox', 'chrome_crashpad_handler', 'LICENSE', 'version'])

/**
 * The single launchable binary in a packaged layout, or null if it is not
 * obvious. Exported, and taking its platform, so the layouts this has to cope
 * with can be tested from any machine — the Linux branch broke CI precisely
 * because it could only ever be exercised by running CI.
 *
 * Windows names the binary `.exe`. macOS and Linux leave it extensionless,
 * which by itself is not enough: the directory also holds `resources/` and
 * `locales/`, and electron-builder leaves a licence and a version stamp beside
 * them. Filtering on the extension alone let those through, found several
 * candidates, and returned null.
 */
export async function launchableBinaryIn(
  directory: string,
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  const entries = await readdir(directory).catch(() => [])
  const launchable: string[] = []

  for (const entry of entries) {
    if (NOT_THE_APP.has(entry)) continue
    if (platform === 'win32') {
      if (entry.endsWith('.exe')) launchable.push(entry)
      continue
    }
    if (entry.includes('.')) continue
    // Directories are the reason this check exists; `resources` and `locales`
    // have no extension either.
    const info = await stat(join(directory, entry)).catch(() => null)
    if (info?.isFile()) launchable.push(entry)
  }

  return launchable.length === 1 ? join(directory, launchable[0]!) : null
}

/**
 * The packaged build's resources, or null when the app has not been packaged
 * here. This deliberately knows nothing about the launchable binary: the suites
 * that only drive the MCP server must not start skipping because the executable
 * could not be identified. Coupling the two is exactly how the Linux job broke.
 */
export async function packagedResources(): Promise<StagedResources | null> {
  for (const candidate of await candidates()) {
    const resources = await resourcesOf(candidate.resources)
    if (resources && (await runsOnThisCpu(resources))) return resources
  }
  return null
}

/**
 * The suites that start the server or the window need a package for this
 * machine's CPU. macOS packages the Intel app beside the Apple silicon one, and
 * starting that on an arm runner would need Rosetta, which is not a given; which
 * one `readdir` lists first must not decide that.
 */
async function runsOnThisCpu(resources: StagedResources): Promise<boolean> {
  return (await binaryArchitecture(resources.nodePath))?.arch === process.arch
}

/**
 * Every packaged build here, one per architecture where a platform packages
 * several (macOS builds arm64 and x64 in one run), for checks that must look at
 * each of them rather than the first found.
 */
export async function packagedApps(): Promise<PackagedApp[]> {
  const apps: PackagedApp[] = []
  for (const candidate of await candidates()) {
    const resources = await resourcesOf(candidate.resources)
    const executablePath = await launchableBinaryIn(join(RELEASE_DIR, candidate.executableIn))
    if (resources && executablePath) apps.push({ ...resources, executablePath })
  }
  return apps
}

/** The packaged build including the binary to launch, for the window tests. */
export async function packagedApp(): Promise<PackagedApp | null> {
  for (const candidate of await candidates()) {
    const resources = await resourcesOf(candidate.resources)
    if (!resources || !(await runsOnThisCpu(resources))) continue

    const executablePath = await launchableBinaryIn(join(RELEASE_DIR, candidate.executableIn))
    if (!executablePath) continue

    return { ...resources, executablePath }
  }
  return null
}

/** The resource layout under one candidate directory, if the runtime is there. */
async function resourcesOf(candidate: string): Promise<StagedResources | null> {
  const resourcesDir = join(RELEASE_DIR, candidate)
  const mcpDir = join(resourcesDir, 'mcp')
  const nodePath = join(mcpDir, NODE_BINARY)
  const serverPath = join(mcpDir, 'server.mjs')
  try {
    await access(nodePath)
    await access(serverPath)
  } catch {
    return null
  }
  return { resourcesDir, nodePath, serverPath }
}

/**
 * CI sets REQUIRE_PACKAGED_APP=1, which turns "absent" into a failure: a check
 * that quietly skips is not a check. Elsewhere, a missing build is simply a
 * machine that has not run `pnpm pack:dir`, and the suite skips.
 *
 * CI's package job runs only files named `packaged-*.test.ts` (the `test:packaged`
 * script), so a new suite that needs the real package must follow that naming or
 * it will only ever run, skipped, in `pnpm check`.
 */
export function requireWhenAsked(found: StagedResources | null, what: string): void {
  if (found || !process.env['REQUIRE_PACKAGED_APP']) return
  throw new Error(
    `REQUIRE_PACKAGED_APP is set but ${what} was not found under apps/desktop/release. ` +
      'Run pnpm pack:dir first.',
  )
}
