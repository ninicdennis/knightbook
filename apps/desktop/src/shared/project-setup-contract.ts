import type { Result } from './contract.js'

/**
 * Choosing, remembering and setting up project folders: everything the window
 * does before a project is open.
 */

export interface ChosenFolder {
  path: string
  initialized: boolean
}

export interface RememberedProject {
  path: string
  name: string
  /** Why it cannot be opened right now, or null when it can. */
  unavailable: string | null
}

export interface FolderInspection {
  /** The folder's own name, offered as the default project name. */
  name: string
  /** Existing documents worth offering to include, as project-relative paths. */
  suggestions: string[]
}

export interface SetupOutcome {
  path: string
  /** Set when the project exists but something asked for could not be done. */
  warning: string | null
}

export interface ProjectSetupApi {
  /** Projects this machine has opened, most recent first, each checked for availability. */
  rememberedProjects(): Promise<RememberedProject[]>
  /** Forgets one entry and returns the updated list. Deletes nothing on disk. */
  forgetProject(path: string): Promise<RememberedProject[]>
  chooseProject(): Promise<ChosenFolder | null>
  /** What is in a folder the user just chose that has no project yet. */
  inspectFolder(path: string): Promise<Result<FolderInspection>>
  /** Creates project records in that folder, and includes the named documents in place. */
  setUpFolder(path: string, name: string, include: string[]): Promise<Result<SetupOutcome>>
}
