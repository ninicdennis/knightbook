// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  TITLE_BAR_HEIGHT,
  TITLE_BAR_SYMBOLS,
  titleBarOptions,
  titleBarOverlayFor,
} from './title-bar.js'
import { WINDOW_BACKGROUND } from './window-theme.js'

vi.mock('electron', () => ({ BrowserWindow: {}, nativeTheme: {} }))

/**
 * The window controls are painted by the host, before and apart from the page,
 * so their colours are copies of the page's. These tests fail when a copy drifts.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const surfaces = read('../../renderer/theme/surfaces.css')
const theme = read('../../renderer/theme/theme.ts')
const shell = read('../../renderer/app/shell.css')

describe('the title bar', () => {
  it('draws the window controls in the page colours for each scheme', () => {
    expect(titleBarOverlayFor('dark', true)).toEqual({
      color: WINDOW_BACKGROUND.dark,
      symbolColor: TITLE_BAR_SYMBOLS.dark.active,
      height: TITLE_BAR_HEIGHT,
    })
    expect(titleBarOverlayFor('light', false).symbolColor).toBe(TITLE_BAR_SYMBOLS.light.inactive)
  })

  it('uses the page text colours, and the muted one for an inactive window', () => {
    const muted = [...surfaces.matchAll(/--ps-text-muted:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1])
    expect(muted).toEqual([TITLE_BAR_SYMBOLS.light.inactive, TITLE_BAR_SYMBOLS.dark.inactive])
    const darkScale = /const dark: MantineColorsTuple = \[\s*'(#[0-9a-f]{6})'/i.exec(theme)?.[1]
    expect(darkScale).toBe(TITLE_BAR_SYMBOLS.dark.active)
  })

  it('is as tall as the header row it sits in', () => {
    expect(shell).toContain(`--ps-titlebar-height: ${TITLE_BAR_HEIGHT}px`)
  })

  it('keeps native controls on every platform', () => {
    for (const platform of ['win32', 'linux'] as const) {
      const options = titleBarOptions(platform, 'dark')
      expect(options.titleBarStyle).toBe('hidden')
      expect(options.titleBarOverlay).toEqual(titleBarOverlayFor('dark', true))
    }
    const mac = titleBarOptions('darwin', 'light')
    expect(mac.titleBarStyle).toBe('hidden')
    expect(mac.titleBarOverlay).toBe(true)
    expect(mac.trafficLightPosition?.y).toBeGreaterThan(0)
  })
})
