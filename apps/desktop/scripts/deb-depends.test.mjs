// @vitest-environment node
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The packages the Linux deb asks apt to install. electron-builder's defaults leave
 * out the ALSA library Electron links against, so on a minimal Ubuntu 24.04 the
 * installed app could not start (ticket 75d7db08). electron-builder.yml lists the
 * dependencies itself, which replaces the defaults, so these tests check the ALSA
 * library is there and that none of electron-builder's own defaults was lost.
 * A deb built from this config was installed in a fresh container to confirm it
 * (docs/experiments/packaging-findings.md).
 */

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

// app-builder-lib is electron-builder's own dependency, not ours, so it is
// resolved from where electron-builder is installed.
const fromBuilder = createRequire(createRequire(import.meta.url).resolve('electron-builder'))
const { getConfig } = fromBuilder('app-builder-lib/out/util/config/config')
const FpmTarget = fromBuilder('app-builder-lib/out/targets/FpmTarget').default

/** The deb's Depends as FpmTarget builds them: linux options, then deb over them. */
async function debDepends() {
  const config = await getConfig(APP_DIR, null, null)
  const depends = { ...config.linux, ...config.deb }.depends
  return depends ?? FpmTarget.prototype.getDefaultDepends('deb')
}

describe('the Linux deb dependencies', () => {
  it('ask for the ALSA library under its name before and after the 64-bit time change', async () => {
    expect(await debDepends()).toContain('libasound2t64 | libasound2')
  })

  it("keep every one of electron-builder's default dependencies", async () => {
    const defaults = FpmTarget.prototype.getDefaultDepends('deb')
    expect(defaults.length).toBeGreaterThan(0)
    expect(await debDepends()).toEqual(expect.arrayContaining(defaults))
  })
})
