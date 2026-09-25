import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RESERVED_DIR } from '../records/paths.js'
import {
  documentRecordId,
  lastReview,
  recordReview,
  reviewStatus,
  reviewedSource,
  ticketRecordId,
} from './review.js'
import { snapshotWritePath } from './review-storage.js'
import { createTicket } from '../tickets/tickets.js'
import { includeDocuments } from '../documents/documents.js'
import { withFixtureProject } from '../test/fixture-project.js'
import type { Project } from '../records/project.js'

/**
 * Where review history lives on disk. The point of the layout is that a person
 * browsing the repository can find one record's history without decoding a
 * folder name, and that a project carrying history from the old flat layout
 * keeps every bit of it.
 */

const SOURCE = `---
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
`

function reviewsDir(project: Project, ...rest: string[]): string {
  return join(project.root.path, RESERVED_DIR, 'reviews', ...rest)
}

/** Writes a snapshot the way the old flat, percent-encoded layout did. */
async function writeLegacySnapshot(
  project: Project,
  recordId: string,
  reviewedAt: string,
  note: string,
): Promise<string> {
  const directory = reviewsDir(project, encodeURIComponent(recordId))
  await mkdir(directory, { recursive: true })

  const file = join(directory, `${reviewedAt.replace(/[:.]/g, '-')}.md`)
  await writeFile(
    file,
    [
      '---',
      'schema_version: 1',
      `record_id: ${JSON.stringify(recordId)}`,
      `reviewed_at: ${reviewedAt}`,
      'reviewed_revision: legacy-revision',
      'content_fingerprint: legacy-fingerprint',
      `note: ${JSON.stringify(note)}`,
      '---',
      '',
      SOURCE,
    ].join('\n'),
    'utf8',
  )
  return directory
}

describe('where new snapshots are written', () => {
  it('puts a ticket under reviews/tickets/<id>/, with no encoding', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'Work' })
      const id = ticket.frontmatter.id
      await recordReview(project, ticketRecordId(id), SOURCE)

      expect(snapshotWritePath(project.root, ticketRecordId(id))).toBe(
        `${RESERVED_DIR}/reviews/tickets/${id}`,
      )
      expect(await readdir(reviewsDir(project, 'tickets', id))).toHaveLength(1)
    })
  })

  it('puts a document under its own path, as real nested folders', async () => {
    await withFixtureProject(async (project) => {
      await mkdir(join(project.root.path, 'docs'), { recursive: true })
      await writeFile(join(project.root.path, 'docs', 'design.md'), '# Design\n', 'utf8')
      const included = await includeDocuments(project, ['docs/design.md'])
      const id = documentRecordId(included, 'docs/design.md')

      await recordReview(included, id, '# Design\n')

      expect(snapshotWritePath(included.root, id)).toBe(
        `${RESERVED_DIR}/reviews/documents/docs/design.md`,
      )
      expect(await readdir(reviewsDir(included, 'documents', 'docs', 'design.md'))).toHaveLength(1)
    })
  })

  it('keeps the snapshot file name and its full contents unchanged', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'Work' })
      const id = ticketRecordId(ticket.frontmatter.id)
      const review = await recordReview(project, id, SOURCE, { note: 'Checked.' })

      const directory = reviewsDir(project, 'tickets', ticket.frontmatter.id)
      const [file] = await readdir(directory)
      expect(file).toBe(`${review.reviewedAt.replace(/[:.]/g, '-')}.md`)

      const written = await readFile(join(directory, file!), 'utf8')
      expect(written).toContain(`record_id: ${JSON.stringify(id)}`)
      expect(written).toContain('note: "Checked."')
      // A snapshot is self-contained: it holds a full copy of what was reviewed.
      expect(written).toContain('# Add readiness check')
    })
  })

  it('writes nothing at all when a record has never been reviewed', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'Work' })
      const status = await reviewStatus(project, ticketRecordId(ticket.frontmatter.id), SOURCE)

      expect(status.state).toBe('unreviewed')
      await expect(readdir(reviewsDir(project))).rejects.toThrow()
    })
  })
})

