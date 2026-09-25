import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { recordUserCompletion } from './completion.js'
import { evaluateReadiness, describeReason } from './dependencies.js'
import { reservedPaths } from '../records/paths.js'
import { contentFingerprint } from '../review/review.js'
import { selectNextTicket } from './selection.js'
import { searchTickets } from '../search/ticket-search.js'
import {
  archiveTicket,
  createTicket,
  isArchived,
  listTickets,
  readTicket,
  restoreTicket,
  updateTicket,
} from './tickets.js'
import type { TicketFrontmatter } from '../records/schema.js'
import { withFixtureProject } from '../test/fixture-project.js'

/**
 * Archiving takes a ticket off the working board. The things worth testing are
 * the ones where that could quietly turn into something else: finishing work
 * nobody finished, accepting work nobody accepted, or losing a review.
 */

/** Moves a ticket forward through the real transitions rather than editing status directly. */
async function moveTo(
  project: Parameters<typeof createTicket>[0],
  id: string,
  status: 'in_progress' | 'verification',
) {
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

function byId(frontmatters: TicketFrontmatter[]): Map<string, TicketFrontmatter> {
  return new Map(frontmatters.map((f) => [f.id, f]))
}

describe('archiving a ticket', () => {
  it('keeps the file, the id and the body exactly as they were', async () => {
    await withFixtureProject(async (project) => {
      const created = await createTicket(project, {
        title: 'Keep me',
        body: '# Keep me\n\nText.\n',
      })
      const archived = await archiveTicket(project, created.frontmatter.id, created.revision)

      expect(isArchived(archived)).toBe(true)
      expect(archived.frontmatter.id).toBe(created.frontmatter.id)
      expect(archived.body).toBe(created.body)

      // The canonical file is still the one it always was, in place.
      const path = reservedPaths.ticketFile(project.root, created.frontmatter.id)
      expect(await readFile(path, 'utf8')).toContain('archived:')
    })
  })

  it('leaves the workflow status alone, so the retained status cannot drift', async () => {
    await withFixtureProject(async (project) => {
      const created = await createTicket(project, { title: 'Half done' })
      const started = await moveTo(project, created.frontmatter.id, 'in_progress')

      const archived = await archiveTicket(project, created.frontmatter.id, started.revision)
      expect(archived.frontmatter.status).toBe('in_progress')

      const restored = await restoreTicket(project, created.frontmatter.id, archived.revision)
      expect(restored.frontmatter.status).toBe('in_progress')
      expect(isArchived(restored)).toBe(false)
    })
  })

  it('does not reopen a Done ticket or touch its completion provenance', async () => {
    await withFixtureProject(async (project) => {
      const created = await createTicket(project, { title: 'Accepted work' })
      const verifying = await moveTo(project, created.frontmatter.id, 'verification')
      const done = await recordUserCompletion(project, created.frontmatter.id, {
        expectedRevision: verifying.revision,
        recordedBy: 'user',
        userInstructedCompletion: true,
        instruction: 'Accepted in the app.',
      })

      const archived = await archiveTicket(project, created.frontmatter.id, done.revision)
      const restored = await restoreTicket(project, created.frontmatter.id, archived.revision)

      expect(restored.frontmatter.status).toBe('done')
      expect(restored.frontmatter.completion).toEqual(done.frontmatter.completion)
      // Reopening is what moves an acceptance into history. This is not that.
      expect(restored.frontmatter.previous_completions).toBeUndefined()
    })
  })

  it('refuses to archive twice, rather than moving the archive date', async () => {
    await withFixtureProject(async (project) => {
      const created = await createTicket(project, { title: 'Once' })
      const archived = await archiveTicket(project, created.frontmatter.id, created.revision)

      await expect(
        archiveTicket(project, created.frontmatter.id, archived.revision),
      ).rejects.toThrow(/already archived/i)
    })
  })

  it('refuses to restore something that is not archived', async () => {
    await withFixtureProject(async (project) => {
      const created = await createTicket(project, { title: 'Active' })

      await expect(
        restoreTicket(project, created.frontmatter.id, created.revision),
      ).rejects.toThrow(/not archived/i)
    })
  })

  it('refuses a write against a stale revision', async () => {
    await withFixtureProject(async (project) => {
      const created = await createTicket(project, { title: 'Moving target' })
      await updateTicket(project, created.frontmatter.id, {
        expectedRevision: created.revision,
        title: 'Renamed',
      })

      await expect(
        archiveTicket(project, created.frontmatter.id, created.revision),
      ).rejects.toThrow()
    })
  })
})

describe('what archived tickets no longer do', () => {
  it('is never proposed as the next ticket', async () => {
    await withFixtureProject(async (project) => {
      const first = await createTicket(project, { title: 'Archived one' })
      await createTicket(project, { title: 'Still active' })

      await archiveTicket(project, first.frontmatter.id, first.revision)

      const selection = await selectNextTicket(project)
      expect(selection.next?.frontmatter.title).toBe('Still active')
      // Skipped, not reported as an obstacle to work the user can see.
      expect(selection.ineligible).toHaveLength(0)
    })
  })

  it('reports nothing eligible when the only backlog ticket is archived', async () => {
    await withFixtureProject(async (project) => {
      const only = await createTicket(project, { title: 'Put away' })
      await archiveTicket(project, only.frontmatter.id, only.revision)

      const selection = await selectNextTicket(project)
      expect(selection.next).toBeNull()
    })
  })

  it('is still readable by id and still listed in the canonical records', async () => {
    await withFixtureProject(async (project) => {
      const created = await createTicket(project, { title: 'Findable' })
      await archiveTicket(project, created.frontmatter.id, created.revision)

      const read = await readTicket(project, created.frontmatter.id)
      expect(read.frontmatter.title).toBe('Findable')
      expect(isArchived(read)).toBe(true)

      // listTickets stays canonical. Filtering to the active board is the
      // caller's decision, so nothing here can hide a ticket from a direct read.
      expect((await listTickets(project)).map((t) => t.frontmatter.id)).toContain(
        created.frontmatter.id,
      )
    })
  })
})

describe('archived prerequisites', () => {
  it('does not let archiving an unfinished prerequisite unblock its dependent', async () => {
    await withFixtureProject(async (project) => {
      const prerequisite = await createTicket(project, { title: 'Unfinished' })
      const dependent = await createTicket(project, {
        title: 'Waiting',
        dependsOn: [prerequisite.frontmatter.id],
      })

      await archiveTicket(project, prerequisite.frontmatter.id, prerequisite.revision)

      const all = byId((await listTickets(project)).map((t) => t.frontmatter))
      const readiness = evaluateReadiness(dependent.frontmatter, all)

      expect(readiness.ready).toBe(false)
      expect(readiness.reasons[0]?.kind).toBe('prerequisite_archived')
      // The reader cannot see it on the board, so the explanation has to say so.
      expect(describeReason(readiness.reasons[0]!)).toMatch(/archived while still backlog/i)
    })
  })

  it('keeps a finished prerequisite satisfying, because archiving did not undo it', async () => {
    await withFixtureProject(async (project) => {
      const prerequisite = await createTicket(project, { title: 'Finished' })
      const dependent = await createTicket(project, {
        title: 'Follows on',
        dependsOn: [prerequisite.frontmatter.id],
      })
      const verifying = await moveTo(project, prerequisite.frontmatter.id, 'verification')
      await archiveTicket(project, prerequisite.frontmatter.id, verifying.revision)

      const all = byId((await listTickets(project)).map((t) => t.frontmatter))

      expect(evaluateReadiness(dependent.frontmatter, all).ready).toBe(true)
    })
  })
})

describe('searching archived tickets', () => {
  /** One archived and one active ticket, both matching the same word. */
  async function bothKinds(project: Parameters<typeof createTicket>[0]) {
    const active = await createTicket(project, { title: 'Widget on the board' })
    const gone = await createTicket(project, { title: 'Widget we put away' })
    await archiveTicket(project, gone.frontmatter.id, gone.revision)
    return { active, gone }
  }

  it('leaves archived tickets out by default, because the board is what is being searched', async () => {
    await withFixtureProject(async (project) => {
      await bothKinds(project)

      const found = await searchTickets(project, 'widget')
      expect(found.hits.map((hit) => hit.title)).toEqual(['Widget on the board'])
    })
  })

  it('finds only archived tickets when that is what was asked for', async () => {
    await withFixtureProject(async (project) => {
      await bothKinds(project)

      const found = await searchTickets(project, 'widget', { scope: 'archived' })
      expect(found.hits.map((hit) => hit.title)).toEqual(['Widget we put away'])
      // Labelled, so a result off the board cannot be mistaken for one on it.
      expect(found.hits[0]?.archivedAt).toBeTruthy()
    })
  })

  it('returns both, still distinguishable, when the scope is everything', async () => {
    await withFixtureProject(async (project) => {
      await bothKinds(project)

      const found = await searchTickets(project, 'widget', { scope: 'all' })
      expect(found.hits).toHaveLength(2)
      expect(found.hits.filter((hit) => hit.archivedAt !== null)).toHaveLength(1)
    })
  })
})

describe('archiving and review evidence', () => {
  it('does not count as a change to the content that was reviewed', async () => {
    await withFixtureProject(async (project) => {
      const created = await createTicket(project, { title: 'Reviewed', body: '# Reviewed\n\nA.\n' })
      const path = reservedPaths.ticketFile(project.root, created.frontmatter.id)
      const before = contentFingerprint(await readFile(path, 'utf8'))

      await archiveTicket(project, created.frontmatter.id, created.revision)

      expect(contentFingerprint(await readFile(path, 'utf8'))).toBe(before)
    })
  })

  it('still notices a real edit made while archived', async () => {
    await withFixtureProject(async (project) => {
      const created = await createTicket(project, { title: 'Reviewed', body: '# Reviewed\n\nA.\n' })
      const path = reservedPaths.ticketFile(project.root, created.frontmatter.id)
      const archived = await archiveTicket(project, created.frontmatter.id, created.revision)
      const before = contentFingerprint(await readFile(path, 'utf8'))

      await updateTicket(project, created.frontmatter.id, {
        expectedRevision: archived.revision,
        body: '# Reviewed\n\nSomething else entirely.\n',
      })

      expect(contentFingerprint(await readFile(path, 'utf8'))).not.toBe(before)
    })
  })
})
