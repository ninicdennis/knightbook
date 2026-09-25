// @vitest-environment node
import {
  createTicket,
  initializeProject,
  listTicketRecords,
  readTicket,
  recordUserCompletion,
  reservedPaths,
  updateTicket,
  type Project,
} from '@knightbook/core'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildLookup, toTicketView } from './ticket-view.js'

/**
 * The board's reading of a completion must match what MCP reports for the same
 * file. Both now defer to the core check; this pins the board's side of that.
 */

let sandbox: string
let project: Project

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'knightbook-ticket-view-'))
  project = await initializeProject(join(sandbox, 'project'), { name: 'Fixture' })
})

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true })
})

async function doneByAgent(): Promise<string> {
  const ticket = await createTicket(project, { title: 'Work' })
  const id = ticket.frontmatter.id
  const started = await updateTicket(project, id, {
    expectedRevision: ticket.revision,
    status: 'in_progress',
  })
  const verifying = await updateTicket(project, id, {
    expectedRevision: started.revision,
    status: 'verification',
  })
  await recordUserCompletion(project, id, {
    expectedRevision: verifying.revision,
    recordedBy: 'agent',
    userInstructedCompletion: true,
    instruction: 'The user said it is done.',
  })
  return id
}

async function viewOf(id: string) {
  const listing = await listTicketRecords(project)
  return await toTicketView(project, await readTicket(project, id), buildLookup(listing))
}

describe('a completion on the board', () => {
  it('shows a recorded decision as it was recorded', async () => {
    const view = await viewOf(await doneByAgent())

    expect(view.completionUnattributed).toBe(false)
    expect(view.completion?.recordedBy).toBe('agent')
  })

  it('does not repeat a block edited to claim a direct action by an agent', async () => {
    const id = await doneByAgent()
    const path = reservedPaths.ticketFile(project.root, id)
    const raw = await readFile(path, 'utf8')
    await writeFile(
      path,
      raw.replace(/decision_source: \S+/, 'decision_source: direct_user_action'),
      'utf8',
    )

    const view = await viewOf(id)
    expect(view.completionUnattributed).toBe(true)
    // "Accepted by you" is drawn from this; a forged claim must not reach it.
    expect(view.completion).toBeNull()
  })
})
