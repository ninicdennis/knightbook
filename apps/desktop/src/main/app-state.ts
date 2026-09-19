import { app } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseRememberedEntries, type RememberedEntry } from './remembered-projects.js'

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
}

const EMPTY: AppState = { recentProjects: [] }

function statePath(): string {
  return join(app.getPath('userData'), FILE)
}

export async function readAppState(): Promise<AppState> {
  try {
    const parsed = JSON.parse(await readFile(statePath(), 'utf8')) as { recentProjects?: unknown }
    return {
      recentProjects: parseRememberedEntries(parsed.recentProjects).slice(0, MAX_REMEMBERED),
    }
  } catch {
    // Absent or unreadable state is not an error: it is simply a first run.
    return EMPTY
  }
}

async function writeAppState(state: AppState): Promise<void> {
  try {
    await writeFile(statePath(), JSON.stringify(state, null, 2), 'utf8')
  } catch {
    // Losing this list is a convenience regression, never a data loss, so a
    // failure here must not interrupt opening the project.
  }
}

export async function rememberProject(checkoutPath: string, name: string): Promise<AppState> {
  const current = await readAppState()
  const next: AppState = {
    recentProjects: [
      { path: checkoutPath, name },
      ...current.recentProjects.filter((entry) => entry.path !== checkoutPath),
    ].slice(0, MAX_REMEMBERED),
  }
  await writeAppState(next)
  return next
}

/** Drops the entry from this list only. Nothing on disk is touched. */
export async function forgetProject(checkoutPath: string): Promise<AppState> {
  const current = await readAppState()
  const next: AppState = {
    recentProjects: current.recentProjects.filter((entry) => entry.path !== checkoutPath),
  }
  await writeAppState(next)
  return next
}
