import { describe, expect, it } from 'vitest'
import { withFixtureProject } from './fixture-project.js'
import { createTicket, listTickets, nextCreatedAt } from './tickets.js'
import { selectNextTicket } from './selection.js'

/**
 * Section 5: creation order decides where a ticket sits until someone arranges
 * the backlog. `created_at` has millisecond resolution, so a burst of creations
 * can share one, and the sort would then fall back to a random UUID and produce
 * an order nobody chose. This is what stops that.
 */

describe('issuing a creation time', () => {
  it('uses the clock when it has moved on', () => {
    expect(nextCreatedAt(1_000, 999)).toBe(1_000)
    expect(nextCreatedAt(1_000, null)).toBe(1_000)
  })

  it('steps past a time already issued in the same millisecond', () => {
    expect(nextCreatedAt(1_000, 1_000)).toBe(1_001)
  })

  it('keeps going forward when the clock jumps backwards', () => {
    // NTP correction, or a laptop waking up. Two tickets must not swap places
    // because the system clock changed its mind.
    expect(nextCreatedAt(900, 1_000)).toBe(1_001)
  })

  it('is strictly increasing across a run of calls at one instant', () => {
    let previous: number | null = null
    const issued = Array.from({ length: 5 }, () => {
      previous = nextCreatedAt(1_000, previous)
      return previous
    })

    expect(issued).toEqual([1_000, 1_001, 1_002, 1_003, 1_004])
  })
})

describe('tickets created in one burst', () => {
  it('keep the order they were created in', async () => {
    await withFixtureProject(async (project) => {
      const titles = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
      for (const title of titles) await createTicket(project, { title })

      // No backlog order is set, so this is creation order and nothing else.
      expect((await listTickets(project)).map((t) => t.frontmatter.title)).toEqual(titles)
    })
  })

  it('have distinct creation times, so nothing rests on the id', async () => {
    await withFixtureProject(async (project) => {
      for (const title of ['A', 'B', 'C', 'D', 'E']) await createTicket(project, { title })

      const times = (await listTickets(project)).map((t) => t.frontmatter.created_at)
      expect(new Set(times).size).toBe(times.length)
      expect([...times]).toEqual([...times].sort())
    })
  })

  it('give next-ticket the first one created', async () => {
    await withFixtureProject(async (project) => {
      for (const title of ['A', 'B', 'C']) await createTicket(project, { title })

      expect((await selectNextTicket(project)).next?.frontmatter.title).toBe('A')
    })
  })
})
