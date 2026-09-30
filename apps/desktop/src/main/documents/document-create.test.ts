// @vitest-environment node
import { initializeProject, isProjectError, openProject, type Project } from '@knightbook/core'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, dialog: {}, shell: {} }))

const { createInProject } = await import('./document-create-ipc.js')

/**
 * Creating a document from the app (ticket 6f8476ef), on real files. The rules
 * are core's, shared with MCP's document_create; this pins what the app hands
 * back and the message a name clash gets.
 */

let sandbox: string
let project: Project

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'knightbook-document-create-'))
  project = await initializeProject(join(sandbox, 'project'), { name: 'Fixture' })
})

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true })
})

async function refusal(path: string) {
  try {
    await createInProject(project.root.path, path, '# X\n')
  } catch (error) {
    if (isProjectError(error)) return error
    throw error
  }
  throw new Error('expected a refusal')
}

describe('creating a document from the app', () => {
  it('writes the file exactly, includes it, and returns the new listing', async () => {
    const created = await createInProject(project.root.path, 'docs/notes.md', '# Notes\n')

    expect(created.path).toBe('docs/notes.md')
    expect(created.documents.documents.map((document) => document.path)).toContain('docs/notes.md')
    expect(await readFile(join(project.root.path, 'docs', 'notes.md'), 'utf8')).toBe('# Notes\n')
    expect((await openProject(project.root.path)).frontmatter.documents_include).toContain(
      'docs/notes.md',
    )
  })

  it('never overwrites a file, and says so by the name the person chose', async () => {
    await mkdir(join(project.root.path, 'docs'), { recursive: true })
    await writeFile(join(project.root.path, 'docs', 'notes.md'), 'mine\n')

    const error = await refusal('docs/notes.md')

    expect(error.code).toBe('already_exists')
    expect(error.message).toBe(
      'docs/notes.md already exists, so nothing was written. Choose another name.',
    )
    expect(await readFile(join(project.root.path, 'docs', 'notes.md'), 'utf8')).toBe('mine\n')
    expect((await openProject(project.root.path)).frontmatter.documents_include).toEqual([])
  })

  it('refuses a path outside the project or inside its records', async () => {
    expect((await refusal('../outside.md')).code).toBe('outside_project')
    expect((await refusal('.projectspace/notes.md')).code).toBe('outside_project')
  })

  it('refuses a file that is not Markdown', async () => {
    expect((await refusal('docs/notes.txt')).code).toBe('invalid_path')
  })
})
