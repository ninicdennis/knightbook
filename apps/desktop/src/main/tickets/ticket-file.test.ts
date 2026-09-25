// @vitest-environment node
import { createTicket, initializeProject, reservedPaths, type Project } from '@knightbook/core'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ticketFileToOpen } from './ticket-file.js'

let sandbox: string
let project: Project

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'knightbook-ticket-file-'))
  project = await initializeProject(join(sandbox, 'project'), { name: 'Fixture' })
})

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true })
})

describe('the file opened for a ticket', () => {
  it("is the ticket's own record in the tickets folder", async () => {
    const ticket = await createTicket(project, { title: 'Fix a line' })
    const id = ticket.frontmatter.id
    expect(await ticketFileToOpen(project, id)).toBe(reservedPaths.ticketFile(project.root, id))
  })

  it('refuses an id with no ticket behind it', async () => {
    await expect(
      ticketFileToOpen(project, '99999999-9999-4999-8999-999999999999'),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('refuses anything that is not a string id', async () => {
    for (const id of [undefined, null, 42, { id: 'x' }, '']) {
      await expect(ticketFileToOpen(project, id)).rejects.toMatchObject({ code: 'not_found' })
    }
  })

  it('refuses ids shaped to leave the tickets folder', async () => {
    // A real file outside the folder, so a refusal cannot be a plain "not found" by luck.
    await writeFile(join(project.root.path, 'escaped.md'), 'outside')
    for (const id of ['../../escaped', '..\\..\\escaped', '../project', 'a/../../x', '..']) {
      await expect(ticketFileToOpen(project, id)).rejects.toThrow()
    }
    await expect(ticketFileToOpen(project, join(sandbox, 'x'))).rejects.toThrow()
  })

  it('still opens a record too broken to load, so it can be fixed by hand', async () => {
    const ticket = await createTicket(project, { title: 'Will be broken' })
    const id = ticket.frontmatter.id
    await writeFile(
      reservedPaths.ticketFile(project.root, id),
      '<<<<<<< HEAD\nstatus: backlog\n=======\nstatus: done\n>>>>>>> other\n',
    )
    expect(await ticketFileToOpen(project, id)).toBe(reservedPaths.ticketFile(project.root, id))
  })
})
