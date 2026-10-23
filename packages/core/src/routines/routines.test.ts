import { readFile, writeFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { isProjectError } from '../records/errors.js'
import { parseRecord, serializeRecord } from '../records/frontmatter.js'
import { reservedPaths } from '../records/paths.js'
import type { Project } from '../records/project.js'
import { withFixtureProject } from '../test/fixture-project.js'
import { recordUserCompletion } from '../tickets/completion.js'
import { archiveTicket } from '../tickets/archive.js'
import { listTicketRecords, readTicket, updateTicket } from '../tickets/tickets.js'
import {
  createRoutine,
  listRoutineRecords,
  readRoutine,
  startRoutineRun,
  updateRoutine,
} from './routines.js'

const INSTRUCTIONS = '# Weekly package review\n\nRun `pnpm outdated` and note what changed.\n'

async function accept(project: Project, id: string): Promise<void> {
  const ticket = await readTicket(project, id)
  const moved = await updateTicket(project, id, {
    expectedRevision: ticket.revision,
    status: 'verification',
  })
  await recordUserCompletion(project, id, {
    expectedRevision: moved.revision,
    recordedBy: 'agent',
    userInstructedCompletion: true,
    instruction: 'The user said the review is done.',
  })
}

async function startError(run: Promise<unknown>): Promise<unknown> {
  return await run.then(
    () => null,
    (error: unknown) => error,
  )
}

describe('routine records', () => {
  it('creates, reads and edits a routine at its revision, and refuses a stale edit', async () => {
    await withFixtureProject(async (project) => {
      expect(await listRoutineRecords(project)).toEqual({ routines: [], problems: [] })
      const created = await createRoutine(project, {
        title: 'Weekly package review',
        instructions: INSTRUCTIONS,
      })
      const read = await readRoutine(project, created.frontmatter.id)
      expect(read.frontmatter.title).toBe('Weekly package review')
      expect(read.body).toBe(INSTRUCTIONS)

      const edited = await updateRoutine(project, created.frontmatter.id, {
        expectedRevision: read.revision,
        title: 'Package review',
        instructions: '# Package review\n\nAlso check the lockfile.\n',
      })
      expect(edited.frontmatter.title).toBe('Package review')
      expect(edited.body).toContain('lockfile')

      const stale = await startError(
        updateRoutine(project, created.frontmatter.id, {
          expectedRevision: read.revision,
          title: 'Overwritten',
        }),
      )
      expect(isProjectError(stale) && stale.code).toBe('revision_conflict')
      expect((await readRoutine(project, created.frontmatter.id)).frontmatter.title).toBe(
        'Package review',
      )
    })
  })

  it('stores no run or completion field in the routine file', async () => {
    await withFixtureProject(async (project) => {
      const routine = await createRoutine(project, { title: 'Security check' })
      const { ticket } = await startRoutineRun(project, routine.frontmatter.id)
      await accept(project, ticket.frontmatter.id)

      const file = await readFile(
        reservedPaths.routineFile(project.root, routine.frontmatter.id),
        'utf8',
      )
      expect(Object.keys(parseRecord(file).data.toJS() as object).sort()).toEqual([
        'created_at',
        'id',
        'schema_version',
        'title',
        'updated_at',
      ])
    })
  })
})

describe('starting a run', () => {
  it('creates a Backlog ticket linked to the routine with a copy of its title and instructions', async () => {
    await withFixtureProject(async (project) => {
      const routine = await createRoutine(project, {
        title: 'Weekly package review',
        instructions: INSTRUCTIONS,
      })
      const { ticket } = await startRoutineRun(project, routine.frontmatter.id)
      const read = await readTicket(project, ticket.frontmatter.id)

      expect(read.frontmatter.status).toBe('backlog')
      expect(read.frontmatter.routine).toEqual({ id: routine.frontmatter.id })
      expect(read.frontmatter.title).toBe('Weekly package review')
      expect(read.body).toBe(INSTRUCTIONS)
    })
  })

  it('leaves past runs alone when the routine is edited later', async () => {
    await withFixtureProject(async (project) => {
      const routine = await createRoutine(project, { title: 'Review', instructions: INSTRUCTIONS })
      const { ticket } = await startRoutineRun(project, routine.frontmatter.id)
      await updateRoutine(project, routine.frontmatter.id, {
        expectedRevision: routine.revision,
        title: 'Renamed review',
        instructions: '# Renamed review\n\nNew steps.\n',
      })

      const run = await readTicket(project, ticket.frontmatter.id)
      expect(run.frontmatter.title).toBe('Review')
      expect(run.body).toBe(INSTRUCTIONS)
      expect(run.revision).toBe(ticket.revision)
    })
  })

  it('keeps the routine link through ordinary ticket edits and acceptance', async () => {
    await withFixtureProject(async (project) => {
      const routine = await createRoutine(project, { title: 'Review' })
      const { ticket } = await startRoutineRun(project, routine.frontmatter.id)
      const moved = await updateTicket(project, ticket.frontmatter.id, {
        expectedRevision: ticket.revision,
        status: 'in_progress',
        body: '# Review\n\nNo changes found; nothing to update.\n',
      })
      expect(moved.frontmatter.routine).toEqual({ id: routine.frontmatter.id })

      await accept(project, ticket.frontmatter.id)
      expect((await readTicket(project, ticket.frontmatter.id)).frontmatter.routine).toEqual({
        id: routine.frontmatter.id,
      })
      // The routine is still there after its run is complete.
      const { routines } = await listRoutineRecords(project)
      expect(routines.map((r) => r.frontmatter.id)).toEqual([routine.frontmatter.id])
    })
  })

  it('refuses a second run while one is open, naming it, and creates nothing', async () => {
    await withFixtureProject(async (project) => {
      const routine = await createRoutine(project, { title: 'Review' })
      const { ticket } = await startRoutineRun(project, routine.frontmatter.id)

      const error = await startError(startRoutineRun(project, routine.frontmatter.id))
      expect(isProjectError(error) && error.code).toBe('run_already_open')
      expect(String((error as Error).message)).toContain(ticket.frontmatter.id)
      expect((await listTicketRecords(project)).tickets).toHaveLength(1)
    })
  })

  it('starts another run when asked to deliberately', async () => {
    await withFixtureProject(async (project) => {
      const routine = await createRoutine(project, { title: 'Review' })
      await startRoutineRun(project, routine.frontmatter.id)
      await startRoutineRun(project, routine.frontmatter.id, { anotherRun: true })

      const runs = (await listTicketRecords(project)).tickets.filter(
        (t) => t.frontmatter.routine?.id === routine.frontmatter.id,
      )
      expect(runs).toHaveLength(2)
    })
  })

  it('is not blocked by a run that is Done or archived', async () => {
    await withFixtureProject(async (project) => {
      const routine = await createRoutine(project, { title: 'Review' })
      const first = await startRoutineRun(project, routine.frontmatter.id)
      await accept(project, first.ticket.frontmatter.id)

      const second = await startRoutineRun(project, routine.frontmatter.id)
      await archiveTicket(project, second.ticket.frontmatter.id, second.ticket.revision)

      await startRoutineRun(project, routine.frontmatter.id)
      expect((await listTicketRecords(project)).tickets).toHaveLength(3)
    })
  })

  it('refuses a routine that does not exist and creates no ticket', async () => {
    await withFixtureProject(async (project) => {
      const error = await startError(
        startRoutineRun(project, '00000000-0000-4000-8000-000000000000'),
      )
      expect(isProjectError(error) && error.code).toBe('not_found')
      expect((await listTicketRecords(project)).tickets).toHaveLength(0)
    })
  })
})

describe('an unreadable routine file', () => {
  it('is listed as a problem and does not hide the others', async () => {
    await withFixtureProject(async (project) => {
      const good = await createRoutine(project, { title: 'Good' })
      const bad = await createRoutine(project, { title: 'Bad' })
      const path = reservedPaths.routineFile(project.root, bad.frontmatter.id)
      const record = parseRecord(await readFile(path, 'utf8'))
      record.data.set('title', '')
      await writeFile(path, serializeRecord(record, record.body))

      const listing = await listRoutineRecords(project)
      expect(listing.routines.map((r) => r.frontmatter.id)).toEqual([good.frontmatter.id])
      expect(listing.problems.map((p) => p.id)).toEqual([bad.frontmatter.id])
    })
  })
})
