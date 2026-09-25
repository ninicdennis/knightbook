import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initializeProject } from '@knightbook/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/server'
import { registerPlanTools } from './plan-tools.js'
import type { ToolResult } from './result.js'
import { createScope } from './scope.js'
import { registerTools } from './tools.js'

/**
 * The round trip an external AI takes to develop a plan: create it from a
 * title, break it into phases, attach tickets, and read progress back. What
 * matters most is what attaching must not do, and that a stale write is refused.
 */

type Handler = (input: Record<string, unknown>) => Promise<ToolResult>

let workspace: string
let tools: Map<string, Handler>

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'knightbook-plans-'))
  const project = await initializeProject(join(workspace, 'project'), { name: 'Plans' })
  tools = new Map()
  const recorder = {
    registerTool: (name: string, _config: unknown, handler: Handler) =>
      void tools.set(name, handler),
  } as unknown as McpServer
  const scope = createScope({ kind: 'single', root: project.root.path }, () => undefined)
  registerTools(recorder, scope)
  registerPlanTools(recorder, scope)
})

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true })
})

async function call(name: string, input: Record<string, unknown>) {
  const result = await tools.get(name)!(input)
  const text = result.content[0]?.text ?? ''
  if (result.isError) throw new Error(text)
  return JSON.parse(text) as Record<string, any>
}

describe('developing a plan through MCP', () => {
  it('creates, phases, attaches, and reports progress, without touching the tickets', async () => {
    const ticket = await call('ticket_create', { title: 'Build it' })
    const before = await call('ticket_read', { id: ticket['id'] })

    const plan = await call('plan_create', { title: 'MVP', body: '# MVP\n\nIdeas.\n' })
    expect(plan['progress'].state).toBe('empty')

    const phased = await call('plan_update', {
      id: plan['id'],
      expected_revision: plan['revision'],
      phases: [
        { title: 'Foundation', value: 'Everything rests on it.', tickets: [ticket['id']] },
        { title: 'Later' },
      ],
    })
    expect(phased['phases'].map((phase: { id: string }) => phase.id)).toEqual(['p1', 'p2'])
    expect(phased['phases'][0].tickets).toEqual([
      { id: ticket['id'], title: 'Build it', status: 'backlog' },
    ])
    expect(phased['progress']).toMatchObject({ total: 1, state: 'in_progress' })
    expect(phased['body']).toBe('# MVP\n\nIdeas.\n')

    const after = await call('ticket_read', { id: ticket['id'] })
    expect(after['revision']).toBe(before['revision'])

    const listed = await call('plan_list', {})
    expect(listed['plans'].map((p: { title: string }) => p.title)).toEqual(['MVP'])
  })

  it('refuses a stale plan_update with a revision conflict', async () => {
    const plan = await call('plan_create', { title: 'MVP' })
    await call('plan_update', { id: plan['id'], expected_revision: plan['revision'], title: 'v2' })

    await expect(
      call('plan_update', { id: plan['id'], expected_revision: plan['revision'], title: 'v3' }),
    ).rejects.toThrow(/revision_conflict/)
  })

  it('shows a reference to a ticket that does not exist, and does not count it as done', async () => {
    const missing = '99999999-9999-4999-8999-999999999999'
    const plan = await call('plan_create', {
      title: 'MVP',
      phases: [{ title: 'One', tickets: [missing] }],
    })

    expect(plan['phases'][0].tickets).toEqual([{ id: missing, problem: 'missing' }])
    expect(plan['progress']).toMatchObject({ total: 1, missing: [missing], state: 'in_progress' })
  })
})
