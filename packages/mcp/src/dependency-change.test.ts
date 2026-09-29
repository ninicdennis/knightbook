import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initializeProject } from '@knightbook/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/server'
import type { ToolResult } from './result.js'
import { createScope } from './scope.js'
import { registerTools } from './tools.js'

/**
 * Decision D-032 through MCP: ticket_update refuses a dependency change that
 * would add a cycle, the ticket itself or an unknown id, the same way the app
 * does, because both go through core's updateTicket.
 */

type Handler = (input: Record<string, unknown>) => Promise<ToolResult>

let workspace: string
let tools: Map<string, Handler>

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'knightbook-dependency-change-'))
  const project = await initializeProject(join(workspace, 'project'), { name: 'Dependencies' })
  tools = new Map()
  const recorder = {
    registerTool: (name: string, _config: unknown, handler: Handler) =>
      void tools.set(name, handler),
  } as unknown as McpServer
  registerTools(
    recorder,
    createScope({ kind: 'single', root: project.root.path }, () => undefined),
  )
})

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true })
})

async function call(name: string, input: Record<string, unknown>) {
  const result = await tools.get(name)!(input)
  const text = result.content[0]?.text ?? ''
  if (result.isError) throw new Error(text)
  return JSON.parse(text) as Record<string, unknown>
}

describe('ticket_update and prerequisites', () => {
  it('refuses a change that would close a cycle, and writes nothing', async () => {
    const a = String((await call('ticket_create', { title: 'A' })).id)
    const b = String((await call('ticket_create', { title: 'B', depends_on: [a] })).id)
    const { revision } = await call('ticket_read', { id: a })

    await expect(
      call('ticket_update', { id: a, expected_revision: revision, depends_on: [b] }),
    ).rejects.toThrow(/^invalid_dependency: .*"B" already leads back to this ticket/)

    const read = await call('ticket_read', { id: a })
    expect(read.depends_on).toEqual([])
    expect(read.revision).toBe(revision)
  })

  it('still saves an ordinary prerequisite', async () => {
    const a = String((await call('ticket_create', { title: 'A' })).id)
    const b = String((await call('ticket_create', { title: 'B' })).id)
    const { revision } = await call('ticket_read', { id: b })

    await call('ticket_update', { id: b, expected_revision: revision, depends_on: [a] })

    expect((await call('ticket_read', { id: b })).depends_on).toEqual([a])
  })
})
