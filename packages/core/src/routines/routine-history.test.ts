import { readFile, writeFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseRecord, serializeRecord } from '../records/frontmatter.js'
import { reservedPaths } from '../records/paths.js'
import type { Project } from '../records/project.js'
import { withFixtureProject } from '../test/fixture-project.js'
import { recordUserCompletion } from '../tickets/completion.js'
import { createTicket, listTicketRecords, readTicket, updateTicket } from '../tickets/tickets.js'
import { routineHistory } from './routine-history.js'
import { createRoutine, startRoutineRun } from './routines.js'

async function toVerification(project: Project, id: string): Promise<void> {
  const ticket = await readTicket(project, id)
  await updateTicket(project, id, { expectedRevision: ticket.revision, status: 'verification' })
}

/** Accepts a run, then sets the recorded acceptance time so two runs have different dates. */
async function acceptOn(project: Project, id: string, at: string): Promise<void> {
  await toVerification(project, id)
  await recordUserCompletion(project, id, {
    expectedRevision: (await readTicket(project, id)).revision,
    recordedBy: 'agent',
    userInstructedCompletion: true,
    instruction: 'The user accepted this run.',
  })
  await editByHand(project, id, (data) => data.setIn(['completion', 'recorded_at'], at))
}

async function editByHand(
  project: Project,
  id: string,
  edit: (data: ReturnType<typeof parseRecord>['data']) => void,
): Promise<void> {
  const path = reservedPaths.ticketFile(project.root, id)
  const record = parseRecord(await readFile(path, 'utf8'))
  edit(record.data)
  await writeFile(path, serializeRecord(record, record.body))
}

describe('a routine history', () => {
  it('counts only accepted Done runs as completions, dated by their acceptance', async () => {
    await withFixtureProject(async (project) => {
      const routine = await createRoutine(project, { title: 'Review' })
      const id = routine.frontmatter.id
      const start = async () =>
        (await startRoutineRun(project, id, { anotherRun: true })).ticket.frontmatter.id

      const early = await start()
      await acceptOn(project, early, '2026-10-01T09:00:00.000Z')
      const later = await start()
      await acceptOn(project, later, '2026-10-08T09:00:00.000Z')
      const waiting = await start()
      await toVerification(project, waiting)
      const unattributed = await start()
      await acceptOn(project, unattributed, '2026-10-15T09:00:00.000Z')
      await editByHand(project, unattributed, (data) => data.delete('completion'))
      // An ordinary ticket with no routine is never one of its runs.
      await createTicket(project, { title: 'Unrelated' })

      const history = routineHistory(id, await listTicketRecords(project))

      expect(history.runs.map((run) => run.id).sort()).toEqual(
        [early, later, waiting, unattributed].sort(),
      )
      expect(history.completions.map((run) => [run.id, run.acceptedAt])).toEqual([
        [later, '2026-10-08T09:00:00.000Z'],
        [early, '2026-10-01T09:00:00.000Z'],
      ])
      expect(history.lastCompletedAt).toBe('2026-10-08T09:00:00.000Z')
      const byId = new Map(history.runs.map((run) => [run.id, run]))
      expect(byId.get(waiting)).toMatchObject({ status: 'verification', acceptedAt: null })
      expect(byId.get(unattributed)).toMatchObject({
        status: 'done',
        acceptedAt: null,
        completionUnattributed: true,
      })
      expect(history.openRuns.map((run) => run.id)).toEqual([waiting])
    })
  })

  it('stops counting a run as completed once it is reopened', async () => {
    await withFixtureProject(async (project) => {
      const routine = await createRoutine(project, { title: 'Review' })
      const { ticket } = await startRoutineRun(project, routine.frontmatter.id)
      await acceptOn(project, ticket.frontmatter.id, '2026-10-01T09:00:00.000Z')
      const done = await readTicket(project, ticket.frontmatter.id)
      await updateTicket(project, ticket.frontmatter.id, {
        expectedRevision: done.revision,
        status: 'in_progress',
      })

      const history = routineHistory(routine.frontmatter.id, await listTicketRecords(project))
      expect(history.completions).toEqual([])
      expect(history.lastCompletedAt).toBeNull()
      expect(history.openRuns.map((run) => run.id)).toEqual([ticket.frontmatter.id])
    })
  })

  it('reports unreadable ticket files, since any of them could be a run', async () => {
    await withFixtureProject(async (project) => {
      const routine = await createRoutine(project, { title: 'Review' })
      const { ticket } = await startRoutineRun(project, routine.frontmatter.id)
      await editByHand(project, ticket.frontmatter.id, (data) => data.set('status', 'nowhere'))

      const history = routineHistory(routine.frontmatter.id, await listTicketRecords(project))
      expect(history.runs).toEqual([])
      expect(history.unreadableTickets).toBe(1)
    })
  })
})
