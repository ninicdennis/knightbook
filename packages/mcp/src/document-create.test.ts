import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initializeProject } from '@knightbook/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/server'
import { registerDocumentTools } from './document-tools.js'
import type { ToolResult } from './result.js'
import { createScope } from './scope.js'

/**
 * Validation scenario step 1 through MCP alone: an AI with no file tools of its
 * own captures a specification as a document, finds it listed, and can edit it.
 */

type Handler = (input: Record<string, unknown>) => Promise<ToolResult>

let workspace: string
let root: string
let tools: Map<string, Handler>

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'knightbook-document-create-'))
  const project = await initializeProject(join(workspace, 'project'), { name: 'Docs' })
  root = project.root.path
  tools = new Map()
  const recorder = {
    registerTool: (name: string, _config: unknown, handler: Handler) =>
      void tools.set(name, handler),
  } as unknown as McpServer
  registerDocumentTools(
    recorder,
    createScope({ kind: 'single', root }, () => undefined),
  )
})

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true })
})

async function call(name: string, input: Record<string, unknown>) {
  return await tools.get(name)!(input)
}

function parsed(result: ToolResult) {
  return JSON.parse(result.content[0]?.text ?? '') as Record<string, any>
}

describe('document_create', () => {
  it('creates, lists, and hands back a revision that document_write accepts', async () => {
    const created = parsed(
      await call('document_create', { path: 'specs/idea.md', content: '# Idea\n' }),
    )
    expect(created).toMatchObject({ path: 'specs/idea.md', included_via: 'specs/idea.md' })

    const listed = parsed(await call('documents_list', {}))
    expect(listed['documents'].map((d: { path: string }) => d.path)).toEqual(['specs/idea.md'])

    const written = await call('document_write', {
      path: 'specs/idea.md',
      content: '# Idea\n\nRefined.\n',
      expected_revision: created['revision'],
    })
    expect(written.isError).toBeFalsy()
    expect(await readFile(join(root, 'specs', 'idea.md'), 'utf8')).toBe('# Idea\n\nRefined.\n')
  })

  it('says already_exists instead of overwriting', async () => {
    await call('document_create', { path: 'idea.md', content: 'First.\n' })

    const again = await call('document_create', { path: 'idea.md', content: 'Second.\n' })

    expect(again.isError).toBe(true)
    expect(again.content[0]?.text).toMatch(/^already_exists:/)
    expect(await readFile(join(root, 'idea.md'), 'utf8')).toBe('First.\n')
  })
})
