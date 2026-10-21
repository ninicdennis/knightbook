import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  includeDocuments,
  includePickedPaths,
  listIncludedDocuments,
  readDocument,
  removeFromWorkspace,
  writeDocument,
} from './documents.js'
import { searchProject } from '../search/search.js'
import { createTicket } from '../tickets/tickets.js'
import { withFixtureProject } from '../test/fixture-project.js'
import type { Project } from '../records/project.js'

/**
 * Decision D-011 and validation scenario 15: including a document must not move,
 * copy, or rewrite it, and removing it from the workspace must leave the file
 * alone.
 */

const README = '# Existing app\n\nThis file was here before the project was.\n'
const ARCHITECTURE = '# Architecture\n\nThe parser owns record validation.\n'

async function seedRepository(project: Project): Promise<void> {
  await writeFile(join(project.root.path, 'README.md'), README, 'utf8')
  await mkdir(join(project.root.path, 'docs', 'deep'), { recursive: true })
  await writeFile(join(project.root.path, 'docs', 'architecture.md'), ARCHITECTURE, 'utf8')
  await writeFile(join(project.root.path, 'docs', 'deep', 'notes.md'), '# Notes\n', 'utf8')
  await writeFile(join(project.root.path, 'docs', 'logo.png'), 'not markdown', 'utf8')
}

describe('including existing documents in place', () => {
  it('registers a file without touching its bytes', async () => {
    await withFixtureProject(async (project) => {
      await seedRepository(project)
      const updated = await includeDocuments(project, ['README.md'])

      expect(updated.frontmatter.documents_include).toEqual(['README.md'])
      expect(await readFile(join(project.root.path, 'README.md'), 'utf8')).toBe(README)
    })
  })

  it('expands a folder to the Markdown inside it, ignoring other files', async () => {
    await withFixtureProject(async (project) => {
      await seedRepository(project)
      const updated = await includeDocuments(project, ['docs'])
      const { documents, problems } = await listIncludedDocuments(updated)

      expect(problems).toEqual([])
      expect(documents.map((d) => d.path)).toEqual(['docs/architecture.md', 'docs/deep/notes.md'])
      expect(documents.every((d) => d.includedVia === 'docs')).toBe(true)
    })
  })

  it('stores forward-slash relative paths so another checkout resolves them', async () => {
    await withFixtureProject(async (project) => {
      await seedRepository(project)
      const updated = await includeDocuments(project, ['docs/architecture.md'])
      expect(updated.frontmatter.documents_include).toEqual(['docs/architecture.md'])
    })
  })

  it('is idempotent, so an interrupted call can simply be retried', async () => {
    await withFixtureProject(async (project) => {
      await seedRepository(project)
      const once = await includeDocuments(project, ['README.md'])
      const twice = await includeDocuments(once, ['README.md', 'README.md'])
      expect(twice.frontmatter.documents_include).toEqual(['README.md'])
    })
  })

  it('refuses a path outside the project', async () => {
    await withFixtureProject(async (project) => {
      const error = await includeDocuments(project, ['../elsewhere.md']).catch((e) => e)
      expect(error.code).toBe('outside_project')
    })
  })

  it('refuses to include the app’s own reserved folder', async () => {
    await withFixtureProject(async (project) => {
      const error = await includeDocuments(project, ['.projectspace']).catch((e) => e)
      expect(error.code).toBe('outside_project')
    })
  })

  // The app's file picker hands back absolute paths, which `includeDocuments` refuses.
  it('includes a folder and a file picked as absolute paths', async () => {
    await withFixtureProject(async (project) => {
      await seedRepository(project)
      const updated = await includePickedPaths(project, [
        join(project.root.path, 'docs'),
        join(project.root.path, 'README.md'),
      ])
      expect(updated.frontmatter.documents_include).toEqual(['docs', 'README.md'])
    })
  })

  it('refuses a picked absolute path outside the project and stores nothing', async () => {
    await withFixtureProject(async (project) => {
      await seedRepository(project)
      const outside = join(dirname(project.root.path), 'elsewhere.md')
      const error = await includePickedPaths(project, [
        join(project.root.path, 'README.md'),
        outside,
      ]).catch((e) => e)
      expect(error.code).toBe('outside_project')
      expect(project.frontmatter.documents_include).toEqual([])
    })
  })

  it('reports a missing source without deleting the manifest entry', async () => {
    await withFixtureProject(async (project) => {
      await seedRepository(project)
      const updated = await includeDocuments(project, ['README.md'])
      const { rm } = await import('node:fs/promises')
      await rm(join(project.root.path, 'README.md'))

      const { documents, problems } = await listIncludedDocuments(updated)
      expect(documents).toEqual([])
      expect(problems).toEqual([{ path: 'README.md', reason: 'missing' }])
      expect(updated.frontmatter.documents_include).toEqual(['README.md'])
    })
  })

  it('leaves the source file intact when removed from the workspace', async () => {
    await withFixtureProject(async (project) => {
      await seedRepository(project)
      const included = await includeDocuments(project, ['README.md'])
      const removed = await removeFromWorkspace(included, 'README.md')

      expect(removed.frontmatter.documents_include).toEqual([])
      expect(await readFile(join(project.root.path, 'README.md'), 'utf8')).toBe(README)
    })
  })
})

describe('editing an included document', () => {
  it('writes to the original location and detects a stale write', async () => {
    await withFixtureProject(async (project) => {
      await seedRepository(project)
      const included = await includeDocuments(project, ['README.md'])

      const before = await readDocument(included, 'README.md')
      const after = await writeDocument(
        included,
        'README.md',
        `${README}\nAdded by the app.\n`,
        before.revision,
      )

      expect(await readFile(join(project.root.path, 'README.md'), 'utf8')).toContain(
        'Added by the app.',
      )

      const conflict = await writeDocument(
        included,
        'README.md',
        'clobbered',
        before.revision,
      ).catch((e) => e)
      expect(conflict.code).toBe('revision_conflict')
      expect(after.revision).not.toBe(before.revision)
    })
  })
})

describe('finding project content', () => {
  it('matches documents and tickets, with a line and a snippet', async () => {
    await withFixtureProject(async (project) => {
      await seedRepository(project)
      const included = await includeDocuments(project, ['docs'])
      await createTicket(included, {
        title: 'Validate records',
        body: '# Validate records\n\nThe parser rejects unknown schema versions.\n',
      })

      const result = await searchProject(included, 'parser')
      expect(result.unreadable).toEqual([])

      const kinds = result.hits.map((h) => h.kind).sort()
      expect(kinds).toEqual(['document', 'ticket'])

      const document = result.hits.find((h) => h.kind === 'document')
      expect(document?.reference).toBe('docs/architecture.md')
      expect(document?.snippet).toContain('parser owns record validation')
      expect(document?.line).toBe(3)
    })
  })

  it('returns nothing for an empty query rather than everything', async () => {
    await withFixtureProject(async (project) => {
      await seedRepository(project)
      const included = await includeDocuments(project, ['docs'])
      expect((await searchProject(included, '   ')).hits).toEqual([])
    })
  })

  it('matches a title even when the body does not contain the term', async () => {
    await withFixtureProject(async (project) => {
      await seedRepository(project)
      const included = await includeDocuments(project, ['docs'])

      const result = await searchProject(included, 'architecture')
      expect(result.hits.some((h) => h.reference === 'docs/architecture.md')).toBe(true)
    })
  })
})
