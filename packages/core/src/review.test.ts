import { describe, expect, it } from 'vitest'
import {
  assertHumanReviewer,
  contentFingerprint,
  lastReview,
  recordReview,
  reviewStatus,
  reviewedSource,
  ticketRecordId,
} from './review.js'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { snapshotWriteDir } from './review-storage.js'
import { revisionOf } from './revision.js'
import { readTicket, createTicket, updateTicket } from './tickets.js'
import { withFixtureProject } from './fixture-project.js'

/**
 * Decisions D-003, D-004 and D-016. Review is informational, only meaningful
 * changes renew it, and the previous review record is always retained.
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

## Acceptance criteria

- Every prerequisite must be in verification or done.
`

describe('meaningful-change classification', () => {
  it('ignores reformatting', () => {
    const reformatted = SOURCE.replace(
      '- Every prerequisite must be in verification or done.',
      '-   Every   prerequisite must be in verification or done.',
    )
    expect(contentFingerprint(reformatted)).toBe(contentFingerprint(SOURCE))
  })

  it('ignores a status change and its bookkeeping timestamp', () => {
    const moved = SOURCE.replace('status: backlog', 'status: in_progress').replace(
      'updated_at: 2026-09-01T10:15:00Z',
      'updated_at: 2026-09-19T08:00:00Z',
    )
    expect(contentFingerprint(moved)).toBe(contentFingerprint(SOURCE))
  })

  it('treats a changed acceptance criterion as meaningful', () => {
    const changed = SOURCE.replace('verification or done', 'done only')
    expect(contentFingerprint(changed)).not.toBe(contentFingerprint(SOURCE))
  })

  it('treats a changed title as meaningful', () => {
    const changed = SOURCE.replace(
      'title: "Add readiness check"',
      'title: "Remove readiness check"',
    )
    expect(contentFingerprint(changed)).not.toBe(contentFingerprint(SOURCE))
  })

  it('treats merging two blocks into one as meaningful', () => {
    const merged = SOURCE.replace(
      '## Acceptance criteria\n\n- Every',
      '## Acceptance criteria\n- Every',
    )
    expect(contentFingerprint(merged)).not.toBe(contentFingerprint(SOURCE))
  })
})

const toCrlf = (text: string): string => text.replace(/\n/g, '\r\n')

describe('line endings (D-025)', () => {
  it('fingerprints LF, CRLF and mixed endings of the same content alike', () => {
    const mixed = SOURCE.replace('# Add readiness check\n', '# Add readiness check\r\n')
    expect(contentFingerprint(toCrlf(SOURCE))).toBe(contentFingerprint(SOURCE))
    expect(contentFingerprint(mixed)).toBe(contentFingerprint(SOURCE))
  })

  it('still sees a merged paragraph in CRLF content', () => {
    const merged = toCrlf(SOURCE).replace(
      '## Acceptance criteria\r\n\r\n- Every',
      '## Acceptance criteria\r\n- Every',
    )
    expect(contentFingerprint(merged)).not.toBe(contentFingerprint(SOURCE))
  })

  it('keeps an LF review when the file comes back as CRLF', async () => {
    await withFixtureProject(async (project) => {
      const id = ticketRecordId('t1')
      await recordReview(project, id, SOURCE)
      expect((await reviewStatus(project, id, toCrlf(SOURCE))).state).toBe('reviewed')
    })
  })

  it('keeps a CRLF review when the file comes back as LF', async () => {
    await withFixtureProject(async (project) => {
      const id = ticketRecordId('t1')
      await recordReview(project, id, toCrlf(SOURCE))
      expect((await reviewStatus(project, id, SOURCE)).state).toBe('reviewed')
    })
  })

  it('flags a real change made along with a line-ending change', async () => {
    await withFixtureProject(async (project) => {
      const id = ticketRecordId('t1')
      await recordReview(project, id, SOURCE)
      const changed = toCrlf(SOURCE.replace('verification or done', 'done only'))
      expect((await reviewStatus(project, id, changed)).state).toBe('changed_since_review')

      const retitled = toCrlf(SOURCE.replace('"Add readiness check"', '"Drop readiness check"'))
      expect((await reviewStatus(project, id, retitled)).state).toBe('changed_since_review')
    })
  })

  it('recovers a snapshot stored before D-025, with a fingerprint taken over CRLF', async () => {
    await withFixtureProject(async (project) => {
      const id = ticketRecordId('t1')
      const crlf = toCrlf(SOURCE)
      // As Git leaves it: the whole snapshot file checked out as CRLF, carrying a
      // fingerprint no current computation reproduces.
      const snapshot = toCrlf(
        [
          '---',
          'schema_version: 1',
          `record_id: ${JSON.stringify(id)}`,
          'reviewed_at: 2026-09-20T10:00:00.000Z',
          `reviewed_revision: ${revisionOf(SOURCE)}`,
          'content_fingerprint: computed-over-crlf-bytes',
          'note: ""',
          '---',
          '',
          SOURCE,
        ].join('\n'),
      )
      const directory = snapshotWriteDir(project.root, id)
      await mkdir(directory, { recursive: true })
      await writeFile(join(directory, '2026-09-20T10-00-00-000Z.md'), snapshot)

      expect((await reviewStatus(project, id, crlf)).state).toBe('reviewed')
      const reformatted = SOURCE.replace('# Add readiness check', '#  Add readiness check')
      expect((await reviewStatus(project, id, reformatted)).state).toBe('reviewed')
      const changed = crlf.replace('verification or done', 'done only')
      expect((await reviewStatus(project, id, changed)).state).toBe('changed_since_review')
    })
  })
})

describe('recording and retaining reviews', () => {
  it('starts unreviewed, which is distinct from reviewed', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'Work' })
      const id = ticketRecordId(ticket.frontmatter.id)
      const status = await reviewStatus(project, id, SOURCE)

      expect(status.state).toBe('unreviewed')
      expect(status.lastReview).toBeNull()
    })
  })

  it('reports reviewed content as reviewed', async () => {
    await withFixtureProject(async (project) => {
      const id = ticketRecordId('t1')
      await recordReview(project, id, SOURCE, { note: 'Checked the criteria.' })

      const status = await reviewStatus(project, id, SOURCE)
      expect(status.state).toBe('reviewed')
      expect(status.lastReview?.note).toBe('Checked the criteria.')
    })
  })

  it('keeps a review through a formatting-only edit (D-016)', async () => {
    await withFixtureProject(async (project) => {
      const id = ticketRecordId('t1')
      await recordReview(project, id, SOURCE)

      const reformatted = SOURCE.replace('# Add readiness check', '#  Add readiness check')
      const status = await reviewStatus(project, id, reformatted)
      expect(status.state).toBe('reviewed')
    })
  })

  it('keeps a review when the ticket merely moves along the board', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'Work' })
      const id = ticketRecordId(ticket.frontmatter.id)

      const { readFile } = await import('node:fs/promises')
      const { reservedPaths } = await import('./paths.js')
      const path = reservedPaths.ticketFile(project.root, ticket.frontmatter.id)

      await recordReview(project, id, await readFile(path, 'utf8'))
      await updateTicket(project, ticket.frontmatter.id, {
        expectedRevision: ticket.revision,
        status: 'in_progress',
      })

      const status = await reviewStatus(project, id, await readFile(path, 'utf8'))
      expect(status.state).toBe('reviewed')
    })
  })

  it('flags a meaningful change while retaining the prior review', async () => {
    await withFixtureProject(async (project) => {
      const id = ticketRecordId('t1')
      const first = await recordReview(project, id, SOURCE, { note: 'First pass.' })

      const changed = SOURCE.replace('verification or done', 'done only')
      const status = await reviewStatus(project, id, changed)

      expect(status.state).toBe('changed_since_review')
      expect(status.lastReview?.reviewedAt).toBe(first.reviewedAt)
      expect(status.lastReview?.note).toBe('First pass.')
      expect(status.changeSummary).toContain('has not been determined')
    })
  })

  it('does not claim the meaning changed, only that the content did', async () => {
    await withFixtureProject(async (project) => {
      const id = ticketRecordId('t1')
      await recordReview(project, id, SOURCE)

      // A typo fix is indistinguishable from a change of intent by comparison.
      const typoFixed = SOURCE.replace('prerequisite', 'prerequisites')
      const status = await reviewStatus(project, id, typoFixed)

      expect(status.state).toBe('changed_since_review')
      // The summary explicitly disclaims knowing whether the meaning changed,
      // and points at the retained snapshot so a person can decide.
      expect(status.changeSummary).toMatch(/whether the meaning changed has not been determined/i)
      expect(status.changeSummary).toMatch(/snapshot/i)
    })
  })

  it('keeps the reviewed source available for comparison', async () => {
    await withFixtureProject(async (project) => {
      const id = ticketRecordId('t1')
      await recordReview(project, id, SOURCE)
      expect(await reviewedSource(project, id)).toContain('verification or done')
    })
  })

  it('retains every review, so a later one does not erase the first', async () => {
    await withFixtureProject(async (project) => {
      const id = ticketRecordId('t1')
      await recordReview(project, id, SOURCE, { note: 'First.' })
      await new Promise((r) => setTimeout(r, 5))

      const changed = SOURCE.replace('verification or done', 'done only')
      await recordReview(project, id, changed, { note: 'Second.' })

      expect((await lastReview(project, id))?.note).toBe('Second.')
      expect((await reviewStatus(project, id, changed)).state).toBe('reviewed')
    })
  })
})

describe('who may record a review', () => {
  it('refuses an AI marking its own content as human-validated (D-003)', () => {
    expect(() => assertHumanReviewer('agent')).toThrow(/cannot validate its own output/i)
  })

  it('allows the user', () => {
    expect(() => assertHumanReviewer('user')).not.toThrow()
  })
})

describe('review does not block work (D-004)', () => {
  it('lets an unreviewed ticket move all the way through implementation', async () => {
    await withFixtureProject(async (project) => {
      const ticket = await createTicket(project, { title: 'Unreviewed work' })
      const id = ticketRecordId(ticket.frontmatter.id)

      const started = await updateTicket(project, ticket.frontmatter.id, {
        expectedRevision: ticket.revision,
        status: 'in_progress',
      })
      const verifying = await updateTicket(project, ticket.frontmatter.id, {
        expectedRevision: started.revision,
        status: 'verification',
      })

      expect(verifying.frontmatter.status).toBe('verification')

      const { readFile } = await import('node:fs/promises')
      const { reservedPaths } = await import('./paths.js')
      const source = await readFile(
        reservedPaths.ticketFile(project.root, ticket.frontmatter.id),
        'utf8',
      )
      // Still visibly unreviewed the whole way through.
      expect((await reviewStatus(project, id, source)).state).toBe('unreviewed')
      expect((await readTicket(project, ticket.frontmatter.id)).frontmatter.status).toBe(
        'verification',
      )
    })
  })
})
