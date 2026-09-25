// @vitest-environment node
import {
  archiveTicket,
  createPlan,
  createTicket,
  initializeProject,
  listPlanRecords,
  listTicketRecords,
  reservedPaths,
  type Project,
} from '@knightbook/core'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { toPlansView } from './plan-view.js'
import { planFileToOpen } from '../tickets/ticket-file.js'
import { toTicketDetail } from '../tickets/ticket-view.js'

let sandbox: string
let project: Project

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'knightbook-plan-view-'))
  project = await initializeProject(join(sandbox, 'project'), { name: 'Fixture' })
})

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true })
})

async function view() {
  return toPlansView(await listPlanRecords(project), await listTicketRecords(project))
}

describe('plans for the window', () => {
  it('resolves each reference, marks archived and broken ones, and keeps the file path', async () => {
    const live = await createTicket(project, { title: 'Live' })
    const archived = await createTicket(project, { title: 'Put away' })
    await archiveTicket(project, archived.frontmatter.id, archived.revision)
    const broken = await createTicket(project, { title: 'Broken' })
    await writeFile(reservedPaths.ticketFile(project.root, broken.frontmatter.id), 'not a ticket')
    const missing = '99999999-9999-4999-8999-999999999999'

    const plan = await createPlan(project, {
      title: 'MVP',
      phases: [
        {
          title: 'One',
          value: 'First.',
          tickets: [live.frontmatter.id, archived.frontmatter.id, broken.frontmatter.id, missing],
        },
      ],
    })

    const [shown] = (await view()).plans
    expect(shown!.file).toBe(`.projectspace/plans/${plan.frontmatter.id}.md`)
    expect(shown!.phases[0]!.value).toBe('First.')
    expect(shown!.phases[0]!.tickets).toEqual([
      { id: live.frontmatter.id, title: 'Live', status: 'backlog', archived: false, problem: null },
      {
        id: archived.frontmatter.id,
        title: 'Put away',
        status: 'backlog',
        archived: true,
        problem: null,
      },
      {
        id: broken.frontmatter.id,
        title: null,
        status: null,
        archived: false,
        problem: 'unreadable',
      },
      { id: missing, title: null, status: null, archived: false, problem: 'missing' },
    ])
    expect(shown!.progress).toMatchObject({ total: 4, state: 'in_progress' })
  })

  it('lists a broken plan as a problem and still shows the rest', async () => {
    await createPlan(project, { title: 'Good' })
    const bad = await createPlan(project, { title: 'Bad' })
    await writeFile(reservedPaths.planFile(project.root, bad.frontmatter.id), '<<<<<<< HEAD\n')

    const shown = await view()
    expect(shown.plans.map((plan) => plan.title)).toEqual(['Good'])
    expect(shown.problems).toHaveLength(1)
    expect(shown.problems[0]!.file).toContain(bad.frontmatter.id)
  })

  it('opens a plan file only by a plain id inside the plans folder', async () => {
    const plan = await createPlan(project, { title: 'MVP' })
    expect(await planFileToOpen(project, plan.frontmatter.id)).toBe(
      reservedPaths.planFile(project.root, plan.frontmatter.id),
    )
    await expect(planFileToOpen(project, '../tickets/x')).rejects.toThrow()
    await expect(planFileToOpen(project, 42)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('tells a ticket which plan phases list it, in plan and phase order', async () => {
    const shared = await createTicket(project, { title: 'Shared' })
    const alone = await createTicket(project, { title: 'Alone' })
    const mvp = await createPlan(project, {
      title: 'MVP',
      phases: [
        { title: 'One', tickets: [shared.frontmatter.id] },
        { title: 'Two', tickets: [shared.frontmatter.id] },
      ],
    })
    const launch = await createPlan(project, {
      title: 'Launch',
      phases: [{ title: 'Go', tickets: [shared.frontmatter.id] }],
    })

    expect((await toTicketDetail(project, shared.frontmatter.id)).plans).toEqual([
      { planId: mvp.frontmatter.id, planTitle: 'MVP', phaseId: 'p1', phaseTitle: 'One' },
      { planId: mvp.frontmatter.id, planTitle: 'MVP', phaseId: 'p2', phaseTitle: 'Two' },
      { planId: launch.frontmatter.id, planTitle: 'Launch', phaseId: 'p1', phaseTitle: 'Go' },
    ])
    expect((await toTicketDetail(project, alone.frontmatter.id)).plans).toEqual([])
  })
})
