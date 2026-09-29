/**
 * Operations fail in a small number of ways the caller is expected to handle,
 * rather than throwing opaque filesystem errors. The MCP surface and the desktop
 * host both map these to their own responses.
 */
export type ProjectErrorCode =
  | 'outside_project'
  | 'not_found'
  | 'already_exists'
  /** Inside the project, but not a place this kind of record can go (a document must be .md). */
  | 'invalid_path'
  | 'revision_conflict'
  | 'invalid_record'
  | 'unsupported_schema_version'
  | 'invalid_transition'
  /** A change would add a prerequisite that is unknown, the ticket itself, or leads back to it. */
  | 'invalid_dependency'
  | 'locked'
  /** The MCP access registry exists but cannot be read or understood. */
  | 'registry_unreadable'
  /** A change to the MCP access registry could not be saved; nothing changed. */
  | 'registry_write_failed'
  /** No enabled checkout has this id: never granted, or since disabled. */
  | 'checkout_not_enabled'
  /** The enabled folder is missing, moved, or no longer holds project records. */
  | 'checkout_unavailable'
  /** The enabled folder now holds a different project than the one enabled. */
  | 'checkout_mismatch'

export class ProjectError extends Error {
  readonly code: ProjectErrorCode
  /** Present on a revision conflict so the caller can re-read without a second round trip. */
  readonly currentRevision?: string

  constructor(code: ProjectErrorCode, message: string, currentRevision?: string) {
    super(message)
    this.name = 'ProjectError'
    this.code = code
    if (currentRevision !== undefined) this.currentRevision = currentRevision
  }
}

export function isProjectError(error: unknown): error is ProjectError {
  return error instanceof ProjectError
}
