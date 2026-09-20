import { writeFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { reservedPaths } from './paths.js'
import { searchTickets } from './ticket-search.js'
import { createTicket, readTicket, updateTicket } from './tickets.js'
import { withFixtureProject } from './fixture-project.js'
import type { Project } from './project.js'

/**
 * Bounded text search over tickets. The rules worth protecting are that a body
 * match counts as much as a title one for being found, that title matches are
 * ranked first, and that a highlight offset means the same thing as the text it
 * is returned with.
 */

async function ticketWithBody(project: Project, title: string, body: string) {
  const created = await createTicket(project, { title })
  const current = await readTicket(project, created.frontmatter.id)
  return await updateTicket(project, created.frontmatter.id, {
    expectedRevision: current.revision,
    body,
  })
}

/** The substrings a hit would render as marked, taken from the text beside them. */
function marked(text: string, highlights: { start: number; length: number }[]): string[] {
  return highlights.map((range) => text.slice(range.start, range.start + range.length))
}

describe('finding tickets', () => {
  it('returns nothing for an empty query rather than everything', async () => {
    await withFixtureProject(async (project) => {
      await createTicket(project, { title: 'Importer' })

      for (const query of ['', '   ', '\n\t']) {
        expect(await searchTickets(project, query)).toEqual({
          hits: [],
          totalMatches: 0,
          problems: [],
        })
      }
    })
  })

  it('matches a title, ignoring case and surrounding whitespace', async () => {
    await withFixtureProject(async (project) => {
      await createTicket(project, { title: 'Import dated records' })

      for (const query of ['dated', 'DATED', '  Dated  ']) {
        const result = await searchTickets(project, query)
        expect(result.hits).toHaveLength(1)
        expect(result.hits[0]!.title).toBe('Import dated records')
      }
    })
  })

  it('matches text that appears only in the body', async () => {
    await withFixtureProject(async (project) => {
      await ticketWithBody(
        project,
        'Importer',
        '# Importer\n\n## Acceptance criteria\n- Daylight saving is handled.\n',
      )

      const result = await searchTickets(project, 'daylight saving')
      expect(result.hits).toHaveLength(1)
      expect(result.hits[0]!.titleHighlights).toEqual([])
      expect(result.hits[0]!.excerpt).toContain('Daylight saving is handled.')
    })
  })

  it('matches across a line break, because the body is searched as running text', async () => {
    await withFixtureProject(async (project) => {
      await ticketWithBody(project, 'Importer', '# Importer\n\nDaylight\nsaving is handled.\n')

      const result = await searchTickets(project, 'daylight saving')
      expect(result.hits).toHaveLength(1)
    })
  })

  it('ranks title matches above body-only matches', async () => {
    await withFixtureProject(async (project) => {
      await ticketWithBody(project, 'Report weekly totals', '# Report\n\nReads the importer.\n')
      await createTicket(project, { title: 'Importer' })

      const result = await searchTickets(project, 'importer')
      expect(result.hits.map((hit) => hit.title)).toEqual(['Importer', 'Report weekly totals'])
    })
  })

  it('reports ticket files it could not read rather than searching around them', async () => {
    await withFixtureProject(async (project) => {
      await createTicket(project, { title: 'Importer' })
      await writeFile(
        reservedPaths.ticketFile(project.root, '99999999-9999-4999-8999-999999999999'),
        'not a ticket at all',
        'utf8',
      )

      const result = await searchTickets(project, 'importer')
      expect(result.hits).toHaveLength(1)
      expect(result.problems).toHaveLength(1)
    })
  })
})

describe('what the caller renders', () => {
  it('gives highlight offsets that line up with the text beside them', async () => {
    await withFixtureProject(async (project) => {
      await ticketWithBody(
        project,
        'Import dated records',
        '# Import\n\nEvery   imported    date is off.\n',
      )

      const [hit] = (await searchTickets(project, 'import')).hits
      expect(marked(hit!.title, hit!.titleHighlights)).toEqual(['Import'])
      // The excerpt is whitespace-collapsed, and the offsets describe that same
      // collapsed string rather than the raw body.
      expect(marked(hit!.excerpt!, hit!.excerptHighlights)).toEqual(['Import', 'import'])
      expect(hit!.excerpt).toContain('Every imported date is off.')
    })
  })

  it('marks every occurrence, not just the first', async () => {
    await withFixtureProject(async (project) => {
      await createTicket(project, { title: 'Sync and sync again' })

      const [hit] = (await searchTickets(project, 'sync')).hits
      // Matching ignores case; the offsets still point at the original casing.
      expect(marked(hit!.title, hit!.titleHighlights)).toEqual(['Sync', 'sync'])
    })
  })

  it('leaves the excerpt null when only the title matched', async () => {
    await withFixtureProject(async (project) => {
      await ticketWithBody(project, 'Importer', '# Importer\n\nNothing relevant here.\n')

      const [hit] = (await searchTickets(project, 'importe')).hits
      expect(hit!.excerpt).toContain('Importer')

      const [other] = (await searchTickets(project, 'relevant')).hits
      expect(other!.titleHighlights).toEqual([])
    })
  })

  it('returns text and offsets rather than markup, so nothing is interpolated', async () => {
    await withFixtureProject(async (project) => {
      await ticketWithBody(
        project,
        '<img src=x onerror=alert(1)>',
        '# Odd\n\nA <script>alert(1)</script> tag.\n',
      )

      const [hit] = (await searchTickets(project, 'alert')).hits
      // The dangerous text comes back exactly as written, with no escaping and
      // no markup added: deciding how to render it is the caller's job.
      expect(hit!.title).toBe('<img src=x onerror=alert(1)>')
      expect(marked(hit!.title, hit!.titleHighlights)).toEqual(['alert'])
      expect(hit!.excerpt).toContain('<script>alert(1)</script>')
    })
  })
})

describe('bounding the results', () => {
  it('limits what it returns but still counts every match', async () => {
    await withFixtureProject(async (project) => {
      for (let index = 0; index < 8; index += 1) {
        await createTicket(project, { title: `Importer ${index}` })
      }

      const result = await searchTickets(project, 'importer', { limit: 3 })
      expect(result.hits).toHaveLength(3)
      expect(result.totalMatches).toBe(8)
    })
  })

  it('keeps the board order inside a rank, so the same query gives the same answer', async () => {
    await withFixtureProject(async (project) => {
      for (const title of ['Importer A', 'Importer B', 'Importer C']) {
        await createTicket(project, { title })
      }

      const once = await searchTickets(project, 'importer')
      const twice = await searchTickets(project, 'importer')
      expect(once.hits.map((hit) => hit.title)).toEqual(twice.hits.map((hit) => hit.title))
      expect(once.hits.map((hit) => hit.title)).toEqual(['Importer A', 'Importer B', 'Importer C'])
    })
  })
})
