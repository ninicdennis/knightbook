import {
  archiveTicket,
  recordUserCompletion,
  recordVerificationIssue,
  resolveVerificationIssue,
  restoreTicket,
  type Project,
} from '@knightbook/core'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/server'
import { guard, ok, type ToolResult } from './result.js'
import type { ProjectScope } from './scope.js'

/**
 * The tools that record, or take back, a decision about a ticket rather than
 * edit its content: the user's completion, a failed verification and its
 * resolution, and archiving. They sit apart from tools.ts because each carries
 * a rule about who may decide (section 6, D-017) and what the decision does not
 * mean, and those rules read best together.
 */

export function registerTicketDecisionTools(server: McpServer, scope: ProjectScope): void {
  const echo = (project: Project, input: object, value: object): ToolResult =>
    ok(scope.echo(project, input, value))

  server.registerTool(
    'ticket_record_user_completion',
    {
      title: 'Record user completion',
      description:
        'Record that the user explicitly said a ticket is complete. Only valid from ' +
        'Verification. Passing tests, your own review, or reaching Verification are ' +
        'not the user decision and must not be reported as one. Set ' +
        'user_instructed_completion only when the user actually told you it is done.',
      inputSchema: z.object({
        ...scope.shape,
        id: z.uuid(),
        expected_revision: z.string(),
        user_instructed_completion: z.boolean(),
        instruction: z
          .string()
          .min(1)
          .max(500)
          .describe('A brief description of what the user said, not the conversation.'),
      }),
    },
    async (input) =>
      await guard(async () => {
        const project = await scope.open(input)
        const ticket = await recordUserCompletion(project, input.id, {
          expectedRevision: input.expected_revision,
          recordedBy: 'agent',
          userInstructedCompletion: input.user_instructed_completion,
          instruction: input.instruction,
        })
        return echo(project, input, {
          id: ticket.frontmatter.id,
          status: ticket.frontmatter.status,
          completion: ticket.frontmatter.completion,
        })
      }),
  )

  server.registerTool(
    'ticket_archive',
    {
      title: 'Archive a ticket',
      description:
        'Takes a ticket off the working board while keeping its file, id, body, links, ' +
        'dependencies, completion provenance and review snapshots exactly as they are. ' +
        'Archiving is not deletion and not a completion decision: it says nothing about ' +
        'whether the work was finished or accepted, and it cannot record either. The ' +
        'ticket keeps its status, which is what restoring puts it back to. Archiving an ' +
        'unfinished prerequisite does not satisfy anything that depends on it.',
      inputSchema: z.object({
        ...scope.shape,
        id: z.string(),
        expected_revision: z.string(),
      }),
    },
    async (input) =>
      await guard(async () => {
        const project = await scope.open(input)
        const ticket = await archiveTicket(project, input.id, input.expected_revision)
        return echo(project, input, {
          id: ticket.frontmatter.id,
          status: ticket.frontmatter.status,
          archived: ticket.frontmatter.archived?.archived_at ?? null,
          revision: ticket.revision,
        })
      }),
  )

  server.registerTool(
    'ticket_restore',
    {
      title: 'Restore an archived ticket',
      description:
        'Puts an archived ticket back on the board in the status it kept while archived. ' +
        'Restoring a Done ticket does not reopen it and does not change its completion ' +
        'provenance; restoring an unfinished one does not accept it.',
      inputSchema: z.object({
        ...scope.shape,
        id: z.string(),
        expected_revision: z.string(),
      }),
    },
    async (input) =>
      await guard(async () => {
        const project = await scope.open(input)
        const ticket = await restoreTicket(project, input.id, input.expected_revision)
        return echo(project, input, {
          id: ticket.frontmatter.id,
          status: ticket.frontmatter.status,
          archived: null,
          revision: ticket.revision,
        })
      }),
  )

  server.registerTool(
    'ticket_record_verification_issue',
    {
      title: 'Record a failed verification',
      description:
        'Record that the user said a ticket in Verification was not accepted, and why. ' +
        'Tickets depending on it are then flagged as affected work and stop being ' +
        'suggested, but no status anywhere is changed: what to rework is the user to ' +
        'decide. A failing test or your own review is not the user saying it failed.',
      inputSchema: z.object({
        ...scope.shape,
        id: z.uuid(),
        expected_revision: z.string(),
        user_reported_failure: z.boolean(),
        reason: z
          .string()
          .min(1)
          .max(500)
          .describe('Why the user did not accept the work, in enough detail to act on.'),
      }),
    },
    async (input) =>
      await guard(async () => {
        const project = await scope.open(input)
        const ticket = await recordVerificationIssue(project, input.id, {
          expectedRevision: input.expected_revision,
          recordedBy: 'agent',
          userReportedFailure: input.user_reported_failure,
          reason: input.reason,
        })
        return echo(project, input, {
          id: ticket.frontmatter.id,
          status: ticket.frontmatter.status,
          verification_issue: ticket.frontmatter.verification_issue,
        })
      }),
  )

  server.registerTool(
    'ticket_resolve_verification_issue',
    {
      title: 'Resolve a failed verification',
      description:
        'Clear a verification issue once the user says it is settled, which un-flags ' +
        'every dependent at once. Only the user can decide it is resolved; fixing the ' +
        'code and re-running checks is not the same thing.',
      inputSchema: z.object({
        ...scope.shape,
        id: z.uuid(),
        expected_revision: z.string(),
        user_resolved_issue: z.boolean(),
      }),
    },
    async (input) =>
      await guard(async () => {
        const project = await scope.open(input)
        const ticket = await resolveVerificationIssue(project, input.id, {
          expectedRevision: input.expected_revision,
          recordedBy: 'agent',
          userResolvedIssue: input.user_resolved_issue,
        })
        return echo(project, input, {
          id: ticket.frontmatter.id,
          status: ticket.frontmatter.status,
        })
      }),
  )
}
