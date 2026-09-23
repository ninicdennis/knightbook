import { dialog, ipcMain } from 'electron'
import {
  archiveTicket,
  backlogOrderReport,
  listTicketRecords,
  openProject,
  projectExists,
  readTicket,
  recordTicketReview,
  recordUserCompletion,
  recordVerificationIssue,
  reorderBacklog,
  resolveProjectRoot,
  resolveVerificationIssue,
  restoreTicket,
  searchTickets,
  selectNextTicket,
  ticketTypeSchema,
  updateTicket,
  type Project,
  type TicketType,
} from '@knightbook/core'
import { forgetProject, readAppState, rememberProject } from './app-state.js'
import { guard } from './guard.js'
import { accessRegistryPath } from './mcp-access.js'
import { mcpLaunchCommand } from './mcp-resources.js'
import { readMcpStatus } from './mcp-status.js'
import { describeRememberedProjects } from './remembered-projects.js'
import { allowSetupFor } from './setup-permit.js'
import { buildLookup, toTicketDetail, toTicketView } from './ticket-view.js'
import type {
  ArchiveFailureView,
  ArchiveOutcome,
  ProjectView,
  TicketSearchView,
} from '../shared/contract.js'

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
  const archived = []
  for (const ticket of listing.tickets) {
    const view = await toTicketView(project, ticket, lookup)
    // Split once, here, so no column, count or suggestion downstream has to
    // remember that archived tickets exist.
    if (view.archivedAt) archived.push(view)
    else views.push(view)
  }
  // Most recently archived first: the archive is read newest-first, unlike the
  // board, whose order is the one the user arranged.
  archived.sort((a, b) => (a.archivedAt! < b.archivedAt! ? 1 : -1))

  const order = await backlogOrderReport(project)
  return {
    name: project.frontmatter.name,
    checkoutPath: project.root.path,
    tickets: views,
    archivedTickets: archived,
    problems: listing.problems.map(({ file, reason }) => ({ file, reason })),
    nextTicketId: next.next?.frontmatter.id ?? null,
    nextExplanation: next.explanation,
    backlogOrderProblems: { duplicates: order.duplicates, unknown: order.unknown },
  }
}

/**
 * The ticket's title for a message about it, falling back to its id when the
 * record cannot be read. A failure report is for a person, and an id alone does
 * not tell them which ticket did not move.
 */
async function titleOf(project: Project, id: string): Promise<string> {
  try {
    return (await readTicket(project, id)).frontmatter.title
  } catch {
    return id
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
   * Bulk archive. Each ticket is its own file and its own write, so this is a
   * sequence of independent operations, not a transaction: what succeeded stays
   * succeeded and the rest are named. The caller supplies the revisions it was
   * showing, so a ticket created or changed after the user opened the
   * confirmation is either not in the list at all or is refused by name.
   */
  ipcMain.handle(
    'ticket:archive',
    async (_event, rootPath: unknown, targets: unknown) =>
      await guard<ArchiveOutcome>(async () => {
        if (typeof rootPath !== 'string' || !Array.isArray(targets)) {
          throw new Error('A project and the tickets to archive are required.')
        }
        const wanted = targets.map((target) => {
          const { id, revision } = (target ?? {}) as { id?: unknown; revision?: unknown }
          if (typeof id !== 'string' || typeof revision !== 'string') {
            throw new Error('Each ticket to archive needs an id and the revision you read.')
          }
          return { id, revision }
        })

        const project = await openProject(rootPath)
        const failures: ArchiveFailureView[] = []
        let archivedCount = 0
        for (const target of wanted) {
          try {
            await archiveTicket(project, target.id, target.revision)
            archivedCount += 1
          } catch (error) {
            failures.push({
              id: target.id,
              // Named, so a partial failure can be reported as something the
              // user recognises rather than as a bare id.
              title: await titleOf(project, target.id),
              reason: error instanceof Error ? error.message : String(error),
            })
          }
        }
        return { archivedCount, failures, project: await buildView(project) }
      }),
  )

  ipcMain.handle(
    'ticket:restore',
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
        await restoreTicket(project, id, revision)
        return await buildView(project)
      }),
  )

  /**
   * The work type is ordinary metadata: it says what kind of work this is, not
   * whether it is done, reviewed or ready. Clearing it is sending null, which is
   * a real answer rather than a missing one.
   */
  ipcMain.handle(
    'ticket:setType',
    async (_event, rootPath: unknown, id: unknown, type: unknown, revision: unknown) =>
      await guard<ProjectView>(async () => {
        if (
          typeof rootPath !== 'string' ||
          typeof id !== 'string' ||
          typeof revision !== 'string' ||
          !(type === null || ticketTypeSchema.safeParse(type).success)
        ) {
          throw new Error('A project, ticket, revision, and a valid type or null are required.')
        }

        const project = await openProject(rootPath)
        await updateTicket(project, id, {
          expectedRevision: revision,
          type: type as TicketType | null,
        })
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
    async (_event, rootPath: unknown, query: unknown, scope: unknown) =>
      await guard<TicketSearchView>(async () => {
        if (
          typeof rootPath !== 'string' ||
          typeof query !== 'string' ||
          (scope !== 'active' && scope !== 'archived' && scope !== 'all')
        ) {
          throw new Error('A project, a query, and a search scope are required.')
        }

        const project = await openProject(rootPath)
        const result = await searchTickets(project, query, { scope })
        return {
          checkoutPath: project.root.path,
          query,
          hits: result.hits.map((hit) => ({
            id: hit.id,
            title: hit.title,
            status: hit.status,
            type: hit.type,
            archivedAt: hit.archivedAt,
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

  ipcMain.handle('mcp:launchCommand', () => mcpLaunchCommand())

  ipcMain.handle('mcp:status', async (_event, rootPath: unknown) => {
    if (typeof rootPath !== 'string') throw new Error('A project path is required.')
    return await readMcpStatus(rootPath, accessRegistryPath())
  })
}
