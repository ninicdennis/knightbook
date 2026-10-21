/**
 * Builds Seedling, the fictional project the website's screenshots show (ticket
 * 90c7aba5): a small garden-planning app with documents, a plan and tickets in
 * every column. Nothing in it is real project content.
 *
 * It writes through @knightbook/core, the same code the app and the MCP server
 * use, so the records are exactly what the app produces. Completions and reviews
 * are recorded as the fictional project's user, the way the app records a click
 * on Accept or Mark reviewed. Steps to run it and retake the screenshots are in
 * CAPTURING.md beside this file; `seed.ts` is the command that calls this.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  createPlan,
  createTicket,
  includeDocuments,
  initializeProject,
  readDocument,
  recordReview,
  recordTicketReview,
  recordUserCompletion,
  setBacklogOrder,
  updateTicket,
  documentRecordId,
  type Project,
  type Ticket,
  type TicketType,
} from '../../../packages/core/src/index.ts'
import { DOCUMENTS, TICKETS, type SampleTicket } from './content.ts'

/** Writes Seedling into `root`, which must not hold a project yet. */
export async function buildSampleProject(root: string): Promise<Project> {
  for (const [path, content] of Object.entries(DOCUMENTS)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }

  let project: Project = await initializeProject(root, { name: 'Seedling' })
  project = await includeDocuments(project, Object.keys(DOCUMENTS))

  // The README and the planting calendar are reviewed; the decisions log is left
  // unreviewed, so the Documents view shows both states.
  for (const path of ['README.md', 'docs/planting-calendar.md']) {
    const document = await readDocument(project, path)
    await recordReview(project, documentRecordId(project, path), document.content)
  }

  const created = new Map<string, Ticket>()
  for (const sample of TICKETS) {
    const ticket = await createTicket(project, {
      title: sample.title,
      body: sample.body,
      type: sample.type satisfies TicketType,
      dependsOn: (sample.dependsOn ?? []).map((key) => created.get(key)!.frontmatter.id),
      relatedDocuments: sample.documents ?? [],
    })
    created.set(sample.key, ticket)
  }

  async function advance(sample: SampleTicket) {
    let ticket = created.get(sample.key)!
    const id = ticket.frontmatter.id
    const path = ['in_progress', 'verification', 'done'].slice(
      0,
      ['backlog', 'in_progress', 'verification', 'done'].indexOf(sample.status),
    ) as ('in_progress' | 'verification' | 'done')[]
    for (const status of path) {
      if (status === 'done') {
        ticket = await recordUserCompletion(project, id, {
          expectedRevision: ticket.revision,
          recordedBy: 'user',
          userInstructedCompletion: true,
          instruction: 'Accepted in the app after checking it.',
        })
      } else {
        ticket = await updateTicket(project, id, {
          expectedRevision: ticket.revision,
          status,
          ...(status === 'verification' && sample.handoff
            ? { body: `${sample.body.trimEnd()}\n\n${sample.handoff}` }
            : {}),
        })
      }
    }
    if (sample.blocker) {
      ticket = await updateTicket(project, id, {
        expectedRevision: ticket.revision,
        blocker: sample.blocker,
      })
    }
    if (sample.reviewed) await recordTicketReview(project, id, 'user')
  }

  for (const sample of TICKETS) await advance(sample)

  project = await setBacklogOrder(
    project,
    TICKETS.filter((sample) => sample.status === 'backlog').map(
      (sample) => created.get(sample.key)!.frontmatter.id,
    ),
  )

  const ids = (keys: string[]) => keys.map((key) => created.get(key)!.frontmatter.id)
  await createPlan(project, {
    title: 'Spring release',
    body: 'Everything needed before the first planting season: beds, plants, watering and a printable plan.',
    phases: [
      {
        title: 'Plan the beds',
        scope: 'Beds with real sizes, and plants placed on them.',
        tickets: ids(['beds', 'spacing', 'drag', 'guide']),
      },
      {
        title: 'Keep it growing',
        scope: 'Reminders and dates that follow the season.',
        tickets: ids(['water', 'frost', 'sowing']),
      },
      {
        title: 'Share the plan',
        scope: 'Getting the plan off the screen.',
        tickets: ids(['print', 'sync']),
      },
    ],
  })

  return project
}
