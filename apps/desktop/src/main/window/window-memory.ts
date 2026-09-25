import { app, screen, type BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import { appStateChangesSettled, readAppState, saveWindowState } from '../project/app-state.js'
import { MINIMUM_SIZE, resolveWindowPlacement, type WindowPlacement } from './window-placement.js'

/**
 * Technical design section 3: window geometry is disposable app state, kept in
 * `app-state.json` under the user-data directory and never in a project folder.
 * The decisions live in `window-placement.ts`; this file only talks to Electron.
 */

/** Long enough that dragging a window writes once at the end, not per frame. */
const SAVE_DELAY_MS = 500

/** Needs the app to be ready, because the display list is not known before. */
export async function rememberedPlacement(): Promise<WindowPlacement> {
  const workAreas = screen.getAllDisplays().map((display) => display.workArea)
  return resolveWindowPlacement((await readAppState()).window, workAreas)
}

export function placementOptions(
  placement: WindowPlacement,
): Pick<
  BrowserWindowConstructorOptions,
  'x' | 'y' | 'width' | 'height' | 'minWidth' | 'minHeight'
> {
  return {
    ...placement.position,
    width: placement.width,
    height: placement.height,
    minWidth: MINIMUM_SIZE.width,
    minHeight: MINIMUM_SIZE.height,
  }
}

/** Saves the window's geometry shortly after it settles, and again as it closes. */
export function rememberWindowPlacement(window: BrowserWindow): void {
  let timer: ReturnType<typeof setTimeout> | undefined

  const saveNow = (): void => {
    clearTimeout(timer)
    timer = undefined
    // A minimized window reports itself as not maximized, which is not what the
    // user left it as; the last save before minimizing already holds the truth.
    if (window.isDestroyed() || window.isMinimized()) return
    void saveWindowState({ bounds: window.getNormalBounds(), maximized: window.isMaximized() })
  }
  const saveSoon = (): void => {
    clearTimeout(timer)
    timer = setTimeout(saveNow, SAVE_DELAY_MS)
  }

  window.on('resize', saveSoon)
  window.on('move', saveSoon)
  window.on('maximize', saveSoon)
  window.on('unmaximize', saveSoon)
  window.on('close', saveNow)
}

/**
 * The close-time save is still being written when the last window closes and
 * the app starts quitting, so quitting waits for it. A failed write resolves the
 * wait too: nothing here may keep the app from closing.
 */
export function finishSavingBeforeQuit(): void {
  let settled = false
  app.on('will-quit', (event) => {
    if (settled) return
    event.preventDefault()
    void appStateChangesSettled().then(() => {
      settled = true
      app.quit()
    })
  })
}
