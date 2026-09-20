import { readFile, rm } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { backlogOrderReport, inspectBacklogOrder, reorderBacklog } from './backlog-order.js'
import { parseRecord } from './frontmatter.js'
import { reservedPaths } from './paths.js'
import { openProject, setBacklogOrder } from './project.js'
import { selectNextTicket } from './selection.js'
import { createTicket, listTickets } from './tickets.js'
import { withFixtureProject } from './fixture-project.js'

/**
 * Manual backlog order. The rules worth protecting are that reordering touches
 * only the manifest, and that a duplicate or an id with no ticket is reported
 * rather than quietly tidied away.
 */

describe('reordering', () => {
  it('puts the given ids in front, and is what next-ticket then follows', async () => {
    await withFixtureProject(async (project) => {
      const first = await createTicket(project, { title: 'A' })
      const second = await createTicket(project, { title: 'B' })
      const third = await createTicket(project, { title: 'C' })

      // Creation order decides until someone says otherwise.
      expect((await selectNextTicket(project)).next?.frontmatter.title).toBe('A')

      const { project: reordered } = await reorderBacklog(project, [
        third.frontmatter.id,
        first.frontmatter.id,
        second.frontmatter.id,
      ])

      expect((await listTickets(reordered)).map((t) => t.frontmatter.title)).toEqual([
        'C',
        'A',
        'B',
      ])
      expect((await selectNextTicket(reordered)).next?.frontmatter.title).toBe('C')
    })
  })

  it('changes only backlog_order, leaving the rest of the manifest alone', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'A' })
      const before = await readFile(reservedPaths.projectFile(project.root), 'utf8')

      const { project: reordered } = await reorderBacklog(project, [ticket.frontmatter.id])
      const after = await readFile(reservedPaths.projectFile(project.root), 'utf8')

      expect(reordered.frontmatter.id).toBe(project.frontmatter.id)
      expect(reordered.frontmatter.name).toBe(project.frontmatter.name)
      expect(reordered.frontmatter.documents_include).toEqual(project.frontmatter.documents_include)
      // Compared as parsed fields rather than as lines: the order is written as
      // a YAML block, which moves the lines after it without changing them.
      const fieldsOf = (source: string) => {
        const data = parseRecord(source).data.toJS() as Record<string, unknown>
        delete data.backlog_order
        return data
      }
      expect(fieldsOf(after)).toEqual(fieldsOf(before))
      expect(parseRecord(after).body).toBe(parseRecord(before).body)
    })
  })

  it('keeps entries the caller did not mention, behind the ones it did', async () => {
    await withFixtureProject(async (project) => {
      const a = await createTicket(project, { title: 'A' })
      const b = await createTicket(project, { title: 'B' })
      const c = await createTicket(project, { title: 'C' })
      const ordered = await setBacklogOrder(project, [
        a.frontmatter.id,
        b.frontmatter.id,
        c.frontmatter.id,
      ])

      const { order } = await reorderBacklog(ordered, [c.frontmatter.id])
      expect(order).toEqual([c.frontmatter.id, a.frontmatter.id, b.frontmatter.id])
    })
  })

  it('keeps a duplicate that was already there, rather than tidying it away', async () => {
    await withFixtureProject(async (project) => {
      const a = await createTicket(project, { title: 'A' })
      const b = await createTicket(project, { title: 'B' })
      const ghost = '99999999-9999-4999-8999-999999999999'
      // The state an external edit or a Git merge can leave: A listed twice,
      // and an id whose ticket is gone.
      const broken = await setBacklogOrder(project, [
        a.frontmatter.id,
        a.frontmatter.id,
        ghost,
        b.frontmatter.id,
      ])

      const { order, report } = await reorderBacklog(broken, [b.frontmatter.id, a.frontmatter.id])

      // Placing A consumes one of its two entries; the other survives, because
      // reordering must not quietly repair the manifest.
      expect(order).toEqual([b.frontmatter.id, a.frontmatter.id, a.frontmatter.id, ghost])
      expect(report.duplicates).toEqual([a.frontmatter.id])
      expect(report.unknown).toEqual([ghost])
    })
  })

  it('still puts the requested order first when a duplicate survives', async () => {
    await withFixtureProject(async (project) => {
      const a = await createTicket(project, { title: 'A' })
      const b = await createTicket(project, { title: 'B' })
      const broken = await setBacklogOrder(project, [a.frontmatter.id, a.frontmatter.id])

      // A duplicate further down the list must not outrank the position the
      // caller just asked for.
      const { project: reordered } = await reorderBacklog(broken, [
        a.frontmatter.id,
        b.frontmatter.id,
      ])
      expect((await listTickets(reordered)).map((t) => t.frontmatter.title)).toEqual(['A', 'B'])
    })
  })

  it('refuses to write the same ticket twice rather than creating a duplicate', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'A' })

      await expect(
        reorderBacklog(project, [ticket.frontmatter.id, ticket.frontmatter.id]),
      ).rejects.toThrow(/cannot list the same ticket twice/)
    })
  })

  it('refuses to place a ticket that does not exist', async () => {
    await withFixtureProject(async (project) => {
      await createTicket(project, { title: 'A' })

      await expect(
        reorderBacklog(project, ['99999999-9999-4999-8999-999999999999']),
      ).rejects.toThrow(/No ticket in this project/)
      expect((await openProject(project.root.path)).frontmatter.backlog_order).toEqual([])
    })
  })
})

describe('which position a duplicated entry is read at', () => {
  it('uses the first, so a stale entry cannot outrank a deliberate one', async () => {
    await withFixtureProject(async (project) => {
      const a = await createTicket(project, { title: 'A' })
      const b = await createTicket(project, { title: 'B' })

      // A is listed first and again last. The first position wins.
      const ordered = await setBacklogOrder(project, [
        a.frontmatter.id,
        b.frontmatter.id,
        a.frontmatter.id,
      ])
      expect((await listTickets(ordered)).map((t) => t.frontmatter.title)).toEqual(['A', 'B'])
    })
  })
})

describe('reporting a manifest that is already wrong', () => {
  it('names a duplicate without removing it', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'A' })
      // Written the way an external edit or a Git merge would leave it.
      const broken = await setBacklogOrder(project, [ticket.frontmatter.id, ticket.frontmatter.id])

      const report = await backlogOrderReport(broken)
      expect(report.duplicates).toEqual([ticket.frontmatter.id])
      expect((await openProject(project.root.path)).frontmatter.backlog_order).toHaveLength(2)
    })
  })

  it('names an id with no ticket, and a later reorder still keeps it', async () => {
    await withFixtureProject(async (project) => {
      const kept = await createTicket(project, { title: 'A' })
      const removed = await createTicket(project, { title: 'B' })
      const ordered = await setBacklogOrder(project, [kept.frontmatter.id, removed.frontmatter.id])
      await rm(reservedPaths.ticketFile(project.root, removed.frontmatter.id))

      const reopened = await openProject(ordered.root.path)
      expect((await backlogOrderReport(reopened)).unknown).toEqual([removed.frontmatter.id])

      const { order, report } = await reorderBacklog(reopened, [kept.frontmatter.id])
      expect(order).toContain(removed.frontmatter.id)
      expect(report.unknown).toEqual([removed.frontmatter.id])
    })
  })

  it('says nothing is wrong when nothing is', () => {
    const report = inspectBacklogOrder(['a', 'b'], new Set(['a', 'b', 'c']))
    expect(report).toEqual({ duplicates: [], unknown: [] })
  })
})
