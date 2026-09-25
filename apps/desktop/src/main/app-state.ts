import { app } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseRememberedEntries, type RememberedEntry } from './remembered-projects.js'
import { adoptLegacyAppState, type AdoptionResult } from './state-migration.js'
import { parseWindowState, type StoredWindowState } from './window-placement.js'
import type { AppSettings, ColorSchemeChoice } from '../shared/contract.js'

/**
 * Technical design section 3: remembered checkout locations and window state are
 * disposable app state, not project content. They live in Electron's user-data
 * directory, outside any repository, so opening a clone on another machine
 * rebuilds the workspace from project files rather than from these.
 */

const FILE = 'app-state.json'
const MAX_REMEMBERED = 20

export interface AppState {
  /** Most recently opened first. */
  readonly recentProjects: RememberedEntry[]
  readonly settings: AppSettings
  /** Null until a window has been saved, or when the stored one was unusable. */
  readonly window: StoredWindowState | null
  /**
   * Skill folder path to the fingerprint Knightbook wrote there. It is the only
   * evidence that a differing copy is an old install rather than the user's edit.
   */
  readonly installedSkills: Readonly<Record<string, string>>
}

/** Following the operating system is the only choice that needs no prior decision. */
export const DEFAULT_SETTINGS: AppSettings = { colorScheme: 'auto' }

const EMPTY: AppState = {
  recentProjects: [],
  settings: DEFAULT_SETTINGS,
  window: null,
  installedSkills: {},
}

/** Entries that are not a path and a hash are dropped; losing one only means "modified". */
function parseInstalledSkills(stored: unknown): Record<string, string> {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {}
  return Object.fromEntries(
    Object.entries(stored).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}

const COLOR_SCHEMES: ColorSchemeChoice[] = ['light', 'dark', 'auto']

/**
 * Settings written by a later version, edited by hand, or corrupted fall back to
 * the default rather than being carried through as an unusable value.
 */
function parseSettings(stored: unknown): AppSettings {
  if (typeof stored !== 'object' || stored === null) return DEFAULT_SETTINGS
  const { colorScheme } = stored as { colorScheme?: unknown }
  return COLOR_SCHEMES.includes(colorScheme as ColorSchemeChoice)
    ? { colorScheme: colorScheme as ColorSchemeChoice }
    : DEFAULT_SETTINGS
}

function statePath(): string {
  return join(app.getPath('userData'), FILE)
}

/**
 * Where the state sat before the rename, best first.
 *
 * The app did not set its own name until the rename, so Electron used the
 * `name` from package.json and the directory was literally `@projectspace/desktop`,
 * scope included. That is the one with real content on an installed machine. An
 * earlier build produced `Projectspace`, so it is checked second.
 */
const LEGACY_APP_DIRECTORIES = [join('@projectspace', 'desktop'), 'Projectspace']

/**
 * Carries settings and the recent-project list across the rename. Called once
 * at startup, before anything reads either.
 */
export async function adoptStateFromPreviousName(): Promise<AdoptionResult> {
  const appData = app.getPath('appData')
  return await adoptLegacyAppState(
    statePath(),
    LEGACY_APP_DIRECTORIES.map((directory) => join(appData, directory, FILE)),
  )
}

export async function readAppState(): Promise<AppState> {
  try {
    const parsed = JSON.parse(await readFile(statePath(), 'utf8')) as {
      recentProjects?: unknown
      settings?: unknown
      window?: unknown
      installedSkills?: unknown
    }
    return {
      recentProjects: parseRememberedEntries(parsed.recentProjects).slice(0, MAX_REMEMBERED),
      settings: parseSettings(parsed.settings),
      window: parseWindowState(parsed.window),
      installedSkills: parseInstalledSkills(parsed.installedSkills),
    }
  } catch {
    // Absent or unreadable state is not an error: it is simply a first run.
    return EMPTY
  }
}

/** False when the file could not be written. Callers decide whether that matters. */
async function writeAppState(state: AppState): Promise<boolean> {
  try {
    await writeFile(statePath(), JSON.stringify(state, null, 2), 'utf8')
    return true
  } catch {
    // Losing this list is a convenience regression, never a data loss, so a
    // failure here must not interrupt opening the project.
    return false
  }
}

/*
 * Every change reads the whole file, merges, and writes it back. Window moves
 * save often, so without one queue a window save could read the file just
 * before a recent-project change lands and then write the old list back.
 */
let pendingChange: Promise<unknown> = Promise.resolve()

function changeAppState<T>(change: () => Promise<T>): Promise<T> {
  const next = pendingChange.then(change)
  pendingChange = next.catch(() => undefined)
  return next
}

/** Resolves once every change started so far has been written or has failed. */
export async function appStateChangesSettled(): Promise<void> {
  await pendingChange
}

export async function readSettings(): Promise<AppSettings> {
  return (await readAppState()).settings
}

/**
 * Merges in the given fields so adding a second setting later cannot have one
 * screen overwrite another's value. Throws when the file could not be written,
 * because a preference that silently fails to persist would look like it worked.
 */
export function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  return changeAppState(async () => {
    const current = await readAppState()
    const settings: AppSettings = { ...current.settings, ...patch }
    if (!(await writeAppState({ ...current, settings }))) {
      throw new Error('The settings file could not be written.')
    }
    return settings
  })
}

export function rememberProject(checkoutPath: string, name: string): Promise<AppState> {
  return changeAppState(async () => {
    const current = await readAppState()
    const next: AppState = {
      ...current,
      recentProjects: [
        { path: checkoutPath, name },
        ...current.recentProjects.filter((entry) => entry.path !== checkoutPath),
      ].slice(0, MAX_REMEMBERED),
    }
    await writeAppState(next)
    return next
  })
}

/** Drops the entry from this list only. Nothing on disk is touched. */
export function forgetProject(checkoutPath: string): Promise<AppState> {
  return changeAppState(async () => {
    const current = await readAppState()
    const next: AppState = {
      ...current,
      recentProjects: current.recentProjects.filter((entry) => entry.path !== checkoutPath),
    }
    await writeAppState(next)
    return next
  })
}

/** Silent on failure, like the recent-project list: a lost position is only an inconvenience. */
export function saveWindowState(window: StoredWindowState): Promise<void> {
  return changeAppState(async () => {
    await writeAppState({ ...(await readAppState()), window })
  })
}

/**
 * Remembers what was written to a skill folder. Throws on failure, unlike the
 * window: without the record a later update would be refused as "modified".
 */
export function recordInstalledSkill(dir: string, fingerprint: string): Promise<void> {
  return changeAppState(async () => {
    const current = await readAppState()
    const installedSkills = { ...current.installedSkills, [dir]: fingerprint }
    if (!(await writeAppState({ ...current, installedSkills }))) {
      throw new Error('The skill was installed, but the app could not record it.')
    }
  })
}
