import { describe, expect, it } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/server'
import type { z } from 'zod'
import { registerTools } from './tools.js'

/**
 * The MCP surface for the optional work type. The desktop window and this server
 * both go through the same core library, so what has to be checked here is that
 * the tool inputs agree with it: the same three words, untyped still allowed, and
 * clearing expressed as an explicit null rather than an omission.
 */

type AnySchema = z.ZodType<unknown>

function inputSchemaOf(tool: string): AnySchema {
  const schemas = new Map<string, AnySchema>()
  const recorder = {
    registerTool: (name: string, config: { inputSchema: AnySchema }) =>
      void schemas.set(name, config.inputSchema),
  }
  registerTools(recorder as unknown as McpServer, 'unused')

  const schema = schemas.get(tool)
  if (!schema) throw new Error(`${tool} is not registered.`)
  return schema
}

describe('ticket_create', () => {
  const schema = inputSchemaOf('ticket_create')

  it('accepts each of the three types', () => {
    for (const type of ['feature', 'bug', 'task']) {
      expect(schema.safeParse({ title: 'A', type }).success).toBe(true)
    }
  })

  it('accepts a ticket with no type, because untyped is a real state', () => {
    expect(schema.safeParse({ title: 'A' }).success).toBe(true)
  })

  it('refuses a word that is not one of the three', () => {
    const result = schema.safeParse({ title: 'A', type: 'chore' })

    expect(result.success).toBe(false)
    // The error has to say what was allowed, or a caller cannot correct itself.
    expect(JSON.stringify(result.error?.issues)).toMatch(/feature/)
  })

  it('refuses null, which would mean "clear" on a ticket that has nothing to clear', () => {
    expect(schema.safeParse({ title: 'A', type: null }).success).toBe(false)
  })
})

describe('ticket_update', () => {
  const schema = inputSchemaOf('ticket_update')
  const base = { id: '0f9c2b1e-5a7d-4c33-9b21-8e6f4a0d1c77', expected_revision: 'rev-1' }

  it('takes null to clear the type, distinct from leaving it out', () => {
    expect(schema.safeParse({ ...base, type: null }).success).toBe(true)
    expect(schema.safeParse(base).success).toBe(true)
  })

  it('takes each of the three types', () => {
    for (const type of ['feature', 'bug', 'task']) {
      expect(schema.safeParse({ ...base, type }).success).toBe(true)
    }
  })

  it('refuses anything else', () => {
    expect(schema.safeParse({ ...base, type: 'chore' }).success).toBe(false)
    expect(schema.safeParse({ ...base, type: '' }).success).toBe(false)
  })
})
