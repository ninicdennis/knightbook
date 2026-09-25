import type { ProjectView, Result } from './contract.js'

/** One ticket to archive, at the revision the user was shown. */
export interface ArchiveTarget {
  id: string
  revision: string
}

/** One ticket a bulk archive could not take, and why, in the user's terms. */
export interface ArchiveFailureView {
  id: string
  title: string
  reason: string
}

/**
 * What a bulk archive actually did. Partial success is a real outcome here
 * rather than an error: each ticket is its own file and its own write, so some
 * can succeed while another was changed underneath the user. The ones that
 * succeeded stay archived, and the rest are named so they can be retried.
 */
export interface ArchiveOutcome {
  archivedCount: number
  failures: ArchiveFailureView[]
  project: ProjectView
}

export interface ArchiveApi {
  /**
   * Takes tickets off the board, keeping their files and everything on them.
   * Archiving records nothing about whether work was finished or accepted.
   *
   * Takes the exact tickets and revisions the user was looking at, so a ticket
   * created or changed after they opened the confirmation is not swept up. Each
   * one is a separate write: this is not a transaction across files, and the
   * outcome says exactly which ones did not happen and why.
   */
  archiveTickets(rootPath: string, targets: ArchiveTarget[]): Promise<Result<ArchiveOutcome>>
  /** Puts one archived ticket back in the status it kept. Never reopens Done. */
  restoreTicket(rootPath: string, id: string, revision: string): Promise<Result<ProjectView>>
}
