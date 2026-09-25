import { readFile, writeFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { withFixtureProject } from './fixture-project.js'
import { reservedPaths } from './paths.js'
import { planProgress } from './plan-progress.js'
import { createPlan, listPlanRecords, readPlan, updatePlan } from './plans.js'
import { recordUserCompletion } from './completion.js'
import { createTicket, listTicketRecords, readTicket, updateTicket } from './tickets.js'

describe('plan records', () => {
  it('can exist before it has phases or tickets, and reads as empty rather than done', async () => {
    await withFixtureProject(async (project) => {
      const plan = await createPlan(project, { title: 'MVP', body: '# MVP\n\nIdeas first.\n' })
      const read = await readPlan(project, plan.frontmatter.id)

      expect(read.frontmatter.phases).toEqual([])
      expect(read.body).toBe('# MVP\n\nIdeas first.\n')
      expect(planProgress(read.frontmatter, await listTicketRecords(project)).state).toBe('empty')
    })
  })

  it('lists several plans, oldest first, and a project with none needs nothing', async () => {
    await withFixtureProject(async (project) => {
      expect(await listPlanRecords(project)).toEqual({ plans: [], problems: [] })
      await createPlan(project, { title: 'MVP' })
      await createPlan(project, { title: 'Launch' })
      const { plans } = await listPlanRecords(project)
      expect(plans.map((plan) => plan.frontmatter.title)).toEqual(['MVP', 'Launch'])
    })
  })

  it('keeps phase ids through a rename and reorder, and gives new phases their own', async () => {
    await withFixtureProject(async (project) => {
      const plan = await createPlan(project, {
        title: 'MVP',
        phases: [{ title: 'Foundation' }, { title: 'Polish' }],
      })
      expect(plan.frontmatter.phases.map((phase) => phase.id)).toEqual(['p1', 'p2'])

      const updated = await updatePlan(project, plan.frontmatter.id, {
        expectedRevision: plan.revision,
        phases: [
          { id: 'p2', title: 'Polish, first' },
          { title: 'Later' },
          { id: 'p1', title: 'Base' },
        ],
      })
      expect(updated.frontmatter.phases.map((phase) => [phase.id, phase.title])).toEqual([
        ['p2', 'Polish, first'],
        ['p3', 'Later'],
        ['p1', 'Base'],
      ])
    })
  })

  it('refuses a stale write, and ambiguous phases, leaving the file as it was', async () => {
    await withFixtureProject(async (project) => {
      const plan = await createPlan(project, { title: 'MVP' })
      await updatePlan(project, plan.frontmatter.id, {
        expectedRevision: plan.revision,
        title: 'v2',
      })
      const path = reservedPaths.planFile(project.root, plan.frontmatter.id)
      const before = await readFile(path, 'utf8')

      await expect(
        updatePlan(project, plan.frontmatter.id, { expectedRevision: plan.revision, title: 'v3' }),
      ).rejects.toMatchObject({ code: 'revision_conflict' })

      const current = await readPlan(project, plan.frontmatter.id)
      await expect(
        updatePlan(project, plan.frontmatter.id, {
          expectedRevision: current.revision,
          phases: [
            { id: 'a', title: 'One' },
            { id: 'a', title: 'Two' },
          ],
        }),
      ).rejects.toMatchObject({ code: 'invalid_record' })
      expect(await readFile(path, 'utf8')).toBe(before)
    })
  })

  it('keeps fields it does not own, and prose, through an external edit and an update', async () => {
    await withFixtureProject(async (project) => {
      const plan = await createPlan(project, { title: 'MVP' })
      const path = reservedPaths.planFile(project.root, plan.frontmatter.id)
      const text = await readFile(path, 'utf8')
      await writeFile(
        path,
        text
          .replace('title: MVP', 'title: MVP\nowner: someone')
          .replace('# MVP\n', '# MVP\n\nHand-written.\n'),
      )

      const external = await readPlan(project, plan.frontmatter.id)
      await updatePlan(project, plan.frontmatter.id, {
        expectedRevision: external.revision,
        phases: [{ title: 'Foundation' }],
      })
      const after = await readFile(path, 'utf8')
      expect(after).toContain('owner: someone')
      expect(after).toContain('Hand-written.')
    })
  })

  it('reports a broken plan without hiding the others', async () => {
    await withFixtureProject(async (project) => {
      const good = await createPlan(project, { title: 'Good' })
      const bad = await createPlan(project, { title: 'Bad' })
      await writeFile(
        reservedPaths.planFile(project.root, bad.frontmatter.id),
        '---\nnot: a plan\n---\n',
      )

      const listing = await listPlanRecords(project)
      expect(listing.plans.map((plan) => plan.frontmatter.id)).toEqual([good.frontmatter.id])
      expect(listing.problems).toMatchObject([{ id: bad.frontmatter.id, code: 'invalid_record' }])
    })
  })
})

describe('plan progress', () => {
  it('counts each ticket once across phases, by state, and never counts a broken link as done', async () => {
    await withFixtureProject(async (project) => {
      const shared = await createTicket(project, { title: 'Shared' })
      const verifying = await createTicket(project, { title: 'Verifying' })
      await updateTicket(project, verifying.frontmatter.id, {
        expectedRevision: verifying.revision,
        status: 'verification',
      })
      const missing = '99999999-9999-4999-8999-999999999999'

      const plan = await createPlan(project, {
        title: 'MVP',
        phases: [
          { title: 'One', tickets: [shared.frontmatter.id, verifying.frontmatter.id] },
          { title: 'Two', tickets: [shared.frontmatter.id, missing] },
          { title: 'Three' },
        ],
      })
      const progress = planProgress(plan.frontmatter, await listTicketRecords(project))

      expect(progress.total).toBe(3)
      expect(progress.byStatus).toEqual({ backlog: 1, in_progress: 0, verification: 1, done: 0 })
      expect(progress.missing).toEqual([missing])
      expect(progress.state).toBe('in_progress')
      expect(progress.phases.map((phase) => [phase.phaseId, phase.total, phase.state])).toEqual([
        ['p1', 2, 'in_progress'],
        ['p2', 2, 'in_progress'],
        ['p3', 0, 'empty'],
      ])
    })
  })

  it('completes only when every linked ticket is done, and keeps the unattributed warning', async () => {
    await withFixtureProject(async (project) => {
      const accepted = await createTicket(project, { title: 'Accepted' })
      const inVerification = await updateTicket(project, accepted.frontmatter.id, {
        expectedRevision: accepted.revision,
        status: 'verification',
      })
      await recordUserCompletion(project, accepted.frontmatter.id, {
        expectedRevision: inVerification.revision,
        recordedBy: 'user',
        userInstructedCompletion: true,
        instruction: 'Accepted in the app.',
      })
      const handEdited = await createTicket(project, { title: 'Hand-edited to done' })
      const path = reservedPaths.ticketFile(project.root, handEdited.frontmatter.id)
      await writeFile(
        path,
        (await readFile(path, 'utf8')).replace('status: backlog', 'status: done'),
      )
      expect((await readTicket(project, handEdited.frontmatter.id)).frontmatter.status).toBe('done')

      const plan = await createPlan(project, {
        title: 'MVP',
        phases: [{ title: 'All', tickets: [accepted.frontmatter.id, handEdited.frontmatter.id] }],
      })
      const progress = planProgress(plan.frontmatter, await listTicketRecords(project))
      expect(progress.state).toBe('complete')
      expect(progress.unattributedDone).toBe(1)
    })
  })
})
