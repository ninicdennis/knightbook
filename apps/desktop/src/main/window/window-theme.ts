import { BrowserWindow, nativeTheme } from 'electron'
import type { ColorSchemeChoice } from '../../shared/contract.js'

/**
 * The window's own paint, as opposed to the interface drawn inside it. Electron
 * fills a window with `backgroundColor` before the renderer has painted anything
 * and while it is being resized, so this has to follow the user's choice too. A
 * hard-coded dark value would flash dark around a light interface.
 *
 * These two values are the renderer's own page background (`--ps-app-bg`). They
 * are duplicated rather than shared because this side cannot read a stylesheet;
 * window-theme.test.ts fails when they drift from surfaces.css.
 */
export const WINDOW_BACKGROUND = { light: '#eef0f4', dark: '#14161a' } as const

/** Electron's own name for the same three choices. */
const THEME_SOURCE = { light: 'light', dark: 'dark', auto: 'system' } as const

export function windowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? WINDOW_BACKGROUND.dark : WINDOW_BACKGROUND.light
}

/**
 * Applies the choice to the native side: `themeSource` so Electron's own
 * chrome and scrollbars agree with the interface, and every open window's
 * background so no edge of it is left painted for the other scheme.
 */
export function applyColorScheme(choice: ColorSchemeChoice): void {
  nativeTheme.themeSource = THEME_SOURCE[choice]
  repaintWindows()
}

function repaintWindows(): void {
  const background = windowBackground()
  for (const window of BrowserWindow.getAllWindows()) window.setBackgroundColor(background)
}

/**
 * While the choice is `auto`, the operating system can change under a running
 * app. Electron resolves that for us; the window background does not follow on
 * its own, so it is repainted here.
 */
export function followSystemChanges(): void {
  nativeTheme.on('updated', repaintWindows)
}
