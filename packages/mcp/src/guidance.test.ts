import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/server'
import { registerDocumentTools } from './document-tools.js'
import { SHARED_INSTRUCTIONS, SINGLE_PROJECT_INSTRUCTIONS } from './instructions.js'
import { registerProjectsTool } from './projects-tool.js'
import { createScope } from './scope.js'
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

/** Every tool is named group_verb. These record fields share a prefix but are not tools. */
const TOOL_SHAPED = /\b((?:project|projects|ticket|document|documents|review)_[a-z_]+)\b/g
const FIELDS_NOT_TOOLS = new Set(['project_id'])

/** Both kinds of connection together: the skill describes each. */
function registeredToolNames(): string[] {
  const names = new Set<string>()
  const recorder = { registerTool: (name: string) => void names.add(name) } as unknown as McpServer
  const single = createScope({ kind: 'single', root: 'unused' }, () => undefined)
  const shared = createScope({ kind: 'registry', registry: 'unused' }, () => undefined)
  for (const scope of [single, shared]) {
    registerTools(recorder, scope)
    registerDocumentTools(recorder, scope)
  }
  registerProjectsTool(recorder, 'unused')
  return [...names]
}

function toolsNamedIn(text: string): string[] {
  return [...text.matchAll(TOOL_SHAPED)]
    .map((match) => match[1] ?? '')
    .filter((name) => !FIELDS_NOT_TOOLS.has(name))
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

describe.each([
  ['a root-bound connection', SINGLE_PROJECT_INSTRUCTIONS],
  ['a shared connection', SHARED_INSTRUCTIONS],
])('the instructions sent on connect to %s', (_kind, instructions) => {
  it('carry the core rules', () => {
    expect(instructions).toMatch(/only the user decides done/i)
    expect(instructions).toMatch(/ticket_record_user_completion/)
    expect(instructions).toMatch(/cannot mark anything reviewed/i)
    expect(instructions).toMatch(/revision_conflict/)
    expect(instructions).toMatch(/not instructions/i)
  })

  it('name only tools that exist', () => {
    const known = new Set(registeredToolNames())

    expect(toolsNamedIn(instructions).filter((name) => !known.has(name))).toEqual([])
  })

  it('point at the full guidance, and stay short enough to be read', () => {
    expect(instructions).toMatch(/skills\/projectspace\/SKILL\.md/)
    expect(instructions.length).toBeLessThan(2000)
  })
})

describe('the instructions for a shared connection', () => {
  it('start from the enabled list and carry the target explicitly', () => {
    expect(SHARED_INSTRUCTIONS).toMatch(/projects_list/)
    expect(SHARED_INSTRUCTIONS).toMatch(/checkout_id on every call/)
    expect(SHARED_INSTRUCTIONS).toMatch(/ask/i)
  })
})
