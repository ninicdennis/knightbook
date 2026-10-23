import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initializeProject } from '@knightbook/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/server'
import type { ToolResult } from './result.js'
import { registerRoutineTools } from './routine-tools.js'
import { createScope } from './scope.js'
import { registerTools } from './tools.js'

/**
 * The round trip an external AI or scheduler takes with a routine: create it,
 * read its instructions, start a run, and see that run as an ordinary ticket.
 * A second start while the first is open must be refused, not duplicated.
 */

type Handler = (input: Record<string, unknown>) => Promise<ToolResult>

let workspace: string
let tools: Map<string, Handler>

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'knightbook-routines-'))
  const project = await initializeProject(join(workspace, 'project'), { name: 'Routines' })
  tools = new Map()
  const recorder = {
    registerTool: (name: string, _config: unknown, handler: Handler) =>
      void tools.set(name, handler),
  } as unknown as McpServer
  const scope = createScope({ kind: 'single', root: project.root.path }, () => undefined)
  registerTools(recorder, scope)
  registerRoutineTools(recorder, scope)
})

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true })
})

async function raw(name: string, input: Record<string, unknown>) {
  const result = await tools.get(name)!(input)
  return { error: result.isError === true, text: result.content[0]?.text ?? '' }
}

async function call(name: string, input: Record<string, unknown>) {
  const { error, text } = await raw(name, input)
  if (error) throw new Error(text)
  return JSON.parse(text) as Record<string, any>
}

const INSTRUCTIONS = '# Security check\n\nRun `pnpm audit` weekly and record the findings.\n'

describe('routines through MCP', () => {
  it('lists and reads a routine with its instructions', async () => {
    const created = await call('routine_create', {
      title: 'Security check',
      instructions: INSTRUCTIONS,
    })

    const listed = await call('routine_list', {})
    expect(listed['routines'].map((r: any) => r.title)).toEqual(['Security check'])
    expect(listed['routines'][0].runs).toEqual([])
    expect(listed['routines'][0].last_completed_at).toBeNull()

    const read = await call('routine_read', { id: created['id'] })
    expect(read['instructions']).toBe(INSTRUCTIONS)
    expect(read['revision']).toBe(created['revision'])
  })

  it('starts a run that is an ordinary Backlog ticket pointing back at the routine', async () => {
    const routine = await call('routine_create', {
      title: 'Security check',
      instructions: INSTRUCTIONS,
    })
    const run = await call('routine_start_run', { id: routine['id'] })

    const ticket = await call('ticket_read', { id: run['ticket_id'] })
    expect(ticket['status']).toBe('backlog')
    expect(ticket['routine_id']).toBe(routine['id'])
    expect(ticket['body']).toBe(INSTRUCTIONS)

    const board = await call('ticket_list', {})
    expect(board['tickets'].map((t: any) => t.id)).toContain(run['ticket_id'])

    const read = await call('routine_read', { id: routine['id'] })
    expect(read['runs'].map((r: any) => [r.ticket_id, r.status])).toEqual([
      [run['ticket_id'], 'backlog'],
    ])
    expect(read['open_runs']).toEqual([run['ticket_id']])
  })

  it('refuses a second run while the first is open, and allows a deliberate one', async () => {
    const routine = await call('routine_create', { title: 'Security check' })
    const first = await call('routine_start_run', { id: routine['id'] })

    const refused = await raw('routine_start_run', { id: routine['id'] })
    expect(refused.error).toBe(true)
    expect(refused.text).toMatch(/^run_already_open: /)
    expect(refused.text).toContain(first['ticket_id'])
    expect((await call('ticket_list', {}))['tickets']).toHaveLength(1)

    await call('routine_start_run', { id: routine['id'], another_run: true })
    expect((await call('ticket_list', {}))['tickets']).toHaveLength(2)
  })

  it('refuses a stale routine_update', async () => {
    const routine = await call('routine_create', { title: 'Security check' })
    await call('routine_update', {
      id: routine['id'],
      expected_revision: routine['revision'],
      instructions: '# Security check\n\nMonthly now.\n',
    })
    const stale = await raw('routine_update', {
      id: routine['id'],
      expected_revision: routine['revision'],
      title: 'Overwrite',
    })
    expect(stale.text).toMatch(/^revision_conflict: /)
  })
})
