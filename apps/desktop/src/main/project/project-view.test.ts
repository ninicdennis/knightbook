// @vitest-environment node
import { createPlan, createTicket, initializeProject, type Project } from '@knightbook/core'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildView } from './project-view.js'

/**
 * The plans the board filters by (ticket 294c2961), built from real plan files,
 * so the filter and the Plans view agree on what belongs to a plan.
 */

let sandbox: string
let project: Project

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'knightbook-project-view-'))
  project = await initializeProject(join(sandbox, 'project'), { name: 'Fixture' })
})

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true })
})

describe('the plans on the board view', () => {
  it('lists each plan with the tickets its phases link, each once', async () => {
    const shared = (await createTicket(project, { title: 'Shared' })).frontmatter.id
    const site = (await createTicket(project, { title: 'Site' })).frontmatter.id
    await createTicket(project, { title: 'In no plan' })
    const plan = await createPlan(project, {
      title: 'Website',
      phases: [
        { title: 'First', tickets: [shared, site] },
        { title: 'Second', tickets: [shared] },
      ],
    })
    const empty = await createPlan(project, { title: 'Someday' })

    const view = await buildView(project)

    expect(view.plans).toEqual(
      expect.arrayContaining([
        { id: plan.frontmatter.id, title: 'Website', ticketIds: [shared, site] },
        { id: empty.frontmatter.id, title: 'Someday', ticketIds: [] },
      ]),
    )
    expect(view.plans).toHaveLength(2)
  })

  it('has no plans when the project has none', async () => {
    expect((await buildView(project)).plans).toEqual([])
  })
})
