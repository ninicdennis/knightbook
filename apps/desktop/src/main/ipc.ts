import { dialog, ipcMain } from 'electron'
import {
  describeReason,
  evaluateReadiness,
  listTickets,
  openProject,
  projectExists,
  readTicket,
  recordUserCompletion,
  resolveProjectRoot,
  selectNextTicket,
  recordTicketReview,
  ticketReviewStatus,
  updateTicket,
  type Project,
} from '@projectspace/core'
import { readAppState, rememberProject } from './app-state.js'
import { guard } from './guard.js'
import { mcpLaunchCommand } from './mcp-resources.js'
import type { ProjectView, Result, TicketView } from '../shared/contract.js'

/**
 * The narrow operation surface the renderer is allowed to call. Each handler
 * takes plain data and returns plain data; the renderer never receives a path it
 * can use for arbitrary filesystem access, and the same core library backs both
 * this and the MCP server so the two cannot validate records differently.
 */

async function buildView(project: Project): Promise<ProjectView> {
  const tickets = await listTickets(project)
  const byId = new Map(tickets.map((t) => [t.frontmatter.id, t.frontmatter]))
  const next = await selectNextTicket(project)

  const views: TicketView[] = []
  for (const ticket of tickets) {
    const readiness = evaluateReadiness(ticket.frontmatter, byId)
    const review = await ticketReviewStatus(project, ticket.frontmatter.id)
    views.push({
      id: ticket.frontmatter.id,
      title: ticket.frontmatter.title,
      status: ticket.frontmatter.status,
      revision: ticket.revision,
      dependsOn: ticket.frontmatter.depends_on,
      dependencyReady: readiness.ready,
      dependencyNotes: readiness.reasons.map(describeReason),
      blocker: ticket.frontmatter.blocker ?? null,
      completion: ticket.frontmatter.completion
        ? {
            decisionSource: ticket.frontmatter.completion.decision_source,
            recordedBy: ticket.frontmatter.completion.recorded_by,
            recordedAt: ticket.frontmatter.completion.recorded_at,
            instruction: ticket.frontmatter.completion.instruction,
          }
        : null,
      completionUnattributed:
        ticket.frontmatter.status === 'done' && ticket.frontmatter.completion === undefined,
      review: {
        state: review.state,
        lastReviewedAt: review.lastReview?.reviewedAt ?? null,
        changeSummary: review.changeSummary,
      },
    })
  }

  return {
    name: project.frontmatter.name,
    checkoutPath: project.root.path,
    tickets: views,
    nextTicketId: next.next?.frontmatter.id ?? null,
    nextExplanation: next.explanation,
  }
}

export function registerProjectHandlers(): void {
  ipcMain.handle('app:recentProjects', async () => (await readAppState()).recentProjects)

  ipcMain.handle('project:choose', async () => {
    const chosen = await dialog.showOpenDialog({
      title: 'Open a project folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (chosen.canceled || !chosen.filePaths[0]) return null

    const root = await resolveProjectRoot(chosen.filePaths[0])
    return { path: root.path, initialized: await projectExists(root) }
  })

  ipcMain.handle('project:read', async (_event, rootPath: unknown) =>
    await guard<ProjectView>(async () => {
      if (typeof rootPath !== 'string') {
        throw new Error('A project path is required.')
      }
      const project = await openProject(rootPath)
      await rememberProject(project.root.path)
      return await buildView(project)
    }),
  )

  ipcMain.handle(
    'ticket:setStatus',
    async (_event, rootPath: unknown, id: unknown, status: unknown, revision: unknown) =>
      await guard<ProjectView>(async () => {
        if (
          typeof rootPath !== 'string' ||
          typeof id !== 'string' ||
          typeof revision !== 'string' ||
          (status !== 'backlog' && status !== 'in_progress' && status !== 'verification')
        ) {
          throw new Error('A project, ticket, revision, and movable status are required.')
        }

        const project = await openProject(rootPath)
        await updateTicket(project, id, { expectedRevision: revision, status })
        return await buildView(project)
      }),
  )

  /**
   * Moving a card into Done in the app is the user acting directly, which is
   * what decision D-015 allows alongside instructing an AI tool. It is recorded
   * as `direct_user_action`, distinct from an agent-reported instruction.
   */
  ipcMain.handle(
    'ticket:complete',
    async (_event, rootPath: unknown, id: unknown, revision: unknown) =>
      await guard<ProjectView>(async () => {
        if (typeof rootPath !== 'string' || typeof id !== 'string' || typeof revision !== 'string') {
          throw new Error('A project, ticket, and revision are required.')
        }

        const project = await openProject(rootPath)
        await recordUserCompletion(project, id, {
          expectedRevision: revision,
          recordedBy: 'user',
          userInstructedCompletion: true,
          instruction: 'Moved to Done in the app.',
        })
        return await buildView(project)
      }),
  )

  /**
   * Decision D-003: recording human validation is the user's action and has no
   * agent equivalent anywhere in the system. `recordTicketReview` refuses any
   * reviewer but the user, so this cannot be reached by an AI tool through MCP.
   */
  ipcMain.handle(
    'ticket:review',
    async (_event, rootPath: unknown, id: unknown, note: unknown) =>
      await guard<ProjectView>(async () => {
        if (typeof rootPath !== 'string' || typeof id !== 'string') {
          throw new Error('A project and ticket are required.')
        }

        const project = await openProject(rootPath)
        await recordTicketReview(project, id, 'user', typeof note === 'string' ? note : '')
        return await buildView(project)
      }),
  )

  ipcMain.handle('ticket:read', async (_event, rootPath: unknown, id: unknown) =>
    await guard(async () => {
      if (typeof rootPath !== 'string' || typeof id !== 'string') {
        throw new Error('A project and ticket are required.')
      }
      const ticket = await readTicket(await openProject(rootPath), id)
      return { id, title: ticket.frontmatter.title, body: ticket.body }
    }),
  )

  ipcMain.handle('mcp:launchCommand', (_event, rootPath: unknown) =>
    typeof rootPath === 'string' ? mcpLaunchCommand(rootPath) : null,
  )
}
