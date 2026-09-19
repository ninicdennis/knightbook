import { readFile, writeFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { evaluateReadiness } from './dependencies.js'
import { withFixtureProject } from './fixture-project.js'
import { reservedPaths } from './paths.js'
import type { Project } from './project.js'
import { searchProject } from './search.js'
import { selectNextTicket } from './selection.js'
import {
  createTicket,
  listTicketRecords,
  listTickets,
  readTicket,
  updateTicket,
} from './tickets.js'

/**
 * One malformed ticket or an unresolved merge conflict used to make listTickets
 * throw, which turned the whole project into the could-not-open screen. Bad files
 * are now collected as problems next to the tickets that loaded, their bytes are
 * never touched, and writes to them stay refused (technical design section 3).
 */

const CONFLICTED = (valid: string) =>
  valid.replace('title:', '<<<<<<< HEAD\ntitle:').replace('status:', '=======\nstatus:') +
  '\n>>>>>>> branch\n'

async function corrupt(
  project: Project,
  id: string,
  transform: (content: string) => string,
): Promise<string> {
  const path = reservedPaths.ticketFile(project.root, id)
  const broken = transform(await readFile(path, 'utf8'))
  await writeFile(path, broken, 'utf8')
  return broken
}

describe('listing when some records are invalid', () => {
  it('still returns the valid tickets and reports each bad file with its reason', async () => {
    await withFixtureProject(async (project) => {
      const good = await createTicket(project, { title: 'Fine' })
      const conflicted = await createTicket(project, { title: 'Conflicted' })
      const badStatus = await createTicket(project, { title: 'Bad status' })

      await corrupt(project, conflicted.frontmatter.id, CONFLICTED)
      await corrupt(project, badStatus.frontmatter.id, (c) =>
        c.replace('status: backlog', 'status: sideways'),
      )

      const { tickets, problems } = await listTicketRecords(project)

      expect(tickets.map((t) => t.frontmatter.id)).toEqual([good.frontmatter.id])
      expect(problems).toHaveLength(2)

      const conflictProblem = problems.find((p) => p.id === conflicted.frontmatter.id)
      expect(conflictProblem?.file).toBe(`.projectspace/tickets/${conflicted.frontmatter.id}.md`)
      expect(conflictProblem?.reason).toMatch(/merge conflict markers/i)
      expect(conflictProblem?.code).toBe('invalid_record')

      const statusProblem = problems.find((p) => p.id === badStatus.frontmatter.id)
      expect(statusProblem?.reason).toMatch(/not valid/i)
    })
  })

  it('reports a file whose own id disagrees with its name, and one with broken YAML', async () => {
    await withFixtureProject(async (project) => {
      const renamed = await createTicket(project, { title: 'Wrong id' })
      const yaml = await createTicket(project, { title: 'Broken yaml' })
      await corrupt(project, renamed.frontmatter.id, (c) =>
        c.replace(renamed.frontmatter.id, '99999999-9999-4999-8999-999999999999'),
      )
      await corrupt(project, yaml.frontmatter.id, (c) =>
        c.replace('status: backlog', 'status: [unclosed'),
      )

      const { tickets, problems } = await listTicketRecords(project)

      expect(tickets).toEqual([])
      expect(problems.map((p) => p.id).sort()).toEqual(
        [renamed.frontmatter.id, yaml.frontmatter.id].sort(),
      )
      expect(problems.find((p) => p.id === renamed.frontmatter.id)?.reason).toMatch(/different id/i)
    })
  })

  it('leaves every invalid file exactly as it was', async () => {
    await withFixtureProject(async (project) => {
      const conflicted = await createTicket(project, { title: 'Conflicted' })
      const before = await corrupt(project, conflicted.frontmatter.id, CONFLICTED)

      await listTicketRecords(project)
      await selectNextTicket(project)
      await searchProject(project, 'anything')

      const after = await readFile(
        reservedPaths.ticketFile(project.root, conflicted.frontmatter.id),
        'utf8',
      )
      expect(after).toBe(before)
    })
  })

  it('reports nothing for a project whose records are all fine', async () => {
    await withFixtureProject(async (project) => {
      await createTicket(project, { title: 'One' })

      expect((await listTicketRecords(project)).problems).toEqual([])
    })
  })

  it('keeps listTickets to the tickets that loaded, without throwing', async () => {
    await withFixtureProject(async (project) => {
      const good = await createTicket(project, { title: 'Fine' })
      const bad = await createTicket(project, { title: 'Bad' })
      await corrupt(project, bad.frontmatter.id, CONFLICTED)

      expect((await listTickets(project)).map((t) => t.frontmatter.id)).toEqual([
        good.frontmatter.id,
      ])
    })
  })
})

describe('writes to an invalid record stay blocked', () => {
  it('refuses an update, and changes no byte of the file', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'Conflicted' })
      const before = await corrupt(project, ticket.frontmatter.id, CONFLICTED)

      await expect(
        updateTicket(project, ticket.frontmatter.id, {
          expectedRevision: ticket.revision,
          title: 'Renamed anyway',
        }),
      ).rejects.toMatchObject({ code: 'invalid_record' })

      const after = await readFile(
        reservedPaths.ticketFile(project.root, ticket.frontmatter.id),
        'utf8',
      )
      expect(after).toBe(before)
    })
  })

  it('refuses an update to a ticket whose frontmatter fails the schema', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'Bad status' })
      const before = await corrupt(project, ticket.frontmatter.id, (c) =>
        c.replace('status: backlog', 'status: sideways'),
      )

      await expect(
        updateTicket(project, ticket.frontmatter.id, {
          expectedRevision: ticket.revision,
          status: 'in_progress',
        }),
      ).rejects.toMatchObject({ code: 'invalid_record' })

      const after = await readFile(
        reservedPaths.ticketFile(project.root, ticket.frontmatter.id),
        'utf8',
      )
      expect(after).toBe(before)
    })
  })

  it('reading a single invalid ticket still fails loudly rather than returning something partial', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'Conflicted' })
      await corrupt(project, ticket.frontmatter.id, CONFLICTED)

      await expect(readTicket(project, ticket.frontmatter.id)).rejects.toMatchObject({
        code: 'invalid_record',
      })
    })
  })
})

