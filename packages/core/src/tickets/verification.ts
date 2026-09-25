import { ProjectError } from '../records/errors.js'
import { parseRecord, serializeRecord } from '../records/frontmatter.js'
import { reservedPaths } from '../records/paths.js'
import type { Project } from '../records/project.js'
import type { Revision } from '../records/revision.js'
import { readTicket, type Ticket } from './tickets.js'
import { readRecord, writeRecord } from '../records/write.js'

/**
 * Decision D-017 and technical design section 5. When a prerequisite fails
 * verification, the failure is persisted on that prerequisite with the reason.
 * Dependent tickets are flagged from it (see `failedPrerequisites`), and their
 * statuses are deliberately left exactly as they are: the design leaves rework
 * decisions to the user rather than resetting downstream work for them.
 *
 * This mirrors completion in section 6. Failing verification is the user's call
 * in the same way accepting it is, so the caller must assert that the user
 * actually said so, and the decision's source is recorded separately from
 * whoever wrote the file. As with completion, that is a cooperative rule backed
 * by provenance, not something a local design can prove.
 */

export interface RecordVerificationIssueInput {
  readonly expectedRevision: Revision
  /** Who physically wrote the update. An agent must not claim to be the user. */
  readonly recordedBy: 'user' | 'agent'
  /** The caller's explicit assertion that the user reported the failure. */
  readonly userReportedFailure: boolean
  /** Why the work was not accepted. Recorded verbatim for the people affected by it. */
  readonly reason: string
}

export async function recordVerificationIssue(
  project: Project,
  id: string,
  input: RecordVerificationIssueInput,
): Promise<Ticket> {
  const ticket = await readTicket(project, id)

  if (ticket.frontmatter.status !== 'verification') {
    throw new ProjectError(
      'invalid_transition',
      `A verification issue is only valid from Verification. Ticket ${id} is ` +
        `${ticket.frontmatter.status}. Reopening a Done ticket is a separate decision.`,
    )
  }
  if (!input.userReportedFailure) {
    throw new ProjectError(
      'invalid_transition',
      'Recording a failed verification requires the user saying the work was not ' +
        "accepted. A failing test or your own review is not the user's decision.",
    )
  }
  if (input.reason.trim().length === 0) {
    throw new ProjectError('invalid_transition', 'Describe why verification failed.')
  }

  const path = reservedPaths.ticketFile(project.root, id)
  const { content } = await readRecord(project.root, path)
  const record = parseRecord(content)

  // Only this ticket's own record changes. Dependents are flagged by derivation
  // at read time, so nothing downstream is written here or anywhere else.
  record.data.set('verification_issue', {
    reason: input.reason.trim().slice(0, 500),
    decision_source:
      input.recordedBy === 'user' ? 'direct_user_action' : 'reported_user_instruction',
    recorded_by: input.recordedBy,
    recorded_at: new Date().toISOString(),
  })
  record.data.set('updated_at', new Date().toISOString())

  await writeRecord(project.root, path, serializeRecord(record), {
    expectedRevision: input.expectedRevision,
  })

  return await readTicket(project, id)
}

export interface ResolveVerificationIssueInput {
  readonly expectedRevision: Revision
  readonly recordedBy: 'user' | 'agent'
  /** The caller's explicit assertion that the user resolved it. */
  readonly userResolvedIssue: boolean
}

/**
 * Clears the issue, which un-flags every dependent at once. Section 5 makes this
 * the user's move: affected work stays unsuggested until the prerequisite is
 * corrected or the user explicitly resolves it.
 */
export async function resolveVerificationIssue(
  project: Project,
  id: string,
  input: ResolveVerificationIssueInput,
): Promise<Ticket> {
  const ticket = await readTicket(project, id)

  if (!ticket.frontmatter.verification_issue) {
    throw new ProjectError('invalid_transition', `Ticket ${id} has no verification issue to clear.`)
  }
  if (!input.userResolvedIssue) {
    throw new ProjectError(
      'invalid_transition',
      "Clearing a verification issue is the user's decision. Say so only when they did.",
    )
  }

  const path = reservedPaths.ticketFile(project.root, id)
  const { content } = await readRecord(project.root, path)
  const record = parseRecord(content)

  record.data.delete('verification_issue')
  record.data.set('updated_at', new Date().toISOString())

  await writeRecord(project.root, path, serializeRecord(record), {
    expectedRevision: input.expectedRevision,
  })

  return await readTicket(project, id)
}
