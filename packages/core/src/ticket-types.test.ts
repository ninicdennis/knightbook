import { readFile, writeFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseRecord } from './frontmatter.js'
import { TICKET_TYPES } from './schema.js'
import { reservedPaths } from './paths.js'
import { contentFingerprint } from './review.js'
import { searchProject } from './search.js'
import { searchTickets } from './ticket-search.js'
import { createTicket, listTickets, readTicket, updateTicket } from './tickets.js'
import { withFixtureProject } from './fixture-project.js'

/**
 * The optional `type` field. What matters is that it is genuinely optional —
 * a ticket written before it existed stays valid and stays untyped — and that
 * setting one never disturbs anything else on the record.
 */

/** A ticket file from before types existed, written by hand as an older tool would. */
const UNTYPED = `---
schema_version: 1
id: 0f9c2b1e-5a7d-4c33-9b21-8e6f4a0d1c77
title: "Add readiness check"
status: backlog
depends_on: []
created_at: 2026-09-01T10:15:00Z
updated_at: 2026-09-01T10:15:00Z
related_documents: []
---

# Add readiness check

## Acceptance criteria

- Every prerequisite must be in verification or done.
`

const UNTYPED_ID = '0f9c2b1e-5a7d-4c33-9b21-8e6f4a0d1c77'

async function writeUntypedTicket(root: Parameters<typeof reservedPaths.ticketFile>[0]) {
  await writeFile(reservedPaths.ticketFile(root, UNTYPED_ID), UNTYPED, 'utf8')
}

describe('records written before types existed', () => {
  it('stays valid and stays untyped', async () => {
    await withFixtureProject(async (project) => {
      await writeUntypedTicket(project.root)

      const ticket = await readTicket(project, UNTYPED_ID)
      expect(ticket.frontmatter.type).toBeUndefined()
      expect(ticket.frontmatter.title).toBe('Add readiness check')
    })
  })

  it('is not given one by an update that does not mention it', async () => {
    await withFixtureProject(async (project) => {
      await writeUntypedTicket(project.root)
      const before = await readTicket(project, UNTYPED_ID)

      await updateTicket(project, UNTYPED_ID, {
        expectedRevision: before.revision,
        status: 'in_progress',
      })

      const after = await readTicket(project, UNTYPED_ID)
      expect(after.frontmatter.type).toBeUndefined()
      expect(
        await readFile(reservedPaths.ticketFile(project.root, UNTYPED_ID), 'utf8'),
      ).not.toMatch(/type:/)
    })
  })
})

describe('creating a ticket with a type', () => {
  it('stores the word, not a symbol', async () => {
    await withFixtureProject(async (project) => {
      for (const type of TICKET_TYPES) {
        const created = await createTicket(project, { title: type, type })
        expect(created.frontmatter.type).toBe(type)

        const source = await readFile(
          reservedPaths.ticketFile(project.root, created.frontmatter.id),
          'utf8',
        )
        expect(source).toContain(`type: ${type}`)
        expect((await readTicket(project, created.frontmatter.id)).frontmatter.type).toBe(type)
      }
    })
  })

  it('writes no type field at all when none was given', async () => {
    await withFixtureProject(async (project) => {
      const created = await createTicket(project, { title: 'Untyped' })

      const source = await readFile(
        reservedPaths.ticketFile(project.root, created.frontmatter.id),
        'utf8',
      )
      expect(source).not.toMatch(/^type:/m)
      expect(created.frontmatter.type).toBeUndefined()
    })
  })
})

