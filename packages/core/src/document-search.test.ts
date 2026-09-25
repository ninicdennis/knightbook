import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { searchDocuments } from './document-search.js'
import { includeDocuments } from './documents.js'
import { withFixtureProject } from './fixture-project.js'
import type { Project } from './project.js'
import { searchProject } from './search.js'

/**
 * The board's document search. It shares its scan with `searchProject`, so the
 * last case checks the two agree on what they found, not only that each works.
 */

async function seed(project: Project): Promise<Project> {
  await mkdir(join(project.root.path, 'docs'), { recursive: true })
  await writeFile(
    join(project.root.path, 'docs', 'architecture.md'),
    '# Architecture\n\nThe parser   owns\nrecord validation.\n',
  )
  await writeFile(join(project.root.path, 'docs', 'parser-notes.md'), '# Notes\n\nNothing here.\n')
  await writeFile(join(project.root.path, 'docs', 'other.md'), '# Other\n\nUnrelated.\n')
  return await includeDocuments(project, ['docs'])
}

function marked(text: string, highlights: { start: number; length: number }[]): string[] {
  return highlights.map((range) => text.slice(range.start, range.start + range.length))
}

describe('searching documents', () => {
  it('returns nothing for an empty query rather than everything', async () => {
    await withFixtureProject(async (project) => {
      const included = await seed(project)
      expect(await searchDocuments(included, '  ')).toEqual({
        hits: [],
        totalMatches: 0,
        unreadable: [],
      })
    })
  })

  it('finds content with an excerpt whose highlights mark the query', async () => {
    await withFixtureProject(async (project) => {
      const included = await seed(project)
      const result = await searchDocuments(included, 'OWNS record')

      expect(result.hits.map((hit) => hit.path)).toEqual(['docs/architecture.md'])
      const [hit] = result.hits
      // Whitespace is collapsed in both the excerpt and the match.
      expect(hit!.excerpt).toContain('The parser owns record validation.')
      expect(marked(hit!.excerpt!, hit!.excerptHighlights)).toEqual(['owns record'])
    })
  })

  it('ranks title matches before content-only ones', async () => {
    await withFixtureProject(async (project) => {
      const included = await seed(project)
      const result = await searchDocuments(included, 'parser')

      expect(result.hits.map((hit) => hit.path)).toEqual([
        'docs/parser-notes.md',
        'docs/architecture.md',
      ])
      expect(result.hits[0]!.titleHighlights).not.toEqual([])
      expect(result.hits[0]!.excerpt).toBeNull()
    })
  })

  it('applies its own limit and still counts every match', async () => {
    await withFixtureProject(async (project) => {
      const included = await seed(project)
      const result = await searchDocuments(included, 'e', { limit: 1 })
      expect(result.hits).toHaveLength(1)
      expect(result.totalMatches).toBe(3)
    })
  })

  it('finds the same documents as the agent search it shares a scan with', async () => {
    await withFixtureProject(async (project) => {
      const included = await seed(project)
      const board = (await searchDocuments(included, 'parser')).hits.map((hit) => hit.path)
      const agent = (await searchProject(included, 'parser')).hits
        .filter((hit) => hit.kind === 'document')
        .map((hit) => hit.reference)
      expect([...board].sort()).toEqual([...agent].sort())
    })
  })
})
