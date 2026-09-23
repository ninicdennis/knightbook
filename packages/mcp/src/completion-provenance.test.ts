import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initializeProject, reservedPaths, type Project } from '@knightbook/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/server'
import type { ToolResult } from './result.js'
import { createScope } from './scope.js'
import { registerTools } from './tools.js'

/**
 * What an AI is told about a completion block edited outside the app. The board
 * reads the same file the same way (apps/desktop/src/main/ticket-view.test.ts).
 */

type Handler = (input: Record<string, unknown>) => Promise<ToolResult>

let workspace: string
let project: Project
let tools: Map<string, Handler>

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'knightbook-provenance-'))
  project = await initializeProject(join(workspace, 'project'), { name: 'Provenance' })
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
  return JSON.parse(text) as Record<string, any>
}

/** Completes a ticket the way an AI does, then returns its id. */
async function doneByAgent(): Promise<string> {
  const { id } = await call('ticket_create', { title: 'Work' })
  for (const status of ['in_progress', 'verification']) {
    const { revision } = await call('ticket_read', { id })
    await call('ticket_update', { id, expected_revision: revision, status })
  }
  const { revision } = await call('ticket_read', { id })
  await call('ticket_record_user_completion', {
    id,
    expected_revision: revision,
    user_instructed_completion: true,
    instruction: 'The user said it is done.',
  })
  return String(id)
}

describe('completion provenance through MCP', () => {
  it('reports a recorded decision as it was recorded', async () => {
    const read = await call('ticket_read', { id: await doneByAgent() })

    expect(read.completion_unattributed).toBe(false)
    expect(read.completion.decision_source).toBe('reported_user_instruction')
  })

  it('withholds a block edited to claim a direct user action by an agent', async () => {
    const id = await doneByAgent()
    const path = reservedPaths.ticketFile(project.root, id)
    const raw = await readFile(path, 'utf8')
    await writeFile(
      path,
      raw.replace(/decision_source: \S+/, 'decision_source: direct_user_action'),
      'utf8',
    )

    const read = await call('ticket_read', { id })
    const { tickets } = await call('ticket_list', { status: 'done' })
    for (const shown of [read, tickets[0]]) {
      expect(shown.completion_unattributed).toBe(true)
      expect(shown.completion).toBeNull()
    }
  })
})
