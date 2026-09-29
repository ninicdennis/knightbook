import { relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runtimeMismatches } from './architecture.js'
import { packagedApps, RELEASE_DIR, requireWhenAsked } from './packaged.js'

/**
 * Each real package carries a Node runtime for its own CPU. On macOS one run
 * packages arm64 and x64, and before per-architecture staging both carried the
 * arm64 Node, so the Intel app could not start its MCP server (ticket 41d9ba34).
 * Windows and Linux package one architecture each; the same check holds there.
 * It checks every package it finds, so it covers the Intel app only in a run
 * that packaged one.
 *
 * Skipped when nothing is packaged, and a failure under REQUIRE_PACKAGED_APP, as
 * for the other packaged-* suites.
 */

const apps = await packagedApps()
requireWhenAsked(apps[0] ?? null, 'a packaged app')

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
})
