// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The pieces of in-app updates (D-056) that live outside the app's code: the
 * packaging config that makes electron-builder write the updater's files, and
 * the CI step that keeps them for the release. Each one missing leaves Windows
 * installs unable to update, with nothing else failing, so they are pinned here.
 */

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPO_DIR = join(APP_DIR, '..', '..')

const fromBuilder = createRequire(createRequire(import.meta.url).resolve('electron-builder'))
const { getConfig } = fromBuilder('app-builder-lib/out/util/config/config')

describe('publishing what the Windows updater reads', () => {
  it('names the repository the app checks for releases', async () => {
    const config = await getConfig(APP_DIR, join(APP_DIR, 'electron-builder.yml'), null)
    const feed = await readFile(join(APP_DIR, 'src/main/updates/release-feed.ts'), 'utf8')

    expect(config.publish).toMatchObject({
      provider: 'github',
      owner: 'ninicdennis',
      repo: 'knightbook',
    })
    expect(feed).toContain('https://api.github.com/repos/ninicdennis/knightbook/releases')
    expect(feed).toContain('https://github.com/ninicdennis/knightbook/releases/download/')
  })

  it('keeps latest.yml and the installer block map with the installers', async () => {
    const ci = await readFile(join(REPO_DIR, '.github/workflows/ci.yml'), 'utf8')
    const kept = ci.slice(ci.indexOf('name: Keep the installers'))

    expect(kept).toContain('apps/desktop/release/latest.yml')
    expect(kept).toContain('apps/desktop/release/Knightbook-*.exe.blockmap')
  })
})