describe('changing a type', () => {
  it('sets one on a ticket that had none', async () => {
    await withFixtureProject(async (project) => {
      const created = await createTicket(project, { title: 'A' })

      const updated = await updateTicket(project, created.frontmatter.id, {
        expectedRevision: created.revision,
        type: 'bug',
      })
      expect(updated.frontmatter.type).toBe('bug')
    })
  })

  it('replaces one type with another', async () => {
    await withFixtureProject(async (project) => {
      const created = await createTicket(project, { title: 'A', type: 'feature' })

      const updated = await updateTicket(project, created.frontmatter.id, {
        expectedRevision: created.revision,
        type: 'task',
      })
      expect(updated.frontmatter.type).toBe('task')
    })
  })

  it('clears it back to untyped when asked with null', async () => {
    await withFixtureProject(async (project) => {
      const created = await createTicket(project, { title: 'A', type: 'bug' })

      const updated = await updateTicket(project, created.frontmatter.id, {
        expectedRevision: created.revision,
        type: null,
      })
      expect(updated.frontmatter.type).toBeUndefined()

      const source = await readFile(
        reservedPaths.ticketFile(project.root, created.frontmatter.id),
        'utf8',
      )
      expect(source).not.toMatch(/^type:/m)
    })
  })

  it('keeps it when the update leaves it out, so an older caller cannot erase it', async () => {
    await withFixtureProject(async (project) => {
      const created = await createTicket(project, { title: 'A', type: 'feature' })

      const updated = await updateTicket(project, created.frontmatter.id, {
        expectedRevision: created.revision,
        title: 'A renamed ticket',
      })
      expect(updated.frontmatter.type).toBe('feature')
    })
  })

  it('leaves the body and every other field exactly as they were', async () => {
    await withFixtureProject(async (project) => {
      const body = '# A\n\n## Acceptance criteria\n\n- Something checkable.\n'
      const created = await createTicket(project, {
        title: 'A',
        body,
        relatedDocuments: ['docs/spec.md'],
      })

      await updateTicket(project, created.frontmatter.id, {
        expectedRevision: created.revision,
        type: 'task',
      })

      const after = await readTicket(project, created.frontmatter.id)
      expect(after.body).toBe(body)
      expect(after.frontmatter.id).toBe(created.frontmatter.id)
      expect(after.frontmatter.title).toBe('A')
      expect(after.frontmatter.status).toBe('backlog')
      expect(after.frontmatter.related_documents).toEqual(['docs/spec.md'])
      expect(after.frontmatter.created_at).toBe(created.frontmatter.created_at)
    })
  })

  it('refuses a write against a stale revision, leaving the type alone', async () => {
    await withFixtureProject(async (project) => {
      const created = await createTicket(project, { title: 'A', type: 'feature' })
      await updateTicket(project, created.frontmatter.id, {
        expectedRevision: created.revision,
        type: 'bug',
      })

      await expect(
        updateTicket(project, created.frontmatter.id, {
          expectedRevision: created.revision,
          type: 'task',
        }),
      ).rejects.toMatchObject({ code: 'revision_conflict' })
      expect((await readTicket(project, created.frontmatter.id)).frontmatter.type).toBe('bug')
    })
  })
})

describe('a type that is not one of the known words', () => {
  it('makes the record invalid rather than being read as untyped', async () => {
    await withFixtureProject(async (project) => {
      const created = await createTicket(project, { title: 'A', type: 'bug' })
      const path = reservedPaths.ticketFile(project.root, created.frontmatter.id)
      await writeFile(
        path,
        (await readFile(path, 'utf8')).replace('type: bug', 'type: chore'),
        'utf8',
      )

      await expect(readTicket(project, created.frontmatter.id)).rejects.toMatchObject({
        code: 'invalid_record',
      })
      // The file is reported, not repaired: its bytes are still what was written.
      expect(await readFile(path, 'utf8')).toContain('type: chore')
    })
  })

  it('refuses an update that would write one, before touching the file', async () => {
    await withFixtureProject(async (project) => {
      const created = await createTicket(project, { title: 'A', type: 'bug' })

      await expect(
        updateTicket(project, created.frontmatter.id, {
          expectedRevision: created.revision,
          // The kind of value an older or hand-written caller might send.
          type: 'chore' as never,
        }),
      ).rejects.toThrow()
      expect((await readTicket(project, created.frontmatter.id)).frontmatter.type).toBe('bug')
    })
  })
})

describe('what the rest of the project sees', () => {
  it('reads the type back through the board listing', async () => {
    await withFixtureProject(async (project) => {
      await createTicket(project, { title: 'Typed', type: 'bug' })
      await createTicket(project, { title: 'Untyped' })

      const byTitle = new Map(
        (await listTickets(project)).map((t) => [t.frontmatter.title, t.frontmatter.type]),
      )
      expect(byTitle.get('Typed')).toBe('bug')
      expect(byTitle.get('Untyped')).toBeUndefined()
    })
  })

  it('carries it on a search hit, as null when there is none', async () => {
    await withFixtureProject(async (project) => {
      await createTicket(project, { title: 'Readiness check', type: 'feature' })
      await createTicket(project, { title: 'Readiness notes' })

      const { hits } = await searchTickets(project, 'readiness')
      const byTitle = new Map(hits.map((hit) => [hit.title, hit.type]))
      expect(byTitle.get('Readiness check')).toBe('feature')
      expect(byTitle.get('Readiness notes')).toBeNull()
    })
  })

  it('carries it on a project-wide search hit too, and omits it when there is none', async () => {
    await withFixtureProject(async (project) => {
      await createTicket(project, { title: 'Readiness check', type: 'feature' })
      await createTicket(project, { title: 'Readiness notes' })

      const { hits } = await searchProject(project, 'readiness')
      const byTitle = new Map(hits.map((hit) => [hit.title, hit.type]))
      expect(byTitle.get('Readiness check')).toBe('feature')
      expect(byTitle.get('Readiness notes')).toBeUndefined()
    })
  })

  it('counts as a meaningful change, so a recorded review goes stale', () => {
    const typed = UNTYPED.replace('status: backlog', 'status: backlog\ntype: bug')
    const retyped = typed.replace('type: bug', 'type: task')

    // Same rule as depends_on and related_documents: it describes the work, so
    // changing it is something a reviewer should be asked to look at again.
    expect(contentFingerprint(typed)).not.toBe(contentFingerprint(UNTYPED))
    expect(contentFingerprint(retyped)).not.toBe(contentFingerprint(typed))
    // And it is still only the frontmatter that differs.
    expect(parseRecord(typed).body).toBe(parseRecord(UNTYPED).body)
  })
})
