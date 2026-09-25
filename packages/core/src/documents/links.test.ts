import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { includeDocuments } from './documents.js'
import { withFixtureProject } from '../test/fixture-project.js'
import { resolveLinkDestination } from './links.js'
import type { Project } from '../records/project.js'
import { createTicket } from '../tickets/tickets.js'

/**
 * Following an in-project link (ticket db7cff48). The host decides what a link
 * reaches from the files on disk, whatever the renderer claimed.
 */

async function withDocs(run: (project: Project) => Promise<void>): Promise<void> {
  await withFixtureProject(async (fixture) => {
    await mkdir(join(fixture.root.path, 'docs'), { recursive: true })
    await writeFile(join(fixture.root.path, 'docs', 'design notes.md'), '# Design\n')
    await writeFile(join(fixture.root.path, 'docs', 'diagram.png'), 'not really a png')
    await writeFile(join(fixture.root.path, 'NOTES.md'), '# Not included\n')
    await run(await includeDocuments(fixture, ['docs']))
  })
}

describe('resolveLinkDestination', () => {
  it('opens an included document, including one with a space in its name', async () => {
    await withDocs(async (project) => {
      expect(await resolveLinkDestination(project, 'docs/design notes.md')).toEqual({
        kind: 'document',
        path: 'docs/design notes.md',
      })
    })
  })

  it('resolves a canonical ticket file to its ticket id', async () => {
    await withDocs(async (project) => {
      const ticket = await createTicket(project, { title: 'Linked' })
      const id = ticket.frontmatter.id
      expect(await resolveLinkDestination(project, `.projectspace/tickets/${id}.md`)).toEqual({
        kind: 'ticket',
        id,
      })
    })
  })

  it('says which ticket is missing', async () => {
    await withDocs(async (project) => {
      const result = await resolveLinkDestination(project, '.projectspace/tickets/nope.md')
      expect(result).toMatchObject({ kind: 'unavailable', reason: 'not_found' })
    })
  })

  it('refuses the app’s other records rather than showing them as documents', async () => {
    await withDocs(async (project) => {
      const result = await resolveLinkDestination(project, '.projectspace/project.md')
      expect(result).toMatchObject({ kind: 'unavailable', reason: 'reserved' })
    })
  })

  it('reports a Markdown file that exists but is not included, and includes nothing', async () => {
    await withDocs(async (project) => {
      const result = await resolveLinkDestination(project, 'NOTES.md')
      expect(result).toMatchObject({ kind: 'unavailable', reason: 'not_included' })
      expect(project.frontmatter.documents_include).toEqual(['docs'])
    })
  })

  it('reports a missing document and a non-Markdown file differently', async () => {
    await withDocs(async (project) => {
      expect(await resolveLinkDestination(project, 'docs/gone.md')).toMatchObject({
        reason: 'not_found',
      })
      expect(await resolveLinkDestination(project, 'docs/diagram.png')).toMatchObject({
        reason: 'not_markdown',
      })
    })
  })

  it('refuses traversal, absolute paths, and Windows separators', async () => {
    await withDocs(async (project) => {
      for (const path of [
        '../outside.md',
        'docs/../../outside.md',
        'C:/x.md',
        'docs\\design notes.md',
      ]) {
        expect(await resolveLinkDestination(project, path), path).toMatchObject({
          reason: 'outside_project',
        })
      }
    })
  })

  it('refuses a symlink that leads out of the project', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'knightbook-outside-'))
    try {
      await writeFile(join(outside, 'secret.md'), '# Secret\n')
      await withDocs(async (project) => {
        try {
          await symlink(outside, join(project.root.path, 'docs', 'escape'), 'junction')
        } catch {
          return // Creating links can need privileges this machine lacks.
        }
        const result = await resolveLinkDestination(project, 'docs/escape/secret.md')
        expect(result).toMatchObject({ kind: 'unavailable', reason: 'outside_project' })
      })
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })
})
