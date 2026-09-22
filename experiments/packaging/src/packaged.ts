import { access, readdir } from 'node:fs/promises'
import { join } from 'node:path'
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
 * Electron ships its own helper binaries beside the app. None of them is the
 * thing a user launches, so they are excluded by name rather than by guessing
 * which of the remaining files is the product.
 */
const NOT_THE_APP = new Set(['chrome-sandbox', 'chrome_crashpad_handler'])

/** The single launchable binary in a packaged layout, or null if it is not obvious. */
async function executableIn(directory: string): Promise<string | null> {
  const entries = await readdir(directory).catch(() => [])
  const launchable = entries.filter((entry) => {
    if (NOT_THE_APP.has(entry)) return false
    // Windows names it `.exe`; macOS and Linux leave the binary extensionless,
    // which also excludes the bundled `.so`/`.dll`/`.pak` files beside it.
    return process.platform === 'win32' ? entry.endsWith('.exe') : !entry.includes('.')
  })
  return launchable.length === 1 ? join(directory, launchable[0]!) : null
}

/** The packaged build, or null when the app has not been packaged on this machine. */
export async function packagedApp(): Promise<PackagedApp | null> {
  for (const candidate of await candidates()) {
    const resourcesDir = join(RELEASE_DIR, candidate.resources)
    const mcpDir = join(resourcesDir, 'mcp')
    const nodePath = join(mcpDir, NODE_BINARY)
    const serverPath = join(mcpDir, 'server.mjs')
    try {
      await access(nodePath)
      await access(serverPath)
    } catch {
      continue
    }

    const executablePath = await executableIn(join(RELEASE_DIR, candidate.executableIn))
    if (!executablePath) continue

    return { resourcesDir, nodePath, serverPath, executablePath }
  }
  return null
}

/**
 * CI sets REQUIRE_PACKAGED_APP=1, which turns "absent" into a failure: a check
 * that quietly skips is not a check. Elsewhere, a missing build is simply a
 * machine that has not run `pnpm pack:dir`, and the suite skips.
 */
export function requireWhenAsked(app: PackagedApp | null, what: string): void {
  if (app || !process.env['REQUIRE_PACKAGED_APP']) return
  throw new Error(
    `REQUIRE_PACKAGED_APP is set but ${what} was not found under apps/desktop/release. ` +
      'Run pnpm pack:dir first.',
  )
}
