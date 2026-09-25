import type { Result } from './contract.js'

/**
 * Setting up an AI tool: the connection is one step, the workflow skill another.
 * A skill on disk is only a file in the right place. Whether a client loaded it,
 * or follows it, is not something this app can observe, so nothing here claims it.
 */

/**
 * - `absent`: nothing there yet.
 * - `matching`: identical to what this app ships.
 * - `outdated`: still exactly what Knightbook installed earlier; safe to update.
 * - `modified`: differs, and not provably ours, so it is never overwritten.
 */
export type InstalledSkillState = 'absent' | 'matching' | 'outdated' | 'modified'

export type SkillTargetId =
  'claude-personal' | 'claude-project' | 'codex-personal' | 'codex-project'

export interface SkillTargetView {
  id: SkillTargetId
  client: 'Claude Code' | 'Codex'
  /** Personal applies to every project on this machine; project writes into the checkout. */
  scope: 'personal' | 'project'
  /** Where the folder goes, shown so the user knows exactly what will be written. */
  path: string
  state: InstalledSkillState
}

/** A missing bundled skill is a broken install and comes back as an error instead. */
export interface SkillSetupView {
  /** The files that make up the skill, relative to its folder. */
  files: string[]
  /** SKILL.md as shipped, for preview and for pasting into clients without skills. */
  skillText: string
  targets: SkillTargetView[]
}

export interface SkillSetupApi {
  /** What ships, and what is already in each place a supported client reads. */
  skillSetup(rootPath: string): Promise<Result<SkillSetupView>>
  /**
   * Installs into an absent folder, or updates one the host last saw as `outdated`.
   * A folder that changed meanwhile is refused, never overwritten.
   */
  installSkill(
    rootPath: string,
    target: SkillTargetId,
    expected: 'absent' | 'outdated',
  ): Promise<Result<SkillSetupView>>
  /** Asks for a folder and writes a new `projectspace` folder inside it. Null when cancelled. */
  exportSkill(): Promise<Result<{ exportedTo: string } | null>>
}
