import { ipcMain } from 'electron'
import { DEFAULT_SETTINGS, readSettings, saveSettings } from './app-state.js'
import { guard } from '../guard.js'
import { applyColorScheme } from '../window/window-theme.js'
import type { AppSettings, ColorSchemeChoice } from '../../shared/contract.js'

/**
 * Reading and changing this installation's preferences. The renderer sends a
 * patch rather than a whole settings object, so a screen that does not know
 * about a setting cannot reset it.
 */

const COLOR_SCHEMES: ColorSchemeChoice[] = ['light', 'dark', 'auto']

/** Only the fields recognized here are accepted; anything else is ignored. */
function parsePatch(input: unknown): Partial<AppSettings> {
  if (typeof input !== 'object' || input === null) {
    throw new Error('A settings patch is required.')
  }
  const { colorScheme } = input as { colorScheme?: unknown }
  if (colorScheme === undefined) return {}
  if (!COLOR_SCHEMES.includes(colorScheme as ColorSchemeChoice)) {
    throw new Error(`A colour scheme must be one of ${COLOR_SCHEMES.join(', ')}.`)
  }
  return { colorScheme: colorScheme as ColorSchemeChoice }
}

export function registerSettingsHandlers(): void {
  ipcMain.handle('app:readSettings', async () => await readSettings())

  ipcMain.handle(
    'app:saveSettings',
    async (_event, patch: unknown) =>
      await guard<AppSettings>(async () => {
        const settings = await saveSettings(parsePatch(patch))
        applyColorScheme(settings.colorScheme)
        return settings
      }),
  )
}

/**
 * Puts the stored choice into effect before the first window is created, so the
 * window is painted in the right scheme rather than corrected afterwards.
 */
export async function applyStoredColorScheme(): Promise<void> {
  try {
    applyColorScheme((await readSettings()).colorScheme)
  } catch {
    // Unreadable state is a first run, not a failure worth stopping launch for.
    applyColorScheme(DEFAULT_SETTINGS.colorScheme)
  }
}
