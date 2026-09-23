import { readFile, writeFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { isUnattributedCompletion, recordUserCompletion } from './completion.js'
import { withFixtureProject } from './fixture-project.js'
import { reservedPaths } from './paths.js'
import type { Project } from './project.js'
import { createTicket, readTicket, updateTicket, type Ticket } from './tickets.js'

/**
 * Which hand-edited completion blocks can be told apart from recorded decisions.
 * The write path only ever produces two source and writer pairs; these edit a
 * real ticket file into each of the four and check what is reported.
 */

async function completed(project: Project, recordedBy: 'user' | 'agent'): Promise<Ticket> {
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
  return await recordUserCompletion(project, id, {
    expectedRevision: verifying.revision,
    recordedBy,
    userInstructedCompletion: true,
    instruction: 'The user said it is done.',
  })
}

/** Rewrites the two provenance fields in the file, as an editor would. */
async function editProvenance(
  project: Project,
  ticket: Ticket,
  source: string,
  recordedBy: string,
): Promise<Ticket> {
  const path = reservedPaths.ticketFile(project.root, ticket.frontmatter.id)
  const raw = await readFile(path, 'utf8')
  const edited = raw
    .replace(/decision_source: \S+/, `decision_source: ${source}`)
    .replace(/recorded_by: \S+/, `recorded_by: ${recordedBy}`)
  expect(edited).not.toBe(raw)
  await writeFile(path, edited, 'utf8')
  return await readTicket(project, ticket.frontmatter.id)
}

describe('attributing a completion', () => {
  it('trusts both shapes the write path produces', async () => {
    await withFixtureProject(async (project) => {
      expect(isUnattributedCompletion(await completed(project, 'user'))).toBe(false)
      expect(isUnattributedCompletion(await completed(project, 'agent'))).toBe(false)
    })
  })

  it('flags a direct user action recorded by an agent', async () => {
    await withFixtureProject(async (project) => {
      const forged = await editProvenance(
        project,
        await completed(project, 'agent'),
        'direct_user_action',
        'agent',
      )
      expect(isUnattributedCompletion(forged)).toBe(true)
    })
  })

  it('flags a reported instruction recorded by the user', async () => {
    await withFixtureProject(async (project) => {
      const forged = await editProvenance(
        project,
        await completed(project, 'user'),
        'reported_user_instruction',
        'user',
      )
      expect(isUnattributedCompletion(forged)).toBe(true)
    })
  })

  it('cannot tell an edit into a producible shape from the real thing, by design', async () => {
    await withFixtureProject(async (project) => {
      // An agent's completion rewritten wholesale as the user's own. See the
      // docblock on isUnattributedCompletion for why this is not chased further.
      const rewritten = await editProvenance(
        project,
        await completed(project, 'agent'),
        'direct_user_action',
        'user',
      )
      expect(isUnattributedCompletion(rewritten)).toBe(false)
    })
  })
})
