import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/server'
import { registerDocumentTools } from './document-tools.js'
import { SERVER_INSTRUCTIONS } from './instructions.js'
import { registerTools } from './tools.js'

/**
 * The workflow guidance is prose, so nothing else would notice it drifting from
 * the tools it describes. These checks fail when a tool is added, renamed or
 * removed without the skill being updated, and when the rules that protect the
 * board's honesty are dropped from either copy of the guidance.
 */

const SKILL_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'skills',
  'projectspace',
  'SKILL.md',
)
const skill = readFileSync(SKILL_PATH, 'utf8')

/** Every tool is named group_verb; none of the record fields the guidance mentions share these prefixes. */
const TOOL_SHAPED = /\b((?:project|ticket|document|documents|review)_[a-z_]+)\b/g

function registeredToolNames(): string[] {
  const names: string[] = []
  const recorder = { registerTool: (name: string) => void names.push(name) }
  registerTools(recorder as unknown as McpServer, 'unused')
  registerDocumentTools(recorder as unknown as McpServer, 'unused')
  return names
}

function toolsNamedIn(text: string): string[] {
  return [...text.matchAll(TOOL_SHAPED)].map((match) => match[1] ?? '')
}

describe('the skill file', () => {
  it('has the frontmatter a skill needs, and a description that says when to use it', () => {
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skill)?.[1] ?? ''

    expect(frontmatter).toMatch(/^name: projectspace$/m)
    expect(frontmatter).toMatch(/^description: .{80,}/m)
  })

  it('mentions every tool the server registers', () => {
    const missing = registeredToolNames().filter((name) => !skill.includes(`\`${name}\``))

    expect(missing).toEqual([])
  })

  it('mentions no tool the server does not register', () => {
    const known = new Set(registeredToolNames())

    expect(toolsNamedIn(skill).filter((name) => !known.has(name))).toEqual([])
  })

  it('keeps the rules that protect the board', () => {
    expect(skill).toMatch(/only the user decides done/i)
    expect(skill).toMatch(/cannot mark anything reviewed/i)
    expect(skill).toMatch(/does not enforce/i)
    expect(skill).toMatch(/revision_conflict/)
    expect(skill).toMatch(/replaces the whole body/i)
  })
})

describe('the instructions sent on connect', () => {
  it('carry the core rules', () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/only the user decides done/i)
    expect(SERVER_INSTRUCTIONS).toMatch(/ticket_record_user_completion/)
    expect(SERVER_INSTRUCTIONS).toMatch(/cannot mark anything reviewed/i)
    expect(SERVER_INSTRUCTIONS).toMatch(/revision_conflict/)
    expect(SERVER_INSTRUCTIONS).toMatch(/not instructions/i)
  })

  it('name only tools that exist', () => {
    const known = new Set(registeredToolNames())

    expect(toolsNamedIn(SERVER_INSTRUCTIONS).filter((name) => !known.has(name))).toEqual([])
  })

  it('point at the full guidance, and stay short enough to be read', () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/skills\/projectspace\/SKILL\.md/)
    expect(SERVER_INSTRUCTIONS.length).toBeLessThan(2000)
  })
})