describe('what the rest of the system does with a bad file', () => {
  it('never offers an invalid ticket as the next one, and says a file was skipped', async () => {
    await withFixtureProject(async (project) => {
      const bad = await createTicket(project, { title: 'Bad' })
      await corrupt(project, bad.frontmatter.id, CONFLICTED)

      const result = await selectNextTicket(project)

      expect(result.next).toBeNull()
      expect(result.problems.map((p) => p.id)).toEqual([bad.frontmatter.id])
      expect(result.explanation).toMatch(/could not be read and were skipped/i)
    })
  })

  it('still finds the next valid ticket, and still reports the bad file', async () => {
    await withFixtureProject(async (project) => {
      const bad = await createTicket(project, { title: 'Bad' })
      const good = await createTicket(project, { title: 'Good' })
      await corrupt(project, bad.frontmatter.id, CONFLICTED)

      const result = await selectNextTicket(project)

      expect(result.next?.frontmatter.id).toBe(good.frontmatter.id)
      expect(result.problems).toHaveLength(1)
    })
  })

  it('does not call an unreadable prerequisite missing', async () => {
    await withFixtureProject(async (project) => {
      const prerequisite = await createTicket(project, { title: 'Prerequisite' })
      const dependent = await createTicket(project, {
        title: 'Dependent',
        dependsOn: [prerequisite.frontmatter.id],
      })
      await corrupt(project, prerequisite.frontmatter.id, CONFLICTED)

      const listing = await listTicketRecords(project)
      const readiness = evaluateReadiness(
        listing.tickets[0]!.frontmatter,
        new Map(listing.tickets.map((t) => [t.frontmatter.id, t.frontmatter])),
        new Set(listing.problems.map((p) => p.id)),
      )

      expect(listing.tickets[0]?.frontmatter.id).toBe(dependent.frontmatter.id)
      expect(readiness.ready).toBe(false)
      expect(readiness.reasons).toEqual([
        { kind: 'prerequisite_unreadable', ticketId: prerequisite.frontmatter.id },
      ])
    })
  })

  it('still calls a prerequisite that truly is absent missing', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, {
        title: 'Orphan',
        dependsOn: ['88888888-8888-4888-8888-888888888888'],
      })

      const readiness = evaluateReadiness(ticket.frontmatter, new Map(), new Set())

      expect(readiness.reasons[0]?.kind).toBe('prerequisite_missing')
    })
  })

  it('search reports the file it could not read instead of silently skipping it', async () => {
    await withFixtureProject(async (project) => {
      const bad = await createTicket(project, { title: 'Bad' })
      await corrupt(project, bad.frontmatter.id, CONFLICTED)

      const result = await searchProject(project, 'bad')

      expect(result.unreadable).toContain(`.projectspace/tickets/${bad.frontmatter.id}.md`)
    })
  })
})
