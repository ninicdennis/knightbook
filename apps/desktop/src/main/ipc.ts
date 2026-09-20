import { dialog, ipcMain } from 'electron'
import {
  backlogOrderReport,
  listTicketRecords,
  openProject,
  projectExists,
  recordTicketReview,
  recordUserCompletion,
  recordVerificationIssue,
  reorderBacklog,
  resolveProjectRoot,
  resolveVerificationIssue,
  searchTickets,
  selectNextTicket,
  updateTicket,
  type Project,
} from '@projectspace/core'
import { forgetProject, readAppState, rememberProject } from './app-state.js'
import { guard } from './guard.js'
import { mcpLaunchCommand } from './mcp-resources.js'
import { readMcpStatus } from './mcp-status.js'
import { describeRememberedProjects } from './remembered-projects.js'
import { allowSetupFor } from './setup-permit.js'
import { buildLookup, toTicketDetail, toTicketView } from './ticket-view.js'
import type { ProjectView, TicketSearchView } from '../shared/contract.js'

/**
 * The narrow operation surface the renderer is allowed to call. Each handler
 * takes plain data and returns plain data; the renderer never receives a path it
 * can use for arbitrary filesystem access, and the same core library backs both
 * this and the MCP server so the two cannot validate records differently.
 */

async function buildView(project: Project): Promise<ProjectView> {
  const listing = await listTicketRecords(project)
  const lookup = buildLookup(listing)
  const next = await selectNextTicket(project)

  const views = []
  for (const ticket of listing.tickets) views.push(await toTicketView(project, ticket, lookup))

  const order = await backlogOrderReport(project)
  return {
    name: project.frontmatter.name,
    checkoutPath: project.root.path,
    tickets: views,
    problems: listing.problems.map(({ file, reason }) => ({ file, reason })),
    nextTicketId: next.next?.frontmatter.id ?? null,
    nextExplanation: next.explanation,
    backlogOrderProblems: { duplicates: order.duplicates, unknown: order.unknown },
  }
}

export function registerProjectHandlers(): void {
  ipcMain.handle(
    'app:rememberedProjects',
    async () => await describeRememberedProjects((await readAppState()).recentProjects),
  )

  ipcMain.handle('app:forgetProject', async (_event, path: unknown) => {
    if (typeof path !== 'string') throw new Error('A project path is required.')
    return await describeRememberedProjects((await forgetProject(path)).recentProjects)
  })

  ipcMain.handle('project:choose', async () => {
    const chosen = await dialog.showOpenDialog({
      title: 'Open a project folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (chosen.canceled || !chosen.filePaths[0]) return null

    const root = await resolveProjectRoot(chosen.filePaths[0])
    const initialized = await projectExists(root)
    // Setup may write here, so it is allowed for this one folder and nothing else.
    allowSetupFor(initialized ? null : root.path)
    return { path: root.path, initialized }
  })

  ipcMain.handle(
    'project:read',
    async (_event, rootPath: unknown) =>
      await guard<ProjectView>(async () => {
        if (typeof rootPath !== 'string') {
          throw new Error('A project path is required.')
        }
        const project = await openProject(rootPath)
        await rememberProject(project.root.path, project.frontmatter.name)
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
        if (
          typeof rootPath !== 'string' ||
          typeof id !== 'string' ||
          typeof revision !== 'string'
        ) {
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
   * Decision D-017: the user saying the work was not accepted. Recorded as a
   * `direct_user_action`, the same distinction completion draws. It flags
   * dependent work and moves nothing: rework is for the user to decide.
   */
  ipcMain.handle(
    'ticket:recordVerificationIssue',
    async (_event, rootPath: unknown, id: unknown, revision: unknown, reason: unknown) =>
      await guard<ProjectView>(async () => {
        if (
          typeof rootPath !== 'string' ||
          typeof id !== 'string' ||
          typeof revision !== 'string' ||
          typeof reason !== 'string'
        ) {
          throw new Error('A project, ticket, revision, and reason are required.')
        }

        const project = await openProject(rootPath)
        await recordVerificationIssue(project, id, {
          expectedRevision: revision,
          recordedBy: 'user',
          userReportedFailure: true,
          reason,
        })
        return await buildView(project)
      }),
  )

  ipcMain.handle(
    'ticket:resolveVerificationIssue',
    async (_event, rootPath: unknown, id: unknown, revision: unknown) =>
      await guard<ProjectView>(async () => {
        if (
          typeof rootPath !== 'string' ||
          typeof id !== 'string' ||
          typeof revision !== 'string'
        ) {
          throw new Error('A project, ticket, and revision are required.')
        }

        const project = await openProject(rootPath)
        await resolveVerificationIssue(project, id, {
          expectedRevision: revision,
          recordedBy: 'user',
          userResolvedIssue: true,
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

  /**
   * Search runs in the host because the bodies are on disk, not in the window:
   * the board only carries what a card shows. The checkout and query come back
   * with the answer so the window can throw away a reply to a question it is no
   * longer asking.
   */
  ipcMain.handle(
    'ticket:search',
    async (_event, rootPath: unknown, query: unknown) =>
      await guard<TicketSearchView>(async () => {
        if (typeof rootPath !== 'string' || typeof query !== 'string') {
          throw new Error('A project and a query are required.')
        }

        const project = await openProject(rootPath)
        const result = await searchTickets(project, query)
        return {
          checkoutPath: project.root.path,
          query,
          hits: result.hits.map((hit) => ({
            id: hit.id,
            title: hit.title,
            status: hit.status,
            titleHighlights: [...hit.titleHighlights],
            excerpt: hit.excerpt,
            excerptHighlights: [...hit.excerptHighlights],
          })),
          totalMatches: result.totalMatches,
          unsearchable: result.problems.map(({ file, reason }) => ({ file, reason })),
        }
      }),
  )

  /**
   * Manual order is the only thing this writes, and it writes it to the project
   * manifest rather than to any ticket.
   */
  ipcMain.handle(
    'ticket:reorderBacklog',
    async (_event, rootPath: unknown, ticketIds: unknown) =>
      await guard<ProjectView>(async () => {
        if (
          typeof rootPath !== 'string' ||
          !Array.isArray(ticketIds) ||
          !ticketIds.every((id) => typeof id === 'string')
        ) {
          throw new Error('A project and a list of tickets are required.')
        }

        const project = await openProject(rootPath)
        const { project: reordered } = await reorderBacklog(project, ticketIds)
        return await buildView(reordered)
      }),
  )

  ipcMain.handle(
    'ticket:read',
    async (_event, rootPath: unknown, id: unknown) =>
      await guard(async () => {
        if (typeof rootPath !== 'string' || typeof id !== 'string') {
          throw new Error('A project and ticket are required.')
        }
        return await toTicketDetail(await openProject(rootPath), id)
      }),
  )

  ipcMain.handle('mcp:launchCommand', (_event, rootPath: unknown) =>
    typeof rootPath === 'string' ? mcpLaunchCommand(rootPath) : null,
  )

  ipcMain.handle('mcp:status', async (_event, rootPath: unknown) => {
    if (typeof rootPath !== 'string') throw new Error('A project path is required.')
    return await readMcpStatus(rootPath)
  })
}