describe('history already on disk in the old layout', () => {
  it('is still read, and is never moved or rewritten', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'Work' })
      const id = ticketRecordId(ticket.frontmatter.id)
      const legacy = await writeLegacySnapshot(project, id, '2026-09-01T09:00:00.000Z', 'Old pass.')
      const before = await readFile(join(legacy, await firstFile(legacy)), 'utf8')

      expect((await lastReview(project, id))?.note).toBe('Old pass.')
      expect(await reviewedSource(project, id)).toContain('# Add readiness check')

      // Recording again writes into the new layout and leaves the old folder be.
      await recordReview(project, id, SOURCE, { note: 'New pass.' })

      expect(await readdir(legacy)).toHaveLength(1)
      expect(await readFile(join(legacy, await firstFile(legacy)), 'utf8')).toBe(before)
      expect(await readdir(reviewsDir(project, 'tickets', ticket.frontmatter.id))).toHaveLength(1)
    })
  })

  it('takes the newest review across both layouts, whichever holds it', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'Work' })
      const id = ticketRecordId(ticket.frontmatter.id)

      // A review recorded after the change, and an older one from before it.
      await recordReview(project, id, SOURCE, { note: 'New pass.' })
      await writeLegacySnapshot(project, id, '2020-01-01T00:00:00.000Z', 'Ancient pass.')
      expect((await lastReview(project, id))?.note).toBe('New pass.')

      // An old-layout review that is genuinely the most recent still wins.
      await writeLegacySnapshot(project, id, '2099-01-01T00:00:00.000Z', 'Latest pass.')
      expect((await lastReview(project, id))?.note).toBe('Latest pass.')
    })
  })

  it('finds a document whose old folder encoded its separators', async () => {
    await withFixtureProject(async (project) => {
      await mkdir(join(project.root.path, 'docs'), { recursive: true })
      await writeFile(join(project.root.path, 'docs', 'design.md'), '# Design\n', 'utf8')
      const included = await includeDocuments(project, ['docs/design.md'])
      const id = documentRecordId(included, 'docs/design.md')

      // This is the shape real projects have on disk: document%3Adocs%2Fdesign.md
      const legacy = await writeLegacySnapshot(included, id, '2026-09-01T09:00:00.000Z', 'Old.')
      expect(legacy.endsWith('document%3Adocs%2Fdesign.md')).toBe(true)

      expect((await lastReview(included, id))?.note).toBe('Old.')
    })
  })

  it('compares against an old-layout review rather than reporting unreviewed', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'Work' })
      const id = ticketRecordId(ticket.frontmatter.id)
      await writeLegacySnapshot(project, id, '2026-09-01T09:00:00.000Z', 'Old pass.')

      const status = await reviewStatus(project, id, SOURCE.replace('readiness', 'eligibility'))
      expect(status.state).toBe('changed_since_review')
      expect(status.lastReview?.note).toBe('Old pass.')
    })
  })
})

describe('record ids that cannot become a folder', () => {
  it('refuses a ticket id that is not a single plain folder name', async () => {
    await withFixtureProject(async (project) => {
      for (const id of ['../escape', 'a/b', '..', '', 'a\\b']) {
        await expect(recordReview(project, `ticket:${id}`, SOURCE)).rejects.toThrow(
          /single plain folder name/,
        )
      }
    })
  })

  it('refuses a document path that would climb out of reviews/documents/', async () => {
    await withFixtureProject(async (project) => {
      for (const path of ['../../evil.md', 'docs/../../evil.md', '/etc/passwd', '']) {
        await expect(recordReview(project, `document:${path}`, SOURCE)).rejects.toThrow()
      }

      await expect(readdir(reviewsDir(project))).rejects.toThrow()
    })
  })

  it('refuses a record id that names neither kind', async () => {
    await withFixtureProject(async (project) => {
      await expect(recordReview(project, 'mystery:thing', SOURCE)).rejects.toThrow(
        /neither a ticket nor a document/,
      )
    })
  })
})

async function firstFile(directory: string): Promise<string> {
  const [file] = (await readdir(directory)).sort()
  return file!
}
