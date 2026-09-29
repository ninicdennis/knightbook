import { describe, expect, it } from 'vitest'
import { failedPrerequisites } from './dependencies.js'
import { setBacklogOrder, type Project } from '../records/project.js'
import { selectNextTicket } from './selection.js'
import { createTicket, listTickets, readTicket, updateTicket } from './tickets.js'
import { recordVerificationIssue, resolveVerificationIssue } from './verification.js'
import { setDependenciesByHand, withFixtureProject } from '../test/fixture-project.js'
import type { TicketFrontmatter } from '../records/schema.js'

/**
 * Decision D-017. The rule under test throughout is that a failed verification
 * flags dependent work and moves nothing: no status anywhere is changed for the
 * user, because deciding what to rework is theirs.
 */

async function moveToVerification(project: Project, id: string) {
  const current = await readTicket(project, id)
  const started = await updateTicket(project, id, {
    expectedRevision: current.revision,
    status: 'in_progress',
  })
  return await updateTicket(project, id, {
    expectedRevision: started.revision,
    status: 'verification',
  })
}

async function fail(project: Project, id: string, reason: string) {
  const current = await readTicket(project, id)
  return await recordVerificationIssue(project, id, {
    expectedRevision: current.revision,
    recordedBy: 'user',
    userReportedFailure: true,
    reason,
  })
}

async function indexOf(project: Project): Promise<Map<string, TicketFrontmatter>> {
  const tickets = await listTickets(project)
  return new Map(tickets.map((t) => [t.frontmatter.id, t.frontmatter]))
}

describe('recording a failed verification', () => {
  it('keeps the reason on the prerequisite with its provenance', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'Importer' })
      await moveToVerification(project, ticket.frontmatter.id)

      const failed = await fail(project, ticket.frontmatter.id, 'Dates import an hour off.')

      expect(failed.frontmatter.verification_issue).toMatchObject({
        reason: 'Dates import an hour off.',
        decision_source: 'direct_user_action',
        recorded_by: 'user',
      })
      // The failure is a flag on the work, not a move backwards through the board.
      expect(failed.frontmatter.status).toBe('verification')
    })
  })

  it('records an agent-reported failure as reported, never as a direct user action', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'Importer' })
      const inVerification = await moveToVerification(project, ticket.frontmatter.id)

      const failed = await recordVerificationIssue(project, ticket.frontmatter.id, {
        expectedRevision: inVerification.revision,
        recordedBy: 'agent',
        userReportedFailure: true,
        reason: 'The user said the totals are wrong.',
      })

      expect(failed.frontmatter.verification_issue?.decision_source).toBe(
        'reported_user_instruction',
      )
      expect(failed.frontmatter.verification_issue?.recorded_by).toBe('agent')
    })
  })

  it('refuses without the caller asserting the user reported it', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'Importer' })
      const inVerification = await moveToVerification(project, ticket.frontmatter.id)

      await expect(
        recordVerificationIssue(project, ticket.frontmatter.id, {
          expectedRevision: inVerification.revision,
          recordedBy: 'agent',
          userReportedFailure: false,
          reason: 'A test failed.',
        }),
      ).rejects.toThrow(/user/i)

      const unchanged = await readTicket(project, ticket.frontmatter.id)
      expect(unchanged.frontmatter.verification_issue).toBeUndefined()
    })
  })

  it('is only valid from Verification', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'Importer' })

      await expect(
        recordVerificationIssue(project, ticket.frontmatter.id, {
          expectedRevision: ticket.revision,
          recordedBy: 'user',
          userReportedFailure: true,
          reason: 'Not started yet.',
        }),
      ).rejects.toThrow(/Verification/)
    })
  })

  it('cannot be set or cleared through a general update', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'Importer' })
      await moveToVerification(project, ticket.frontmatter.id)
      const failed = await fail(project, ticket.frontmatter.id, 'Totals are wrong.')

      // A body edit is the broadest thing a general update can do; the managed
      // field has to survive it, the way completion provenance does.
      const edited = await updateTicket(project, ticket.frontmatter.id, {
        expectedRevision: failed.revision,
        body: '# Importer\n\nRewritten.\n',
      })

      expect(edited.frontmatter.verification_issue?.reason).toBe('Totals are wrong.')
    })
  })
})

