// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The names an installed app is found by: the Linux command and launcher, and the
 * per-user Windows install folder. Users save these paths in their MCP client
 * configuration, so they are part of what a release promises (ticket 3250b7d5).
 *
 * electron-builder derives them from the package name, not the product name, and
 * the workspace package `@knightbook/desktop` made them `@knightbookdesktop`.
 * These tests load electron-builder.yml through electron-builder's own config
 * loader and ask its own AppInfo and install-folder rule, so a change to the
 * config or the package name that brings the old names back fails here. A
 * packaged build checked the same names (docs/experiments/packaging-findings.md).
 */

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

// app-builder-lib is electron-builder's own dependency, not ours, so it is
// resolved from where electron-builder is installed.
const fromBuilder = createRequire(createRequire(import.meta.url).resolve('electron-builder'))
const { getConfig } = fromBuilder('app-builder-lib/out/util/config/config')
const { AppInfo } = fromBuilder('app-builder-lib/out/appInfo')
const { getWindowsInstallationDirName } = fromBuilder('app-builder-lib/out/targets/targetUtil')

/** The names electron-builder 26 would install under, for a loaded config. */
function installedNames(config, packageJson) {
  const metadata = { ...packageJson, ...config.extraMetadata }
  const info = { config, metadata }
  const windows = new AppInfo(info, null, config.win ?? null)
  const linux = new AppInfo(info, null, config.linux ?? null)
  const nsis = config.nsis ?? {}
  const oneClick = nsis.oneClick ?? true
  const perMachine = nsis.perMachine ?? false

  return {
    windowsFolder: getWindowsInstallationDirName(windows, !oneClick || perMachine),
    windowsExecutable: `${windows.productFilename}.exe`,
    // linuxPackager.js: executableName if set, else the sanitized package name in
    // lower case. The launcher's file name follows it.
    linuxCommand:
      config.linux?.executableName ?? config.executableName ?? linux.sanitizedName.toLowerCase(),
  }
}

async function load() {
  const config = await getConfig(APP_DIR, null, null)
  const packageJson = JSON.parse(await readFile(join(APP_DIR, 'package.json'), 'utf8'))
  return { config, packageJson }
}

describe('the names the packaged app installs under', () => {
  it('are Knightbook on Windows and knightbook on Linux', async () => {
    const { config, packageJson } = await load()

    expect(installedNames(config, packageJson)).toEqual({
      windowsFolder: 'Knightbook',
      windowsExecutable: 'Knightbook.exe',
      linuxCommand: 'knightbook',
    })
  })

  // The same rules on the workspace package name alone, so this suite is known
  // to catch the regression it is for rather than agreeing with any config.
  it('would be @knightbookdesktop without the packaged name', async () => {
    const { config, packageJson } = await load()
    const { extraMetadata: _, ...withoutName } = config
    const { linux } = config
    const { executableName: __, ...linuxWithoutName } = linux

    expect(installedNames({ ...withoutName, linux: linuxWithoutName }, packageJson)).toMatchObject({
      windowsFolder: '@knightbookdesktop',
      linuxCommand: '@knightbookdesktop',
    })
  })
})
