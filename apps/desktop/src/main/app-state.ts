import { app } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Technical design section 3: remembered checkout locations and window state are
 * disposable app state, not project content. They live in Electron's user-data
 * directory, outside any repository, so opening a clone on another machine
 * rebuilds the workspace from project files rather than from these.
 */

const FILE = 'app-state.json'
const MAX_RECENT = 8

export interface AppState {
  /** Absolute checkout paths, most recent first. */
  readonly recentProjects: string[]
}

const EMPTY: AppState = { recentProjects: [] }

function statePath(): string {
  return join(app.getPath('userData'), FILE)
}

export async function readAppState(): Promise<AppState> {
  try {
    const parsed = JSON.parse(await readFile(statePath(), 'utf8')) as Partial<AppState>
    const recent = Array.isArray(parsed.recentProjects) ? parsed.recentProjects : []
    return { recentProjects: recent.filter((p) => typeof p === 'string').slice(0, MAX_RECENT) }
  } catch {
    // Absent or unreadable state is not an error: it is simply a first run.
    return EMPTY
  }
}

export async function rememberProject(checkoutPath: string): Promise<AppState> {
  const current = await readAppState()
  const next: AppState = {
    recentProjects: [
      checkoutPath,
      ...current.recentProjects.filter((p) => p !== checkoutPath),
    ].slice(0, MAX_RECENT),
  }

  try {
    await writeFile(statePath(), JSON.stringify(next, null, 2), 'utf8')
  } catch {
    // Losing this list is a convenience regression, never a data loss, so a
    // failure here must not interrupt opening the project.
  }
  return next
}
