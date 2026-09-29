// @vitest-environment node
import {
  createTicket,
  initializeProject,
  isProjectError,
  readTicket,
  recordTicketReview,
  reservedPaths,
  ticketReviewStatus,
  updateTicket,
  type Project,
} from '@knightbook/core'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

const { contentChanges, parseContentEdit, saveTicketContent } = await import('./ticket-edit-ipc.js')

/**
 * Editing a ticket's title and body from the app, against real ticket files: a
 * stale edit is refused, an unchanged one writes nothing, and a real one reaches
 * the review state the same way an MCP edit does.
 */

let sandbox: string
let project: Project

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'knightbook-ticket-content-'))
  project = await initializeProject(join(sandbox, 'project'), { name: 'Fixture' })
})

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true })
})

const fileOf = (id: string) => reservedPaths.ticketFile(project.root, id)

async function newTicket(body = '# Original\n\nWhat the author wrote.\n') {
  const created = await createTicket(project, { title: 'Original', body })
  return created.frontmatter.id
}

describe('saving an edited title and body', () => {
  it('writes both and leaves every frontmatter field but the timestamp alone', async () => {
    const id = await newTicket()
    const before = await readTicket(project, id)

    await saveTicketContent(
      project,
      id,
      { title: 'Renamed', body: '# Renamed\n\nNew wording.\n' },
      before.revision,
    )

    const after = await readTicket(project, id)
    expect(after.frontmatter.title).toBe('Renamed')
    expect(after.body).toBe('# Renamed\n\nNew wording.\n')
    const { title: _t, updated_at: _u, ...rest } = after.frontmatter
    const { title: _bt, updated_at: _bu, ...restBefore } = before.frontmatter
    expect(rest).toEqual(restBefore)
  })

  it('keeps every other frontmatter line byte for byte', async () => {
    const id = await newTicket()
    const frontmatterLines = async () => {
      const text = await readFile(fileOf(id), 'utf8')
      return text
        .slice(0, text.indexOf('\n---', 3))
        .split('\n')
        .filter((line) => !/^(title|updated_at):/.test(line))
    }
    const before = await frontmatterLines()
    const opened = await readTicket(project, id)
    // The editor is given the body alone; the frontmatter never reaches it.
    expect(opened.body.startsWith('---')).toBe(false)

    await saveTicketContent(project, id, { title: 'Renamed', body: 'New.\n' }, opened.revision)

    expect(await frontmatterLines()).toEqual(before)
  })

  it('refuses an edit made on a revision that has since changed, and keeps the other change', async () => {
    const id = await newTicket()
    const opened = await readTicket(project, id)
    // Someone else (MCP, another editor) changes the ticket after the editor opened.
    await updateTicket(project, id, {
      expectedRevision: opened.revision,
      body: '# Original\n\nChanged through MCP.\n',
    })
    const theirs = await readFile(fileOf(id), 'utf8')

    const refused = await saveTicketContent(
      project,
      id,
      { title: 'Original', body: '# Original\n\nMy edit.\n' },
      opened.revision,
    ).catch((error: unknown) => error)

    expect(isProjectError(refused) && refused.code).toBe('revision_conflict')
    expect(await readFile(fileOf(id), 'utf8')).toBe(theirs)
  })

  it('writes nothing when the title and body are unchanged', async () => {
    const id = await newTicket()
    const opened = await readTicket(project, id)
    const bytes = await readFile(fileOf(id), 'utf8')

    await saveTicketContent(project, id, { title: 'Original', body: opened.body }, opened.revision)

    expect(await readFile(fileOf(id), 'utf8')).toBe(bytes)
  })

  it('writes nothing for an unchanged body from a CRLF file, which a text area returns as LF', async () => {
    const id = await newTicket()
    const crlf = (await readFile(fileOf(id), 'utf8')).replace(/\n/g, '\r\n')
    await writeFile(fileOf(id), crlf)
    const opened = await readTicket(project, id)
    expect(opened.body).toContain('\r\n')

    await saveTicketContent(
      project,
      id,
      { title: 'Original', body: opened.body.replace(/\r\n/g, '\n') },
      opened.revision,
    )

    expect(await readFile(fileOf(id), 'utf8')).toBe(crlf)
  })

  it('flags a reviewed ticket for renewed review after a meaningful body change', async () => {
    const id = await newTicket()
    await recordTicketReview(project, id, 'user')
    expect((await ticketReviewStatus(project, id)).state).toBe('reviewed')
    const opened = await readTicket(project, id)

    await saveTicketContent(
      project,
      id,
      { title: 'Original', body: '# Original\n\nA different requirement.\n' },
      opened.revision,
    )

    const status = await ticketReviewStatus(project, id)
    expect(status.state).toBe('changed_since_review')
    expect(status.lastReview).not.toBeNull()
  })

  it('leaves a reviewed CRLF ticket reviewed when only the line endings differ', async () => {
    const id = await newTicket()
    await writeFile(fileOf(id), (await readFile(fileOf(id), 'utf8')).replace(/\n/g, '\r\n'))
    await recordTicketReview(project, id, 'user')
    const opened = await readTicket(project, id)

    await saveTicketContent(
      project,
      id,
      { title: 'Original', body: opened.body.replace(/\r\n/g, '\n') },
      opened.revision,
    )

    expect((await ticketReviewStatus(project, id)).state).toBe('reviewed')
  })
})

describe('contentChanges', () => {
  const current = { title: 'T', body: '# T\r\n\r\nText.\r\n' }

  it('keeps the file’s CRLF endings when the body really changed', () => {
    expect(contentChanges(current, { title: 'T', body: '# T\n\nNew.\n' })).toEqual({
      body: '# T\r\n\r\nNew.\r\n',
    })
  })

  it('reports only the title when only the title changed', () => {
    expect(contentChanges(current, { title: 'U', body: '# T\n\nText.\n' })).toEqual({ title: 'U' })
  })
})

describe('parseContentEdit', () => {
  it('trims the title and keeps the body exactly as sent', () => {
    expect(parseContentEdit({ title: '  A  ', body: '  indented\n' })).toEqual({
      title: 'A',
      body: '  indented\n',
    })
  })

  it.each([
    ['an empty title', { title: '  ', body: '' }],
    ['a title over two lines', { title: 'A\nB', body: '' }],
    ['a body that is not text', { title: 'A', body: 3 }],
    ['nothing at all', undefined],
  ])('refuses %s', (_case, input) => {
    expect(() => parseContentEdit(input)).toThrow()
  })
})
