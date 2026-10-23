import { ipcMain } from 'electron'
import {
  createRoutine,
  listRoutineRecords,
  listTicketRecords,
  openProject,
  ProjectError,
  startRoutineRun,
  updateRoutine,
  type Project,
} from '@knightbook/core'
import type {
  CreatedRoutineView,
  RoutineEdit,
  RoutinesView,
  StartedRunView,
} from '../../shared/routines-contract.js'
import { guard } from '../guard.js'
import { toRoutinesView } from './routine-view.js'

/**
 * The Routines pane's operations (D-051). Each goes through core, the same
 * functions MCP's routine tools use; this file only checks the shape of what
 * the window sent, which is not trusted.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function open(rootPath: unknown): Promise<Project> {
  if (typeof rootPath !== 'string') throw new Error('A project path is required.')
  return await openProject(rootPath)
}

// The id becomes a file name, so it must be exactly a routine id.
function routineId(id: unknown): string {
  if (typeof id !== 'string' || !UUID.test(id)) {
    throw new ProjectError('not_found', 'That is not a routine id.')
  }
  return id
}

export function parseRoutineEdit(input: unknown): RoutineEdit {
  const edit = (input ?? {}) as Partial<Record<keyof RoutineEdit, unknown>>
  const title = typeof edit.title === 'string' ? edit.title.trim() : ''
  if (title === '') throw new ProjectError('invalid_record', 'A routine needs a title.')
  if (typeof edit.instructions !== 'string') {
    throw new ProjectError('invalid_record', 'Routine instructions must be text.')
  }
  return { title, instructions: edit.instructions }
}

async function routinesView(project: Project): Promise<RoutinesView> {
  const [routines, tickets] = await Promise.all([
    listRoutineRecords(project),
    listTicketRecords(project),
  ])
  return toRoutinesView(routines, tickets)
}

export async function listRoutinesIn(rootPath: unknown): Promise<RoutinesView> {
  return await routinesView(await open(rootPath))
}

export async function createRoutineIn(
  rootPath: unknown,
  edit: unknown,
): Promise<CreatedRoutineView> {
  const project = await open(rootPath)
  const parsed = parseRoutineEdit(edit)
  const routine = await createRoutine(project, parsed)
  return { id: routine.frontmatter.id, routines: await routinesView(project) }
}

export async function updateRoutineIn(
  rootPath: unknown,
  id: unknown,
  edit: unknown,
  revision: unknown,
): Promise<RoutinesView> {
  const project = await open(rootPath)
  if (typeof revision !== 'string' || revision === '') {
    throw new ProjectError('invalid_record', 'An edit must name the revision it read.')
  }
  await updateRoutine(project, routineId(id), {
    expectedRevision: revision,
    ...parseRoutineEdit(edit),
  })
  return await routinesView(project)
}

export async function startRunIn(
  rootPath: unknown,
  id: unknown,
  anotherRun: unknown,
): Promise<StartedRunView> {
  const project = await open(rootPath)
  const { ticket } = await startRoutineRun(project, routineId(id), {
    anotherRun: anotherRun === true,
  })
  return { ticketId: ticket.frontmatter.id, routines: await routinesView(project) }
}

export function registerRoutineHandlers(): void {
  ipcMain.handle(
    'routines:list',
    async (_event, rootPath: unknown) => await guard<RoutinesView>(() => listRoutinesIn(rootPath)),
  )
  ipcMain.handle(
    'routine:create',
    async (_event, rootPath: unknown, edit: unknown) =>
      await guard<CreatedRoutineView>(() => createRoutineIn(rootPath, edit)),
  )
  ipcMain.handle(
    'routine:update',
    async (_event, rootPath: unknown, id: unknown, edit: unknown, revision: unknown) =>
      await guard<RoutinesView>(() => updateRoutineIn(rootPath, id, edit, revision)),
  )
  ipcMain.handle(
    'routine:startRun',
    async (_event, rootPath: unknown, id: unknown, anotherRun: unknown) =>
      await guard<StartedRunView>(() => startRunIn(rootPath, id, anotherRun)),
  )
}
