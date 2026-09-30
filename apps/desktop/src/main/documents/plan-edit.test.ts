// @vitest-environment node
import {
  createTicket,
  initializeProject,
  isProjectError,
  listPlanRecords,
  openProject,
  readPlan,
  reorderBacklog,
  reservedPaths,
  type Project,
} from '@knightbook/core'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

const { createPlanInProject, parsePhaseEdits, setPhasesInProject } =
  await import('./plan-edit-ipc.js')

/**
 * Creating plans and editing their phases from the app (ticket c17fc047), on
 * real files. The rules are core's, shared with MCP's plan tools; this pins
 * that the app sends the revision it read, keeps phase ids, and never touches
 * a ticket.
 */

let sandbox: string
let project: Project

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'knightbook-plan-edit-'))
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

describe('creating a plan', () => {
  it('writes a plan with no phases and returns the new listing', async () => {
    const created = await createPlanInProject(root(), '  Launch  ')

    const plan = created.plans.plans.find((candidate) => candidate.id === created.id)
    expect(plan?.title).toBe('Launch')
    expect(plan?.phases).toEqual([])
    expect(plan?.revision).toBe((await readPlan(project, created.id)).revision)
  })

  it('refuses an empty title and writes nothing', async () => {
    expect((await refusal(() => createPlanInProject(root(), '   '))).code).toBe('invalid_record')
    expect((await listPlanRecords(project)).plans).toEqual([])
  })
})

describe('editing phases', () => {
  it('adds, renames, reorders and removes phases, keeping ids and their tickets', async () => {
    const a = await createTicket(project, { title: 'A' })
    const b = await createTicket(project, { title: 'B' })
    const { id } = await createPlanInProject(root(), 'Launch')

    let revision = (await readPlan(project, id)).revision
    let plans = await setPhasesInProject(
      root(),
      id,
      [
        { title: 'First', scope: null, value: 'Why first', tickets: [a.frontmatter.id] },
        { title: 'Second', scope: null, value: null, tickets: [b.frontmatter.id] },
      ],
      revision,
    )
    const [first, second] = plans.plans[0]!.phases
    expect([first!.id, second!.id]).toEqual(['p1', 'p2'])

    revision = plans.plans[0]!.revision
    plans = await setPhasesInProject(
      root(),
      id,
      [
        {
          id: 'p2',
          title: 'Second, renamed',
          scope: null,
          value: null,
          tickets: [b.frontmatter.id],
        },
        { id: 'p1', title: 'First', scope: null, value: 'Why first', tickets: [a.frontmatter.id] },
      ],
      revision,
    )
    const phases = plans.plans[0]!.phases
    expect(phases.map((phase) => [phase.id, phase.title])).toEqual([
      ['p2', 'Second, renamed'],
      ['p1', 'First'],
    ])
    expect(phases[0]!.tickets.map((ticket) => ticket.id)).toEqual([b.frontmatter.id])
    expect(phases[1]!.value).toBe('Why first')

    // Removing the first phase: the one left keeps its own id and ticket, not p1's.
    plans = await setPhasesInProject(
      root(),
      id,
      [
        {
          id: 'p2',
          title: 'Second, renamed',
          scope: null,
          value: null,
          tickets: [b.frontmatter.id],
        },
      ],
      plans.plans[0]!.revision,
    )
    expect(plans.plans[0]!.phases.map((phase) => phase.id)).toEqual(['p2'])
    expect(plans.plans[0]!.phases[0]!.tickets.map((ticket) => ticket.id)).toEqual([
      b.frontmatter.id,
    ])
  })

  it('attaches and detaches without changing any ticket or the backlog order', async () => {
    // Several tickets, so a reordered backlog would show up as a different list.
    const first = await createTicket(project, { title: 'First in line' })
    const ticket = await createTicket(project, { title: 'Untouched' })
    const last = await createTicket(project, { title: 'Last in line' })
    // A manual order that differs from creation order, which a write could disturb.
    await reorderBacklog(await openProject(root()), [
      last.frontmatter.id,
      ticket.frontmatter.id,
      first.frontmatter.id,
    ])
    const file = reservedPaths.ticketFile(project.root, ticket.frontmatter.id)
    const ticketBefore = await readFile(file, 'utf8')
    const orderBefore = (await openProject(root())).frontmatter.backlog_order
    const { id } = await createPlanInProject(root(), 'Launch')

    const attached = await setPhasesInProject(
      root(),
      id,
      [{ title: 'Only', scope: null, value: null, tickets: [ticket.frontmatter.id] }],
      (await readPlan(project, id)).revision,
    )
    await setPhasesInProject(
      root(),
      id,
      [{ id: 'p1', title: 'Only', scope: null, value: null, tickets: [] }],
      attached.plans[0]!.revision,
    )

    expect(await readFile(file, 'utf8')).toBe(ticketBefore)
    expect(orderBefore).toHaveLength(3)
    expect((await openProject(root())).frontmatter.backlog_order).toEqual(orderBefore)
  })

  it('refuses a stale revision with a conflict and writes nothing', async () => {
    const { id } = await createPlanInProject(root(), 'Launch')
    const read = (await readPlan(project, id)).revision
    await setPhasesInProject(
      root(),
      id,
      [{ title: 'Elsewhere', scope: null, value: null, tickets: [] }],
      read,
    )
    const planFile = reservedPaths.planFile(project.root, id)
    const before = await readFile(planFile, 'utf8')

    const error = await refusal(() =>
      setPhasesInProject(
        root(),
        id,
        [{ title: 'Mine', scope: null, value: null, tickets: [] }],
        read,
      ),
    )

    expect(error.code).toBe('revision_conflict')
    expect(await readFile(planFile, 'utf8')).toBe(before)
  })

  it('refuses a plan id that is not one, before reading any file', async () => {
    const error = await refusal(() => setPhasesInProject(root(), '../tickets/x', [], 'rev'))
    expect(error.code).toBe('not_found')
  })

  it('refuses a phase list core would find ambiguous', async () => {
    const ticket = await createTicket(project, { title: 'Twice' })
    const { id } = await createPlanInProject(root(), 'Launch')
    const twice = [ticket.frontmatter.id, ticket.frontmatter.id]
    const error = await refusal(() =>
      setPhasesInProject(
        root(),
        id,
        [{ title: 'Only', scope: null, value: null, tickets: twice }],
        'any',
      ),
    )
    expect(error.code).toBe('invalid_record')
  })
})

describe('parsePhaseEdits', () => {
  it.each([
    ['something other than a list', { title: 'A' }],
    ['an empty phase title', [{ title: '  ', tickets: [] }]],
    ['a ticket that is not an id', [{ title: 'A', tickets: ['../x'] }]],
    ['a scope that is not text', [{ title: 'A', scope: 3, tickets: [] }]],
  ])('refuses %s', (_case, input) => {
    expect(() => parsePhaseEdits(input)).toThrow()
  })

  it('leaves out an absent id, scope and value', () => {
    expect(parsePhaseEdits([{ title: ' A ', scope: null, value: null, tickets: [] }])).toEqual([
      { title: 'A', scope: undefined, value: undefined, tickets: [] },
    ])
  })
})
