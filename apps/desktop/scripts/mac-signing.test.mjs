// @vitest-environment node
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * How the macOS app is signed until there is a Developer ID (ticket a415fdb2).
 * Built with no identity, only the main binary kept the linker's ad-hoc stamp and
 * the bundle was not sealed, so macOS on Apple Silicon called the downloaded 0.3.0
 * "damaged". An ad-hoc identity makes electron-builder sign the whole bundle. A
 * build from this config passed `codesign --verify --deep --strict` and launched
 * on an M-series Mac; that check needs macOS, so it is not repeated here.
 */

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const fromBuilder = createRequire(createRequire(import.meta.url).resolve('electron-builder'))
const { getConfig } = fromBuilder('app-builder-lib/out/util/config/config')

describe('the macOS signing configuration', () => {
  it('signs the whole app ad-hoc', async () => {
    const config = await getConfig(APP_DIR, null, null)
    expect(config.mac.identity).toBe('-')
  })

  it('leaves the hardened runtime off, which ad-hoc library validation would trip on', async () => {
    const config = await getConfig(APP_DIR, null, null)
    expect(config.mac.hardenedRuntime).toBe(false)
  })
})
