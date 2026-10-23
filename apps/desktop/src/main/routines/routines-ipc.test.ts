// @vitest-environment node
import { initializeProject, isProjectError, readTicket, type Project } from '@knightbook/core'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

const { createRoutineIn, listRoutinesIn, parseRoutineEdit, startRunIn, updateRoutineIn } =
  await import('./routines-ipc.js')

/**
 * The Routines pane's host operations on real files (D-051). The rules are
 * core's, shared with MCP; this pins that the app sends the revision it read,
 * that starting a run makes a linked Backlog ticket, and that a second start
 * while one is open needs the window to say so.
 */

let sandbox: string
let project: Project

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'knightbook-routines-'))
  project = await initializeProject(join(sandbox, 'project'), { name: 'Fixture' })
})

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true })
})

async function refusal(run: () => Promise<unknown>) {
  try {
    await run()
  } catch (error) {
    if (isProjectError(error)) return error
    throw error
  }
  throw new Error('expected a refusal')
}

const root = () => project.root.path

describe('routines from the app', () => {
  it('creates a routine and edits it at the revision the window read', async () => {
    const created = await createRoutineIn(root(), {
      title: '  Weekly package review ',
      instructions: '# Weekly package review\n\nCheck for updates.\n',
    })
    const routine = created.routines.routines[0]!
    expect(routine.title).toBe('Weekly package review')
    expect(routine.file).toBe(`.projectspace/routines/${created.id}.md`)

    const edited = await updateRoutineIn(
      root(),
      created.id,
      { title: 'Package review', instructions: '# Package review\n\nAnd the lockfile.\n' },
      routine.revision,
    )
    expect(edited.routines[0]).toMatchObject({
      title: 'Package review',
      instructions: '# Package review\n\nAnd the lockfile.\n',
    })

    const stale = await refusal(() =>
      updateRoutineIn(root(), created.id, { title: 'Again', instructions: '' }, routine.revision),
    )
    expect(stale.code).toBe('revision_conflict')
  })

  it('refuses what a window should never send', async () => {
    expect(() => parseRoutineEdit({ title: '   ', instructions: '' })).toThrow(/title/)
    expect(() => parseRoutineEdit({ title: 'A', instructions: 3 })).toThrow(/text/)
    const created = await createRoutineIn(root(), { title: 'A', instructions: '' })
    const noRevision = await refusal(() =>
      updateRoutineIn(root(), created.id, { title: 'B', instructions: '' }, ''),
    )
    expect(noRevision.code).toBe('invalid_record')
    const badId = await refusal(() => startRunIn(root(), '../../project', false))
    expect(badId.code).toBe('not_found')
  })

  it('starts a run as a linked Backlog ticket and lists it in the history', async () => {
    const created = await createRoutineIn(root(), {
      title: 'Security check',
      instructions: '# Security check\n\nRun the audit.\n',
    })
    const started = await startRunIn(root(), created.id, false)

    const ticket = await readTicket(project, started.ticketId)
    expect(ticket.frontmatter.status).toBe('backlog')
    expect(ticket.frontmatter.routine).toEqual({ id: created.id })

    const routine = started.routines.routines[0]!
    expect(routine.runs.map((run) => [run.ticketId, run.status, run.acceptedAt])).toEqual([
      [started.ticketId, 'backlog', null],
    ])
    expect(routine.openRunIds).toEqual([started.ticketId])
    expect(routine.lastCompletedAt).toBeNull()
  })

  it('needs anotherRun to start a second run while one is open', async () => {
    const created = await createRoutineIn(root(), { title: 'Security check', instructions: '' })
    await startRunIn(root(), created.id, false)

    const refused = await refusal(() => startRunIn(root(), created.id, false))
    expect(refused.code).toBe('run_already_open')

    // Anything but true is not a deliberate request.
    const notTrue = await refusal(() => startRunIn(root(), created.id, 'yes'))
    expect(notTrue.code).toBe('run_already_open')

    await startRunIn(root(), created.id, true)
    expect((await listRoutinesIn(root())).routines[0]!.runs).toHaveLength(2)
  })
})