describe('affected dependent work', () => {
  it('flags dependents and leaves every downstream status alone', async () => {
    await withFixtureProject(async (project) => {
      const prerequisite = await createTicket(project, { title: 'Importer' })
      const dependent = await createTicket(project, {
        title: 'Report',
        dependsOn: [prerequisite.frontmatter.id],
      })
      await moveToVerification(project, prerequisite.frontmatter.id)
      // The dependent was already underway when the prerequisite failed.
      await updateTicket(project, dependent.frontmatter.id, {
        expectedRevision: dependent.revision,
        status: 'in_progress',
      })

      await fail(project, prerequisite.frontmatter.id, 'Dates import an hour off.')

      const index = await indexOf(project)
      const affected = failedPrerequisites(index.get(dependent.frontmatter.id)!, index)
      expect(affected).toEqual([
        {
          ticketId: prerequisite.frontmatter.id,
          title: 'Importer',
          issue: 'Dates import an hour off.',
          direct: true,
        },
      ])

      const after = await readTicket(project, dependent.frontmatter.id)
      expect(after.frontmatter.status).toBe('in_progress')
      expect(after.frontmatter.verification_issue).toBeUndefined()
    })
  })

  it('follows the chain past a prerequisite that is itself satisfied', async () => {
    await withFixtureProject(async (project) => {
      const root = await createTicket(project, { title: 'Importer' })
      const middle = await createTicket(project, {
        title: 'Aggregator',
        dependsOn: [root.frontmatter.id],
      })
      const leaf = await createTicket(project, {
        title: 'Report',
        dependsOn: [middle.frontmatter.id],
      })

      await moveToVerification(project, root.frontmatter.id)
      await moveToVerification(project, middle.frontmatter.id)
      await fail(project, root.frontmatter.id, 'Dates import an hour off.')

      const index = await indexOf(project)
      // Aggregator is in Verification, so the leaf's own prerequisite looks fine.
      // The work underneath it does not, and that is what matters.
      expect(failedPrerequisites(index.get(leaf.frontmatter.id)!, index)).toEqual([
        {
          ticketId: root.frontmatter.id,
          title: 'Importer',
          issue: 'Dates import an hour off.',
          direct: false,
        },
      ])
    })
  })

  it('stops suggesting affected work until the user resolves the issue', async () => {
    await withFixtureProject(async (project) => {
      const prerequisite = await createTicket(project, { title: 'Importer' })
      const dependent = await createTicket(project, {
        title: 'Report',
        dependsOn: [prerequisite.frontmatter.id],
      })
      const other = await createTicket(project, { title: 'Unrelated' })
      const ordered = await setBacklogOrder(project, [
        dependent.frontmatter.id,
        other.frontmatter.id,
      ])

      await moveToVerification(ordered, prerequisite.frontmatter.id)
      // Verification alone unlocks the dependent (D-014).
      expect((await selectNextTicket(ordered)).next?.frontmatter.id).toBe(dependent.frontmatter.id)

      await fail(ordered, prerequisite.frontmatter.id, 'Dates import an hour off.')

      // The failure takes precedence over that still-Verification status.
      const blocked = await selectNextTicket(ordered)
      expect(blocked.next?.frontmatter.id).toBe(other.frontmatter.id)
      expect(
        blocked.ineligible.find((c) => c.ticket.frontmatter.id === dependent.frontmatter.id)
          ?.reasons,
      ).toContainEqual(
        expect.objectContaining({
          kind: 'prerequisite_failed_verification',
          issue: 'Dates import an hour off.',
        }),
      )

      const current = await readTicket(ordered, prerequisite.frontmatter.id)
      await resolveVerificationIssue(ordered, prerequisite.frontmatter.id, {
        expectedRevision: current.revision,
        recordedBy: 'user',
        userResolvedIssue: true,
      })

      expect((await selectNextTicket(ordered)).next?.frontmatter.id).toBe(dependent.frontmatter.id)
    })
  })

  it('explains the failure rather than only saying the ticket is not eligible', async () => {
    await withFixtureProject(async (project) => {
      const prerequisite = await createTicket(project, { title: 'Importer' })
      await createTicket(project, { title: 'Report', dependsOn: [prerequisite.frontmatter.id] })
      await moveToVerification(project, prerequisite.frontmatter.id)
      await fail(project, prerequisite.frontmatter.id, 'Dates import an hour off.')

      const result = await selectNextTicket(project)
      expect(result.next).toBeNull()
      expect(result.explanation).toContain('failed verification: Dates import an hour off.')
    })
  })

  it('terminates on a dependency cycle instead of walking it forever', async () => {
    await withFixtureProject(async (project) => {
      const a = await createTicket(project, { title: 'A' })
      const b = await createTicket(project, { title: 'B', dependsOn: [a.frontmatter.id] })
      await setDependenciesByHand(project, a.frontmatter.id, [b.frontmatter.id])
      await moveToVerification(project, b.frontmatter.id)
      await fail(project, b.frontmatter.id, 'Wrong shape.')

      const index = await indexOf(project)
      expect(failedPrerequisites(index.get(a.frontmatter.id)!, index)).toEqual([
        { ticketId: b.frontmatter.id, title: 'B', issue: 'Wrong shape.', direct: true },
      ])
    })
  })
})

describe('resolving the issue', () => {
  it('needs the user to say so, and un-flags every dependent at once', async () => {
    await withFixtureProject(async (project) => {
      const prerequisite = await createTicket(project, { title: 'Importer' })
      const dependent = await createTicket(project, {
        title: 'Report',
        dependsOn: [prerequisite.frontmatter.id],
      })
      await moveToVerification(project, prerequisite.frontmatter.id)
      const failed = await fail(project, prerequisite.frontmatter.id, 'Dates import an hour off.')

      await expect(
        resolveVerificationIssue(project, prerequisite.frontmatter.id, {
          expectedRevision: failed.revision,
          recordedBy: 'agent',
          userResolvedIssue: false,
        }),
      ).rejects.toThrow(/user/i)

      const cleared = await resolveVerificationIssue(project, prerequisite.frontmatter.id, {
        expectedRevision: failed.revision,
        recordedBy: 'user',
        userResolvedIssue: true,
      })
      expect(cleared.frontmatter.verification_issue).toBeUndefined()

      const index = await indexOf(project)
      expect(failedPrerequisites(index.get(dependent.frontmatter.id)!, index)).toEqual([])
    })
  })

  it('refuses when there is no issue to clear', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'Importer' })

      await expect(
        resolveVerificationIssue(project, ticket.frontmatter.id, {
          expectedRevision: ticket.revision,
          recordedBy: 'user',
          userResolvedIssue: true,
        }),
      ).rejects.toThrow(/no verification issue/i)
    })
  })
})
