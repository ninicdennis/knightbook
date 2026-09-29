import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { isProjectError } from '../records/errors.js'
import { reservedPaths } from '../records/paths.js'
import type { Project } from '../records/project.js'
import { archiveTicket, createTicket, readTicket, updateTicket } from './tickets.js'
import { setDependenciesByHand, withFixtureProject } from '../test/fixture-project.js'

/**
 * Decision D-032: a dependency change may not add a bad reference, and nothing
 * is written when it tries. Both the app and MCP's ticket_update reach this
 * through core's updateTicket.
 */

const MISSING = '00000000-0000-4000-8000-000000000000'

async function setDependencies(project: Project, id: string, dependsOn: string[]) {
  const current = await readTicket(project, id)
  return await updateTicket(project, id, { expectedRevision: current.revision, dependsOn })
}

/** Runs a change expected to be refused; returns the message and proves the file is untouched. */
async function refused(project: Project, id: string, dependsOn: string[]): Promise<string> {
  const path = reservedPaths.ticketFile(project.root, id)
  const before = await readFile(path, 'utf8')
  const error = await setDependencies(project, id, dependsOn).catch((caught: unknown) => caught)
  expect(isProjectError(error) && error.code).toBe('invalid_dependency')
  expect(await readFile(path, 'utf8')).toBe(before)
  return (error as Error).message
}

describe('changing prerequisites (D-032)', () => {
  it('saves ordinary prerequisites, including an archived one', async () => {
    await withFixtureProject(async (project) => {
      const schema = await createTicket(project, { title: 'Schema' })
      const old = await createTicket(project, { title: 'Old' })
      await archiveTicket(project, old.frontmatter.id, old.revision)
      const board = await createTicket(project, { title: 'Board' })

      const saved = await setDependencies(project, board.frontmatter.id, [
        schema.frontmatter.id,
        old.frontmatter.id,
      ])

      expect(saved.frontmatter.depends_on).toEqual([schema.frontmatter.id, old.frontmatter.id])
    })
  })

  it('refuses the ticket itself', async () => {
    await withFixtureProject(async (project) => {
      const board = await createTicket(project, { title: 'Board' })
      const message = await refused(project, board.frontmatter.id, [board.frontmatter.id])
      expect(message).toContain('cannot depend on itself')
    })
  })

  it('refuses a ticket id that does not exist', async () => {
    await withFixtureProject(async (project) => {
      const board = await createTicket(project, { title: 'Board' })
      const message = await refused(project, board.frontmatter.id, [MISSING])
      expect(message).toContain(`no ticket ${MISSING}`)
    })
  })

  it('refuses a prerequisite that leads back, naming the chain by title', async () => {
    await withFixtureProject(async (project) => {
      const a = await createTicket(project, { title: 'A' })
      const b = await createTicket(project, { title: 'B', dependsOn: [a.frontmatter.id] })
      const c = await createTicket(project, { title: 'C', dependsOn: [b.frontmatter.id] })

      const message = await refused(project, a.frontmatter.id, [c.frontmatter.id])

      expect(message).toContain('"C" already leads back to this ticket ("C" -> "B" -> "A")')
    })
  })

  it('names every problem in one refusal', async () => {
    await withFixtureProject(async (project) => {
      const a = await createTicket(project, { title: 'A' })
      const b = await createTicket(project, { title: 'B', dependsOn: [a.frontmatter.id] })

      const message = await refused(project, a.frontmatter.id, [
        a.frontmatter.id,
        MISSING,
        b.frontmatter.id,
      ])

      expect(message).toContain('itself')
      expect(message).toContain(MISSING)
      expect(message).toContain('cycle')
    })
  })

  it('still lets the rest of the list change when a bad reference is already in the file', async () => {
    await withFixtureProject(async (project) => {
      const a = await createTicket(project, { title: 'A' })
      const b = await createTicket(project, { title: 'B', dependsOn: [a.frontmatter.id] })
      const other = await createTicket(project, { title: 'Other' })
      // A cycle and a missing id that arrived by hand, not through updateTicket.
      await setDependenciesByHand(project, a.frontmatter.id, [b.frontmatter.id, MISSING])

      const saved = await setDependencies(project, a.frontmatter.id, [
        b.frontmatter.id,
        MISSING,
        other.frontmatter.id,
      ])
      expect(saved.frontmatter.depends_on).toHaveLength(3)

      const removed = await setDependencies(project, a.frontmatter.id, [])
      expect(removed.frontmatter.depends_on).toEqual([])
    })
  })

  it('leaves a change that does not touch prerequisites alone', async () => {
    await withFixtureProject(async (project) => {
      const a = await createTicket(project, { title: 'A' })
      await setDependenciesByHand(project, a.frontmatter.id, [a.frontmatter.id])
      const current = await readTicket(project, a.frontmatter.id)

      const saved = await updateTicket(project, a.frontmatter.id, {
        expectedRevision: current.revision,
        title: 'Renamed',
      })

      expect(saved.frontmatter.title).toBe('Renamed')
    })
  })
})
