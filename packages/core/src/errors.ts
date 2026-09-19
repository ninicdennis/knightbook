/**
 * Operations fail in a small number of ways the caller is expected to handle,
 * rather than throwing opaque filesystem errors. The MCP surface and the desktop
 * host both map these to their own responses.
 */
export type ProjectErrorCode =
  | 'outside_project'
  | 'not_found'
  | 'already_exists'
  | 'revision_conflict'
  | 'invalid_record'
  | 'unsupported_schema_version'
  | 'invalid_transition'
  | 'locked'

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
