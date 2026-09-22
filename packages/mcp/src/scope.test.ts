import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { grantCheckoutAccess, initializeProject, revokeCheckoutAccess } from '@knightbook/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/server'
import type { z } from 'zod'
import { registerDocumentTools } from './document-tools.js'
import type { ToolResult } from './result.js'
import { createScope, type ProjectScope } from './scope.js'
import { registerTools } from './tools.js'

/**
 * The tools as a shared connection registers them, called directly. The
 * packaging experiment repeats the important paths through a real stdio process;
 * these pin down the targeting rules quickly and in one place.
 */

type Handler = (input: Record<string, unknown>) => Promise<ToolResult>
interface Registered {
  schema: z.ZodType<unknown>
  handler: Handler
}

function register(scope: ProjectScope): Map<string, Registered> {
  const tools = new Map<string, Registered>()
  const recorder = {
    registerTool: (name: string, config: { inputSchema: z.ZodType<unknown> }, handler: Handler) =>
      void tools.set(name, { schema: config.inputSchema, handler }),
  } as unknown as McpServer
  registerTools(recorder, scope)
  registerDocumentTools(recorder, scope)
  return tools
}

let workspace: string
let registry: string

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'knightbook-scope-'))
  registry = join(workspace, 'app-data', 'mcp-access.json')
})

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true })
})

async function enabledProject(folder: string, name: string) {
  const project = await initializeProject(join(workspace, folder), { name })
  const entry = await grantCheckoutAccess(registry, {
    path: project.root.path,
    projectId: project.frontmatter.id,
    name,
  })
  return { project, checkoutId: entry.checkout_id }
}

async function call(tools: Map<string, Registered>, name: string, input: Record<string, unknown>) {
  const tool = tools.get(name)
  if (!tool) throw new Error(`${name} is not registered`)
  const result = await tool.handler(input)
  const text = result.content[0]?.text ?? ''
  return { isError: result.isError === true, text, json: () => JSON.parse(text) as any }
}

describe('a shared connection', () => {
  const used: string[] = []
  const scope = () =>
    createScope({ kind: 'registry', registry }, (p) => void used.push(p.root.path))

  it('requires checkout_id on every project tool', () => {
    for (const [name, tool] of register(scope())) {
      const parsed = tool.schema.safeParse({})
      const paths = parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join('.'))
      expect(paths, name).toContain('checkout_id')
    }
  })

  it('offers no project_initialize', () => {
    expect(register(scope()).has('project_initialize')).toBe(false)
  })

  it('acts on the checkout named, and says which one it acted on', async () => {
    const alpha = await enabledProject('alpha', 'Alpha')
    const beta = await enabledProject('beta', 'Beta')
    const tools = register(scope())

    const created = await call(tools, 'ticket_create', {
      checkout_id: beta.checkoutId,
      title: 'Only in Beta',
    })
    expect(created.json().project).toMatchObject({
      checkout_id: beta.checkoutId,
      name: 'Beta',
      checkout_path: beta.project.root.path,
    })

    const alphaTickets = await call(tools, 'ticket_list', { checkout_id: alpha.checkoutId })
    const betaTickets = await call(tools, 'ticket_list', { checkout_id: beta.checkoutId })
    expect(alphaTickets.json().tickets).toEqual([])
    expect(betaTickets.json().tickets.map((t: { title: string }) => t.title)).toEqual([
      'Only in Beta',
    ])
    expect(used).toContain(beta.project.root.path)
  })

  it('never falls back to another project for an unknown or revoked id', async () => {
    const alpha = await enabledProject('alpha', 'Alpha')
    const tools = register(scope())

    const unknown = await call(tools, 'project_get', { checkout_id: 'not-a-real-id' })
    expect(unknown.isError).toBe(true)
    expect(unknown.text).toMatch(/^checkout_not_enabled/)

    await call(tools, 'project_get', { checkout_id: alpha.checkoutId })
    await revokeCheckoutAccess(registry, alpha.project.root.path)
    const revoked = await call(tools, 'project_get', { checkout_id: alpha.checkoutId })
    expect(revoked.isError).toBe(true)
    expect(revoked.text).toMatch(/^checkout_not_enabled/)
  })

  it('still checks revisions after resolving the target', async () => {
    const alpha = await enabledProject('alpha', 'Alpha')
    const tools = register(scope())
    const { id } = (
      await call(tools, 'ticket_create', { checkout_id: alpha.checkoutId, title: 'A' })
    ).json()

    const stale = await call(tools, 'ticket_update', {
      checkout_id: alpha.checkoutId,
      id,
      expected_revision: 'stale',
      title: 'B',
    })
    expect(stale.text).toMatch(/^revision_conflict/)
  })
})

describe('a root-bound connection', () => {
  it('keeps its original inputs and responses', async () => {
    const project = await initializeProject(join(workspace, 'solo'), { name: 'Solo' })
    const tools = register(
      createScope({ kind: 'single', root: project.root.path }, () => undefined),
    )

    expect(tools.has('project_initialize')).toBe(true)
    expect(tools.get('ticket_list')!.schema.safeParse({}).success).toBe(true)
    const got = (await call(tools, 'project_get', {})).json()
    expect(got.name).toBe('Solo')
    expect(got.project).toBeUndefined()
  })

  it('ignores a checkout_id rather than letting it choose another project', async () => {
    const solo = await initializeProject(join(workspace, 'solo'), { name: 'Solo' })
    const other = await enabledProject('other', 'Other')
    const tools = register(createScope({ kind: 'single', root: solo.root.path }, () => undefined))

    const got = (await call(tools, 'project_get', { checkout_id: other.checkoutId })).json()
    expect(got.name).toBe('Solo')
  })
})
