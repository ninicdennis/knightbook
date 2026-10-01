import { ipcMain } from 'electron'
import {
  createPlan,
  listPlanRecords,
  listTicketRecords,
  openProject,
  ProjectError,
  updatePlan,
  type PhaseInput,
  type Project,
} from '@knightbook/core'
import type { CreatedPlanView, PhaseEdit, PlansView } from '../../shared/plans-contract.js'
import { guard } from '../guard.js'
import { toPlansView } from './plan-view.js'

/**
 * Creating plans and editing their phases from the Plans pane (ticket c17fc047).
 * Both go through core's `createPlan` and `updatePlan`, the functions MCP's
 * `plan_create` and `plan_update` use, so validation lives in one place. This
 * file checks only the shape of what the window sent, which is not trusted.
 *
 * Only the plan file is written. Attaching or detaching a ticket never touches
 * the ticket, its status, its dependencies or the backlog order.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parseTitle(value: unknown, what: string): string {
  const title = typeof value === 'string' ? value.trim() : ''
  if (title === '') throw new ProjectError('invalid_record', `A ${what} needs a title.`)
  return title
}

/** The window's phase list as core's input, or a refusal naming what was wrong. */
export function parsePhaseEdits(input: unknown): PhaseInput[] {
  if (!Array.isArray(input)) throw new ProjectError('invalid_record', 'Phases must be a list.')
  return input.map((raw: unknown) => {
    const phase = (raw ?? {}) as Partial<Record<keyof PhaseEdit, unknown>>
    if (phase.id !== undefined && typeof phase.id !== 'string') {
      throw new ProjectError('invalid_record', 'A phase id must be text.')
    }
    const optional = (value: unknown, name: string): string | undefined => {
      if (value === null || value === undefined) return undefined
      if (typeof value !== 'string')
        throw new ProjectError('invalid_record', `A ${name} must be text.`)
      return value
    }
    const tickets = phase.tickets ?? []
    if (!Array.isArray(tickets) || tickets.some((id) => typeof id !== 'string' || !UUID.test(id))) {
      throw new ProjectError('invalid_record', 'A phase lists something that is not a ticket id.')
    }
    return {
      ...(phase.id !== undefined ? { id: phase.id } : {}),
      title: parseTitle(phase.title, 'phase'),
      scope: optional(phase.scope, 'phase scope'),
      value: optional(phase.value, 'phase value'),
      tickets: tickets as string[],
    }
  })
}

async function plansView(project: Project): Promise<PlansView> {
  const [plans, tickets] = await Promise.all([listPlanRecords(project), listTicketRecords(project)])
  return toPlansView(plans, tickets)
}

export async function createPlanInProject(
  rootPath: unknown,
  title: unknown,
): Promise<CreatedPlanView> {
  if (typeof rootPath !== 'string') throw new Error('A project path is required.')
  const project = await openProject(rootPath)
  const plan = await createPlan(project, { title: parseTitle(title, 'plan') })
  return { id: plan.frontmatter.id, plans: await plansView(project) }
}

export async function setPhasesInProject(
  rootPath: unknown,
  planId: unknown,
  phases: unknown,
  revision: unknown,
): Promise<PlansView> {
  if (typeof rootPath !== 'string') throw new Error('A project path is required.')
  // The id becomes a file name, so it must be exactly a plan id.
  if (typeof planId !== 'string' || !UUID.test(planId)) {
    throw new ProjectError('not_found', 'That is not a plan id.')
  }
  if (typeof revision !== 'string' || revision === '') {
    throw new ProjectError('invalid_record', 'An edit must name the revision it read.')
  }
  const project = await openProject(rootPath)
  await updatePlan(project, planId, {
    expectedRevision: revision,
    phases: parsePhaseEdits(phases),
  })
  return await plansView(project)
}

export function registerPlanEditHandlers(): void {
  ipcMain.handle(
    'plan:create',
    async (_event, rootPath: unknown, title: unknown) =>
      await guard<CreatedPlanView>(() => createPlanInProject(rootPath, title)),
  )
  ipcMain.handle(
    'plan:setPhases',
    async (_event, rootPath: unknown, planId: unknown, phases: unknown, revision: unknown) =>
      await guard<PlansView>(() => setPhasesInProject(rootPath, planId, phases, revision)),
  )
}
