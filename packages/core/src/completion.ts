import { ProjectError } from './errors.js'
import { parseRecord, serializeRecord } from './frontmatter.js'
import { reservedPaths } from './paths.js'
import type { Project } from './project.js'
import type { Revision } from './revision.js'
import { readTicket, type Ticket } from './tickets.js'
import { readRecord, writeRecord } from './write.js'

/**
 * Technical design section 6. Completion is kept separate from ordinary status
 * mutation so that reaching Verification, or passing tests, cannot be mistaken
 * for the user's decision.
 *
 * What this enforces: the transition is only valid from Verification, the caller
 * must assert an explicit user instruction and describe it, and the decision's
 * source is recorded separately from whoever wrote the file.
 *
 * What it cannot do: prove the conversation happened. A file-writing agent can
 * edit the Markdown directly, and a forged assertion is outside what a local
 * design can prevent. This is a cooperative rule backed by provenance, not a
 * tamper-proof approval system. Completion recorded outside this path is shown
 * as unattributed rather than silently accepted or rewritten.
 */

export interface RecordCompletionInput {
  readonly expectedRevision: Revision
  /** Who physically wrote the update. An agent must not claim to be the user. */
  readonly recordedBy: 'user' | 'agent'
  /**
   * The caller's explicit assertion that the user instructed completion. Required
   * when an agent records it; a direct in-app action sets it implicitly.
   */
  readonly userInstructedCompletion: boolean
  /** A brief description of that instruction, not a stored conversation. */
  readonly instruction: string
}

export async function recordUserCompletion(
  project: Project,
  id: string,
  input: RecordCompletionInput,
): Promise<Ticket> {
  const ticket = await readTicket(project, id)

  if (ticket.frontmatter.status === 'done') {
    throw new ProjectError('invalid_transition', `Ticket ${id} is already done.`)
  }
  if (ticket.frontmatter.status !== 'verification') {
    throw new ProjectError(
      'invalid_transition',
      `Completion is only valid from Verification. Ticket ${id} is ${ticket.frontmatter.status}.`,
    )
  }
  if (!input.userInstructedCompletion) {
    throw new ProjectError(
      'invalid_transition',
      'Completion requires an explicit user instruction. Reaching Verification, ' +
        "or reporting that checks passed, is not the user's decision to record.",
    )
  }
  if (input.instruction.trim().length === 0) {
    throw new ProjectError('invalid_transition', 'Describe the user instruction being recorded.')
  }

  const path = reservedPaths.ticketFile(project.root, id)
  const { content } = await readRecord(project.root, path)
  const record = parseRecord(content)

  record.data.set('status', 'done')
  record.data.set('updated_at', new Date().toISOString())
  record.data.set('completion', {
    decision_source:
      input.recordedBy === 'user' ? 'direct_user_action' : 'reported_user_instruction',
    recorded_by: input.recordedBy,
    recorded_at: new Date().toISOString(),
    instruction: input.instruction.trim().slice(0, 500),
    accepted_revision: input.expectedRevision,
  })

  await writeRecord(project.root, path, serializeRecord(record), {
    expectedRevision: input.expectedRevision,
  })

  return await readTicket(project, id)
}

/**
 * A ticket that is Done without completion provenance was changed outside this
 * path — by an external editor, a direct file write, or a Git merge. The app
 * shows it as unattributed rather than inventing an approval or resetting it.
 */
export function isUnattributedCompletion(ticket: Ticket): boolean {
  return ticket.frontmatter.status === 'done' && ticket.frontmatter.completion === undefined
}
