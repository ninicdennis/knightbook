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
 * A ticket's related documents are the context an AI is told to read before
 * working it. They were written at creation and then invisible through MCP, so
 * these pin down that they can be read back and corrected.
 */

type Handler = (input: Record<string, unknown>) => Promise<ToolResult>

let workspace: string
let tools: Map<string, Handler>

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'knightbook-related-'))
  const project = await initializeProject(join(workspace, 'project'), { name: 'Related' })
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

async function created(relatedDocuments: string[]) {
  const { id } = await call('ticket_create', {
    title: 'Linked',
    related_documents: relatedDocuments,
  })
  return String(id)
}

describe('related documents through MCP', () => {
  it('are returned by ticket_read', async () => {
    const id = await created(['docs/spec.md', 'README.md'])

    expect((await call('ticket_read', { id })).related_documents).toEqual([
      'docs/spec.md',
      'README.md',
    ])
  })

  it('are returned on every ticket_list row', async () => {
    await created(['docs/spec.md'])

    const { tickets } = (await call('ticket_list', {})) as {
      tickets: Array<{ related_documents: string[] }>
    }
    expect(tickets[0]?.related_documents).toEqual(['docs/spec.md'])
  })

  it('can be replaced, and cleared, by ticket_update', async () => {
    const id = await created(['docs/old.md'])
    let { revision } = await call('ticket_read', { id })

    ;({ revision } = await call('ticket_update', {
      id,
      expected_revision: revision,
      related_documents: ['docs/new.md'],
    }))
    expect((await call('ticket_read', { id })).related_documents).toEqual(['docs/new.md'])

    await call('ticket_update', { id, expected_revision: revision, related_documents: [] })
    expect((await call('ticket_read', { id })).related_documents).toEqual([])
  })

  it('are kept when ticket_update leaves them out', async () => {
    const id = await created(['docs/spec.md'])
    const { revision } = await call('ticket_read', { id })

    await call('ticket_update', { id, expected_revision: revision, title: 'Renamed' })

    const read = await call('ticket_read', { id })
    expect(read.title).toBe('Renamed')
    expect(read.related_documents).toEqual(['docs/spec.md'])
  })
})
