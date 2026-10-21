import type { Result } from './contract.js'

/** How the window picks its appearance. `auto` follows the operating system. */
export type ColorSchemeChoice = 'light' | 'dark' | 'auto'

/**
 * Preferences for this installation. Technical design section 3 calls these
 * disposable app state, so they live beside the remembered project list rather
 * than in any project's files: a clone opened on another machine keeps its own.
 */
export interface AppSettings {
  colorScheme: ColorSchemeChoice
}

/** The project a window title names, as the loaded project record gives it. */
export interface WindowTitleProject {
  name: string
  checkoutPath: string
}

export interface SettingsApi {
  /** This installation's preferences. Missing or unreadable state reads as the defaults. */
  readSettings(): Promise<AppSettings>
  /** Merges the given fields into the stored settings and returns the stored result. */
  saveSettings(patch: Partial<AppSettings>): Promise<Result<AppSettings>>
  /**
   * The version of the running app, as Electron's `app.getVersion()` reports it
   * from the packaged `package.json`. Release builds are stamped with their
   * release version; anything else reads 0.0.0.
   */
  appVersion(): Promise<string>
  /** Names the open project and its checkout folder in the window title; null claims no project. */
  showProjectInWindowTitle(project: WindowTitleProject | null): Promise<void>
}
