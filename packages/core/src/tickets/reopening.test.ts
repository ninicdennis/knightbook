import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { recordUserCompletion } from './completion.js'
import { withFixtureProject } from '../test/fixture-project.js'
import { createTicket, readTicket, updateTicket, type Ticket } from './tickets.js'
import type { Project } from '../records/project.js'

/**
 * Reopening is the one transition that has to unmake a decision. Everything else
 * on the board moves work around; moving a ticket out of Done says the
 * acceptance recorded on it no longer describes where it stands.
 */

async function accept(project: Project, title: string): Promise<Ticket> {
  const created = await createTicket(project, { title })
  const id = created.frontmatter.id
  const started = await updateTicket(project, id, {
    expectedRevision: created.revision,
    status: 'in_progress',
  })
  const handed = await updateTicket(project, id, {
    expectedRevision: started.revision,
    status: 'verification',
  })
  return await recordUserCompletion(project, id, {
    expectedRevision: handed.revision,
    recordedBy: 'user',
    userInstructedCompletion: true,
    instruction: 'Moved to Done in the app.',
  })
}

describe('moving a ticket out of Done', () => {
  it('leaves no current acceptance on the record', async () => {
    await withFixtureProject(async (project) => {
      const done = await accept(project, 'Importer')

      const reopened = await updateTicket(project, done.frontmatter.id, {
        expectedRevision: done.revision,
        status: 'in_progress',
      })

      expect(reopened.frontmatter.status).toBe('in_progress')
      expect(reopened.frontmatter.completion).toBeUndefined()
    })
  })

  it('keeps the acceptance that did happen, as history', async () => {
    await withFixtureProject(async (project) => {
      const done = await accept(project, 'Importer')

      const reopened = await updateTicket(project, done.frontmatter.id, {
        expectedRevision: done.revision,
        status: 'backlog',
      })

      expect(reopened.frontmatter.previous_completions).toMatchObject([
        { instruction: 'Moved to Done in the app.', recorded_by: 'user', reopened_to: 'backlog' },
      ])
      const onDisk = await readTicket(project, done.frontmatter.id)
      expect(onDisk.frontmatter.previous_completions).toHaveLength(1)
    })
  })

  it('records where it was reopened to, and everything known when it was accepted', async () => {
    await withFixtureProject(async (project) => {
      const done = await accept(project, 'Importer')
      const accepted = done.frontmatter.completion

      const reopened = await updateTicket(project, done.frontmatter.id, {
        expectedRevision: done.revision,
        status: 'verification',
      })

      const [archived] = reopened.frontmatter.previous_completions ?? []
      // The acceptance is carried over whole: who decided, how, against what.
      expect(archived).toMatchObject({ ...accepted, reopened_to: 'verification' })
      expect(Date.parse(archived?.reopened_at ?? '')).not.toBeNaN()
    })
  })

  it('leaves the acceptance alone when the ticket stays Done', async () => {
    await withFixtureProject(async (project) => {
      const done = await accept(project, 'Importer')

      // Editing a Done ticket is not reopening it: nothing here says the work
      // stopped being accepted.
      const retitled = await updateTicket(project, done.frontmatter.id, {
        expectedRevision: done.revision,
        title: 'Importer, renamed',
        type: 'bug',
      })

      expect(retitled.frontmatter.status).toBe('done')
      expect(retitled.frontmatter.completion).toEqual(done.frontmatter.completion)
      expect(retitled.frontmatter.previous_completions).toBeUndefined()
    })
  })

  it('has nothing to archive when Done carried no provenance', async () => {
    await withFixtureProject(async (project) => {
      // A ticket made Done by a hand edit or a merge: the app shows it as
      // unattributed rather than inventing an approval, so there is no decision
      // here to keep.
      const created = await createTicket(project, { title: 'Imported by hand' })
      const id = created.frontmatter.id
      const path = join(project.root.path, '.projectspace', 'tickets', `${id}.md`)
      await writeFile(
        path,
        (await readFile(path, 'utf8')).replace('status: backlog', 'status: done'),
      )

      const current = await readTicket(project, id)
      const reopened = await updateTicket(project, id, {
        expectedRevision: current.revision,
        status: 'in_progress',
      })

      expect(reopened.frontmatter.completion).toBeUndefined()
      expect(reopened.frontmatter.previous_completions).toBeUndefined()
    })
  })

  it('keeps every acceptance when the same ticket is reopened twice', async () => {
    await withFixtureProject(async (project) => {
      const first = await accept(project, 'Importer')
      const id = first.frontmatter.id

      const reopened = await updateTicket(project, id, {
        expectedRevision: first.revision,
        status: 'verification',
      })
      const acceptedAgain = await recordUserCompletion(project, id, {
        expectedRevision: reopened.revision,
        recordedBy: 'agent',
        userInstructedCompletion: true,
        instruction: 'You said the import is right now.',
      })
      const reopenedAgain = await updateTicket(project, id, {
        expectedRevision: acceptedAgain.revision,
        status: 'in_progress',
      })

      expect(reopenedAgain.frontmatter.completion).toBeUndefined()
      // Oldest first, so the record reads as the sequence of decisions it was.
      expect(reopenedAgain.frontmatter.previous_completions).toMatchObject([
        { recorded_by: 'user', reopened_to: 'verification' },
        { recorded_by: 'agent', reopened_to: 'in_progress' },
      ])
    })
  })

  it('does not disturb the rest of the ticket', async () => {
    await withFixtureProject(async (project) => {
      const done = await accept(project, 'Importer')

      const reopened = await updateTicket(project, done.frontmatter.id, {
        expectedRevision: done.revision,
        status: 'in_progress',
      })

      expect(reopened.body).toBe(done.body)
      expect(reopened.frontmatter.id).toBe(done.frontmatter.id)
      expect(reopened.frontmatter.title).toBe(done.frontmatter.title)
      expect(reopened.frontmatter.created_at).toBe(done.frontmatter.created_at)
    })
  })
})
