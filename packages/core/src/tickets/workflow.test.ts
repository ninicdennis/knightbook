import { readFile, writeFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { isUnattributedCompletion, recordUserCompletion } from './completion.js'
import { reservedPaths } from '../records/paths.js'
import { setBacklogOrder, type Project } from '../records/project.js'
import { selectNextTicket } from './selection.js'
import { createTicket, listTickets, readTicket, updateTicket } from './tickets.js'
import { setDependenciesByHand, withFixtureProject } from '../test/fixture-project.js'

/** Moves a ticket forward through the real transitions rather than editing status directly. */
async function moveTo(project: Project, id: string, status: 'in_progress' | 'verification') {
  const current = await readTicket(project, id)
  if (status === 'verification' && current.frontmatter.status === 'backlog') {
    const started = await updateTicket(project, id, {
      expectedRevision: current.revision,
      status: 'in_progress',
    })
    return await updateTicket(project, id, {
      expectedRevision: started.revision,
      status: 'verification',
    })
  }
  return await updateTicket(project, id, { expectedRevision: current.revision, status })
}

describe('dependency readiness (D-014)', () => {
  it('blocks dependent work until every prerequisite reaches Verification', async () => {
    await withFixtureProject(async (project) => {
      const first = await createTicket(project, { title: 'Schema' })
      const second = await createTicket(project, { title: 'Reader' })
      const dependent = await createTicket(project, {
        title: 'Board',
        dependsOn: [first.frontmatter.id, second.frontmatter.id],
      })

      const ordered = await setBacklogOrder(project, [
        dependent.frontmatter.id,
        first.frontmatter.id,
        second.frontmatter.id,
      ])

      // Dependent is first in manual order but not eligible, so selection skips it.
      expect((await selectNextTicket(ordered)).next?.frontmatter.id).toBe(first.frontmatter.id)

      await moveTo(ordered, first.frontmatter.id, 'verification')
      expect((await selectNextTicket(ordered)).next?.frontmatter.id).toBe(second.frontmatter.id)

      await moveTo(ordered, second.frontmatter.id, 'verification')
      expect((await selectNextTicket(ordered)).next?.frontmatter.id).toBe(dependent.frontmatter.id)
    })
  })

  it('explains why nothing is eligible rather than bypassing prerequisites', async () => {
    await withFixtureProject(async (project) => {
      const prerequisite = await createTicket(project, { title: 'Schema' })
      await createTicket(project, { title: 'Board', dependsOn: [prerequisite.frontmatter.id] })
      await moveTo(project, prerequisite.frontmatter.id, 'in_progress')

      const result = await selectNextTicket(project)
      expect(result.next).toBeNull()
      expect(result.explanation).toContain('waiting on "Schema"')
      expect(result.explanation).toContain('in_progress')
    })
  })

  it('reports a dependency cycle instead of treating it as a work order', async () => {
    await withFixtureProject(async (project) => {
      const a = await createTicket(project, { title: 'A' })
      const b = await createTicket(project, { title: 'B', dependsOn: [a.frontmatter.id] })
      // Written by hand: updateTicket refuses to close a cycle (D-032).
      await setDependenciesByHand(project, a.frontmatter.id, [b.frontmatter.id])

      const result = await selectNextTicket(project)
      expect(result.next).toBeNull()
      expect(result.explanation).toContain('dependency cycle')
    })
  })

  it('reports a missing prerequisite reference', async () => {
    await withFixtureProject(async (project) => {
      await createTicket(project, {
        title: 'Orphan',
        dependsOn: ['00000000-0000-4000-8000-000000000000'],
      })

      const result = await selectNextTicket(project)
      expect(result.next).toBeNull()
      expect(result.explanation).toContain('does not exist in this project')
    })
  })
})

describe('user-owned completion (D-006, D-015)', () => {
  it('refuses to reach Done through a general update', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'Work' })
      const error = await updateTicket(project, ticket.frontmatter.id, {
        expectedRevision: ticket.revision,
        status: 'done',
      }).catch((e) => e)

      expect(error.code).toBe('invalid_transition')
      expect(error.message).toContain('explicit instruction')
    })
  })

  it('refuses completion from Backlog', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'Work' })
      const error = await recordUserCompletion(project, ticket.frontmatter.id, {
        expectedRevision: ticket.revision,
        recordedBy: 'agent',
        userInstructedCompletion: true,
        instruction: 'user said done',
      }).catch((e) => e)

      expect(error.code).toBe('invalid_transition')
      expect(error.message).toContain('only valid from Verification')
    })
  })

  it('refuses completion without an explicit user instruction, even from Verification', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'Work' })
      const inVerification = await moveTo(project, ticket.frontmatter.id, 'verification')

      const error = await recordUserCompletion(project, ticket.frontmatter.id, {
        expectedRevision: inVerification.revision,
        recordedBy: 'agent',
        userInstructedCompletion: false,
        instruction: 'all tests passed',
      }).catch((e) => e)

      expect(error.code).toBe('invalid_transition')
      expect(error.message).toContain('not the user')
    })
  })

  it('records an agent-written completion as a reported instruction, not a direct action', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'Work' })
      const inVerification = await moveTo(project, ticket.frontmatter.id, 'verification')

      const done = await recordUserCompletion(project, ticket.frontmatter.id, {
        expectedRevision: inVerification.revision,
        recordedBy: 'agent',
        userInstructedCompletion: true,
        instruction: 'User confirmed it is complete after checking in their editor.',
      })

      expect(done.frontmatter.status).toBe('done')
      expect(done.frontmatter.completion?.decision_source).toBe('reported_user_instruction')
      expect(done.frontmatter.completion?.recorded_by).toBe('agent')
      expect(done.frontmatter.completion?.accepted_revision).toBe(inVerification.revision)
      expect(isUnattributedCompletion(done)).toBe(false)
    })
  })

  it('distinguishes a direct user action from an agent report', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'Work' })
      const inVerification = await moveTo(project, ticket.frontmatter.id, 'verification')

      const done = await recordUserCompletion(project, ticket.frontmatter.id, {
        expectedRevision: inVerification.revision,
        recordedBy: 'user',
        userInstructedCompletion: true,
        instruction: 'Moved to Done in the app.',
      })

      expect(done.frontmatter.completion?.decision_source).toBe('direct_user_action')
    })
  })

  it('shows a Done status written outside this path as unattributed', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'Work' })
      const path = reservedPaths.ticketFile(project.root, ticket.frontmatter.id)

      // An external editor or a Git merge sets Done directly, with no provenance.
      const raw = await readFile(path, 'utf8')
      await writeFile(path, raw.replace('status: backlog', 'status: done'), 'utf8')

      const reread = await readTicket(project, ticket.frontmatter.id)
      expect(reread.frontmatter.status).toBe('done')
      expect(isUnattributedCompletion(reread)).toBe(true)
    })
  })
})

describe('records survive a round trip', () => {
  it('keeps an unmanaged frontmatter field through an update', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'Work' })
      const path = reservedPaths.ticketFile(project.root, ticket.frontmatter.id)

      const original = await readFile(path, 'utf8')
      await writeFile(
        path,
        original.replace('status: backlog', 'status: backlog\nteam_note: keep me'),
        'utf8',
      )

      const reread = await readTicket(project, ticket.frontmatter.id)
      await updateTicket(project, ticket.frontmatter.id, {
        expectedRevision: reread.revision,
        title: 'Renamed',
      })

      const after = await readFile(path, 'utf8')
      expect(after).toContain('team_note: keep me')
      expect(after).toContain('Renamed')
    })
  })

  it('lists tickets in manual order, then by creation time', async () => {
    await withFixtureProject(async (project) => {
      const a = await createTicket(project, { title: 'A' })
      const b = await createTicket(project, { title: 'B' })
      const ordered = await setBacklogOrder(project, [b.frontmatter.id, a.frontmatter.id])

      const listed = await listTickets(ordered)
      expect(listed.map((t) => t.frontmatter.title)).toEqual(['B', 'A'])
    })
  })
})
