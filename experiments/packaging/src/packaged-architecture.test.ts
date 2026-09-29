import { relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { packagedCpus, runtimeMismatches } from './architecture.js'
import { packagedApps, RELEASE_DIR, requireWhenAsked } from './packaged.js'

/**
 * Each real package carries a Node runtime for its own CPU. On macOS one run
 * packages arm64 and x64, and before per-architecture staging both carried the
 * arm64 Node, so the Intel app could not start its MCP server (ticket 41d9ba34).
 * Windows and Linux package one architecture each; the same check holds there.
 *
 * Skipped when nothing is packaged, and a failure under REQUIRE_PACKAGED_APP, as
 * for the other packaged-* suites.
 */

const apps = await packagedApps()
requireWhenAsked(apps[0] ?? null, 'a packaged app')

/** What electron-builder.yml's mac target packages; CI's macOS job builds both. */
const MAC_CPUS = ['arm64', 'x64']

describe.skipIf(apps.length === 0)('the runtime in each packaged app', () => {
  it('is built for the same CPU as the app itself', async () => {
    const mismatches = await runtimeMismatches(
      apps.map((app) => ({
        name: relative(RELEASE_DIR, app.resourcesDir),
        executablePath: app.executablePath,
        nodePath: app.nodePath,
      })),
    )

    expect(mismatches).toEqual([])
  })

  // Only where a full Mac build is asked for: a local `pack:dir` on a Mac builds
  // one architecture, but CI must not pass having checked half the release.
  it.runIf(process.platform === 'darwin' && process.env['REQUIRE_PACKAGED_APP'])(
    'covers both Mac CPUs',
    async () => {
      expect(await packagedCpus(apps.map((app) => app.executablePath))).toEqual(MAC_CPUS)
    },
  )
})
