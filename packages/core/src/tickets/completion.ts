import { ProjectError } from '../records/errors.js'
import { parseRecord, serializeRecord } from '../records/frontmatter.js'
import { reservedPaths } from '../records/paths.js'
import type { Project } from '../records/project.js'
import type { Revision } from '../records/revision.js'
import type { TicketCompletion } from '../records/schema.js'
import { readTicket, type Ticket } from './tickets.js'
import { readRecord, writeRecord } from '../records/write.js'

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
 * tamper-proof approval system. A Done ticket with no completion block, or with
 * one no write path could have produced, is shown as unattributed rather than
 * silently accepted or rewritten; `isUnattributedCompletion` says exactly which
 * hand edits that catches and which it cannot.
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
 * The only source and writer pairs `recordUserCompletion` can produce. A direct
 * in-app action is recorded by the user by definition, and an agent can only
 * report an instruction; any other pairing was written by hand.
 */
const PRODUCIBLE: Record<TicketCompletion['decision_source'], TicketCompletion['recorded_by']> = {
  direct_user_action: 'user',
  reported_user_instruction: 'agent',
}

/**
 * Whether a Done ticket's acceptance cannot be attributed to a recorded decision.
 * Two cases are detected:
 *
 * - Done with no completion block at all: set by an external editor, a direct
 *   file write, or a Git merge.
 * - A block whose `decision_source` and `recorded_by` contradict each other, which
 *   no write path produces — for example a direct user action recorded by an
 *   agent, the obvious way to make an agent's write pass as the user's.
 *
 * What is deliberately not detected: a block edited by hand into one of the two
 * producible shapes (say, an agent's completion rewritten as the user's own).
 * Catching that would need a fingerprint over the fields, and anything that can
 * edit the file can recompute a fingerprint, so it would add a claim of tamper
 * evidence this local design cannot back. Provenance here stays cooperative, as
 * the module docblock says. Decided 2026-09-22 on ticket 02e8bb8a.
 */
export function isUnattributedCompletion(ticket: Ticket): boolean {
  if (ticket.frontmatter.status !== 'done') return false
  const completion = ticket.frontmatter.completion
  if (completion === undefined) return true
  return PRODUCIBLE[completion.decision_source] !== completion.recorded_by
}
