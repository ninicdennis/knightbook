import { BrowserWindow, nativeTheme, type BrowserWindowConstructorOptions } from 'electron'
import { WINDOW_BACKGROUND } from './window-theme.js'

/**
 * The window draws its own title bar: the first row of the app's header is the
 * title bar (D-030), so there is no separate strip above it naming the window.
 *
 * The window controls stay the platform's own. On Windows and Linux,
 * `titleBarOverlay` keeps native minimize, maximize and close over the top-right
 * corner of the page, painted in the app's colours; the renderer keeps clear of
 * them with the `env(titlebar-area-*)` CSS variables. On macOS the traffic
 * lights stay where they always are, moved down to sit in the middle of the row,
 * and `titleBarOverlay: true` gives the renderer the same variables so it can
 * keep clear of them too.
 *
 * Snapping, double-click to maximize and dragging come from the operating
 * system, because the renderer marks its empty title-bar space as a drag region
 * rather than moving the window itself.
 */

/** The first header row: `--ps-titlebar-height` in shell.css. */
export const TITLE_BAR_HEIGHT = 48

/**
 * The page's own text colours: Mantine's text colour (black in light mode, the
 * first step of the `dark` scale in theme.ts) and `--ps-text-muted`. Inactive
 * windows use the muted one, as native title bars dim theirs; it still reads at
 * 4.5:1 on the window background. title-bar.test.ts checks these against the
 * stylesheets.
 */
export const TITLE_BAR_SYMBOLS = {
  light: { active: '#000000', inactive: '#5f6673' },
  dark: { active: '#c9cdd6', inactive: '#8c939f' },
} as const

type Scheme = keyof typeof WINDOW_BACKGROUND

/** Colours for the overlay behind the Windows and Linux window controls. */
export function titleBarOverlayFor(scheme: Scheme, focused: boolean) {
  return {
    color: WINDOW_BACKGROUND[scheme],
    symbolColor: TITLE_BAR_SYMBOLS[scheme][focused ? 'active' : 'inactive'],
    height: TITLE_BAR_HEIGHT,
  }
}

/** Constructor options that hide the default title bar and keep native controls. */
export function titleBarOptions(
  platform: NodeJS.Platform,
  scheme: Scheme,
): BrowserWindowConstructorOptions {
  if (platform === 'darwin') {
    // 12px traffic lights, vertically centred in the row; 16px in from the edge
    // matches the header's own padding.
    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: true,
      trafficLightPosition: { x: 16, y: (TITLE_BAR_HEIGHT - 14) / 2 },
    }
  }
  return { titleBarStyle: 'hidden', titleBarOverlay: titleBarOverlayFor(scheme, true) }
}

export function currentScheme(): Scheme {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

/**
 * Keeps one window's controls in step with focus: dimmed while another window
 * is in front, as a native title bar would be. macOS draws its own traffic
 * lights and has nothing to repaint.
 */
export function followWindowFocus(window: BrowserWindow): void {
  if (process.platform === 'darwin') return
  const repaint = () => repaintTitleBar(window)
  window.on('focus', repaint)
  window.on('blur', repaint)
}

/**
 * Repaints every window's controls when the colour scheme changes: the user's
 * choice in Settings (which sets `nativeTheme.themeSource`) or, while that is
 * "Follow system", the operating system's.
 */
export function followThemeForTitleBars(): void {
  if (process.platform === 'darwin') return
  nativeTheme.on('updated', () => {
    for (const window of BrowserWindow.getAllWindows()) repaintTitleBar(window)
  })
}

function repaintTitleBar(window: BrowserWindow): void {
  if (window.isDestroyed()) return
  window.setTitleBarOverlay(titleBarOverlayFor(currentScheme(), window.isFocused()))
}
