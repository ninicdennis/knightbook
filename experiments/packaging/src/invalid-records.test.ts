import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { call, callExpectingError, connect } from './client.js'
import { removeWorkspace, stageResources, type StagedResources } from './stage.js'

/**
 * One malformed ticket used to make every ticket tool fail, so an AI could see
 * nothing at all. Driven through the packaged server over stdio, because that is
 * the path an AI tool actually takes.
 */

let workspace: string
let resources: StagedResources
let projectRoot: string
let goodId: string
let badId: string
let badFile: string
let badContent: string

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'knightbook-invalid-'))
  resources = await stageResources(join(workspace, 'resources'))
  projectRoot = join(workspace, 'project')

  const connection = await connect(resources, projectRoot, workspace)
  try {
    await call(connection, 'project_initialize', { name: 'Invalid records' })
    goodId = (await call(connection, 'ticket_create', { title: 'A fine ticket' }))['id'] as string
    badId = (await call(connection, 'ticket_create', { title: 'About to break' }))['id'] as string
  } finally {
    await connection.close()
  }

  // What a bad merge leaves behind.
  badFile = join(projectRoot, '.projectspace', 'tickets', `${badId}.md`)
  const original = await readFile(badFile, 'utf8')
  badContent =
    original.replace('title:', '<<<<<<< HEAD\ntitle:').replace('status:', '=======\nstatus:') +
    '\n>>>>>>> other\n'
  await writeFile(badFile, badContent, 'utf8')
})

afterAll(async () => {
  await removeWorkspace(workspace)
})

describe('a project with one unreadable ticket', () => {
  it('ticket_list returns the good tickets and names the bad file and why', async () => {
    const connection = await connect(resources, projectRoot, workspace)
    try {
      const listing = await call(connection, 'ticket_list')
      const tickets = listing['tickets'] as Array<Record<string, unknown>>
      const problems = listing['problems'] as Array<Record<string, unknown>>

      expect(tickets.map((t) => t['id'])).toEqual([goodId])
      expect(problems).toHaveLength(1)
      expect(problems[0]?.['file']).toBe(`.projectspace/tickets/${badId}.md`)
      expect(String(problems[0]?.['reason'])).toMatch(/merge conflict markers/i)
    } finally {
      await connection.close()
    }
  })

  it('project_get says how many files could not be read instead of counting them as nothing', async () => {
    const connection = await connect(resources, projectRoot, workspace)
    try {
      const project = await call(connection, 'project_get')

      expect(project['initialized']).toBe(true)
      expect((project['ticket_counts'] as Record<string, number>)['backlog']).toBe(1)
      expect(project['ticket_problems']).toHaveLength(1)
    } finally {
      await connection.close()
    }
  })

  it('ticket_next offers the good ticket and still reports the bad file', async () => {
    const connection = await connect(resources, projectRoot, workspace)
    try {
      const next = await call(connection, 'ticket_next')

      expect((next['next'] as Record<string, unknown>)['id']).toBe(goodId)
      expect(next['problems']).toHaveLength(1)
    } finally {
      await connection.close()
    }
  })

  it('refuses to write to the bad ticket and leaves its bytes alone', async () => {
    const connection = await connect(resources, projectRoot, workspace)
    try {
      const message = await callExpectingError(connection, 'ticket_update', {
        id: badId,
        expected_revision: 'anything',
        title: 'Rewritten by a tool',
      })

      expect(message).toContain('invalid_record')
      expect(await readFile(badFile, 'utf8')).toBe(badContent)
    } finally {
      await connection.close()
    }
  })

  it('the good ticket is still fully usable', async () => {
    const connection = await connect(resources, projectRoot, workspace)
    try {
      const ticket = await call(connection, 'ticket_read', { id: goodId })
      const moved = await call(connection, 'ticket_update', {
        id: goodId,
        expected_revision: ticket['revision'],
        status: 'in_progress',
      })

      expect(moved['status']).toBe('in_progress')
    } finally {
      await connection.close()
    }
  })
})
