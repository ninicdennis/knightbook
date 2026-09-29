// @vitest-environment node
import {
  createTicket,
  initializeProject,
  isProjectError,
  readTicket,
  reservedPaths,
  type Project,
} from '@knightbook/core'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

const { parseLinksEdit, saveTicketLinks } = await import('./ticket-edit-ipc.js')
const { buildView } = await import('../project/project-view.js')

/**
 * Editing a ticket's prerequisites and related documents from the app, against
 * real ticket files. The refusals come from core (D-032), the same as MCP's.
 */

let sandbox: string
let project: Project

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'knightbook-ticket-links-'))
  project = await initializeProject(join(sandbox, 'project'), { name: 'Fixture' })
})

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true })
})

const fileOf = (id: string) => reservedPaths.ticketFile(project.root, id)

async function refusal(id: string, links: { dependsOn: string[]; relatedDocuments: string[] }) {
  const opened = await readTicket(project, id)
  const before = await readFile(fileOf(id), 'utf8')
  const error = await saveTicketLinks(project, id, links, opened.revision).catch(
    (caught: unknown) => caught,
  )
  expect(await readFile(fileOf(id), 'utf8')).toBe(before)
  return error
}

describe('saving prerequisites and related documents', () => {
  it('writes both lists against the revision that was read', async () => {
    const schema = await createTicket(project, { title: 'Schema' })
    const board = await createTicket(project, { title: 'Board' })
    const opened = await readTicket(project, board.frontmatter.id)

    await saveTicketLinks(
      project,
      board.frontmatter.id,
      { dependsOn: [schema.frontmatter.id], relatedDocuments: ['docs/spec.md'] },
      opened.revision,
    )

    const saved = await readTicket(project, board.frontmatter.id)
    expect(saved.frontmatter.depends_on).toEqual([schema.frontmatter.id])
    expect(saved.frontmatter.related_documents).toEqual(['docs/spec.md'])
  })

  it('refuses a prerequisite that would close a cycle, with a plain reason, and writes nothing', async () => {
    const a = await createTicket(project, { title: 'A' })
    const b = await createTicket(project, { title: 'B', dependsOn: [a.frontmatter.id] })

    const error = await refusal(a.frontmatter.id, {
      dependsOn: [b.frontmatter.id],
      relatedDocuments: [],
    })

    expect(isProjectError(error) && error.code).toBe('invalid_dependency')
    expect((error as Error).message).toContain('"B" already leads back to this ticket')
  })

  it('refuses an unknown ticket', async () => {
    const a = await createTicket(project, { title: 'A' })
    const missing = '00000000-0000-4000-8000-000000000000'

    const error = await refusal(a.frontmatter.id, { dependsOn: [missing], relatedDocuments: [] })

    expect(isProjectError(error) && error.code).toBe('invalid_dependency')
  })

  it('refuses a save made on a revision that has since changed', async () => {
    const schema = await createTicket(project, { title: 'Schema' })
    const board = await createTicket(project, { title: 'Board' })
    const stale = (await readTicket(project, board.frontmatter.id)).revision
    await saveTicketLinks(
      project,
      board.frontmatter.id,
      { dependsOn: [], relatedDocuments: ['docs/other.md'] },
      stale,
    )

    const error = await saveTicketLinks(
      project,
      board.frontmatter.id,
      { dependsOn: [schema.frontmatter.id], relatedDocuments: [] },
      stale,
    ).catch((caught: unknown) => caught)

    expect(isProjectError(error) && error.code).toBe('revision_conflict')
    const kept = await readTicket(project, board.frontmatter.id)
    expect(kept.frontmatter.related_documents).toEqual(['docs/other.md'])
  })

  it('reads back with readiness recomputed from the saved prerequisites', async () => {
    const schema = await createTicket(project, { title: 'Schema' })
    const board = await createTicket(project, { title: 'Board' })
    const before = (await buildView(project)).tickets.find((t) => t.id === board.frontmatter.id)
    expect(before?.dependencyReady).toBe(true)

    await saveTicketLinks(
      project,
      board.frontmatter.id,
      { dependsOn: [schema.frontmatter.id], relatedDocuments: [] },
      board.revision,
    )

    const after = (await buildView(project)).tickets.find((t) => t.id === board.frontmatter.id)
    expect(after?.dependencyReady).toBe(false)
    expect(after?.dependencyNotes.join(' ')).toContain('waiting on "Schema"')
  })

  it('writes nothing when both lists are unchanged', async () => {
    const board = await createTicket(project, {
      title: 'Board',
      relatedDocuments: ['docs/spec.md'],
    })
    const bytes = await readFile(fileOf(board.frontmatter.id), 'utf8')

    await saveTicketLinks(
      project,
      board.frontmatter.id,
      { dependsOn: [], relatedDocuments: ['docs/spec.md'] },
      board.revision,
    )

    expect(await readFile(fileOf(board.frontmatter.id), 'utf8')).toBe(bytes)
  })
})

describe('parseLinksEdit', () => {
  it('drops repeats, keeping the first place each had', () => {
    expect(parseLinksEdit({ dependsOn: ['b', 'a', 'b'], relatedDocuments: ['x', 'x'] })).toEqual({
      dependsOn: ['b', 'a'],
      relatedDocuments: ['x'],
    })
  })

  it.each([
    ['a list with a number in it', { dependsOn: [3], relatedDocuments: [] }],
    ['a missing list', { dependsOn: [] }],
    ['nothing at all', undefined],
  ])('refuses %s', (_case, input) => {
    expect(() => parseLinksEdit(input)).toThrow()
  })
})
