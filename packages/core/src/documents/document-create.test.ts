import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDocument, includeDocuments, listIncludedDocuments } from './documents.js'
import { withFixtureProject } from '../test/fixture-project.js'
import { openProject } from '../records/project.js'

/**
 * Decision D-023: a document can be created through the same core library the
 * MCP server uses, so a tool with no filesystem access can still add one. It
 * must never overwrite, and it must leave the workspace listing it.
 */

const IDEA = '# Idea\n\nCapture this before it is lost.\n'

describe('creating a document', () => {
  it('writes the content exactly and includes the new file', async () => {
    await withFixtureProject(async (project) => {
      const { project: updated, document } = await createDocument(project, 'idea.md', IDEA)

      expect(await readFile(join(project.root.path, 'idea.md'), 'utf8')).toBe(IDEA)
      expect(document).toMatchObject({ path: 'idea.md', includedVia: 'idea.md' })
      expect(updated.frontmatter.documents_include).toEqual(['idea.md'])
      // The manifest on disk agrees, not only the returned object.
      const reread = await openProject(project.root.path)
      expect(reread.frontmatter.documents_include).toEqual(['idea.md'])
    })
  })

  it('creates the folders of a nested path nobody made yet', async () => {
    await withFixtureProject(async (project) => {
      const { project: updated } = await createDocument(
        project,
        'notes/2026/september/spec.md',
        IDEA,
      )

      const { documents } = await listIncludedDocuments(updated)
      expect(documents.map((d) => d.path)).toEqual(['notes/2026/september/spec.md'])
    })
  })

  it('adds no second entry for a file inside an already-included folder', async () => {
    await withFixtureProject(async (project) => {
      await mkdir(join(project.root.path, 'docs'), { recursive: true })
      const included = await includeDocuments(project, ['docs'])

      const { project: updated, document } = await createDocument(
        included,
        'docs/deep/new.md',
        IDEA,
      )

      expect(document.includedVia).toBe('docs')
      expect(updated.frontmatter.documents_include).toEqual(['docs'])
      const { documents } = await listIncludedDocuments(updated)
      expect(documents.map((d) => d.path)).toEqual(['docs/deep/new.md'])
    })
  })

  it('refuses to overwrite an existing file, leaving its bytes and the manifest alone', async () => {
    await withFixtureProject(async (project) => {
      await writeFile(join(project.root.path, 'README.md'), 'Original.\n', 'utf8')

      const error = await createDocument(project, 'README.md', 'Replaced.\n').catch((e) => e)

      expect(error.code).toBe('already_exists')
      expect(await readFile(join(project.root.path, 'README.md'), 'utf8')).toBe('Original.\n')
      expect((await openProject(project.root.path)).frontmatter.documents_include).toEqual([])
    })
  })

  it('refuses a path that is not Markdown', async () => {
    await withFixtureProject(async (project) => {
      const error = await createDocument(project, 'notes.txt', IDEA).catch((e) => e)
      expect(error.code).toBe('invalid_path')
    })
  })

  it('refuses paths outside the project and inside its reserved folder', async () => {
    await withFixtureProject(async (project) => {
      for (const path of ['../elsewhere.md', '.projectspace/sneaky.md']) {
        const error = await createDocument(project, path, IDEA).catch((e) => e)
        expect(error.code).toBe('outside_project')
      }
    })
  })
})
