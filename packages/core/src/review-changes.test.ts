import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { withFixtureProject } from './fixture-project.js'
import { compareSources, reviewChanges, type ChangeSection } from './review-changes.js'
import { snapshotWritePath } from './review-storage.js'
import { recordReview, ticketRecordId } from './review.js'

/**
 * The changes-since-review comparison (ticket 5be60610). It reads only, compares
 * against the last human review, and never treats a missing baseline as empty.
 */

const SOURCE = `---
schema_version: 1
id: 0f9c2b1e-5a7d-4c33-9b21-8e6f4a0d1c77
title: "Add readiness check"
status: backlog
depends_on: []
updated_at: 2026-09-01T10:15:00Z
---

# Add readiness check

## Acceptance criteria

- Every prerequisite must be in verification or done.
`

function changed(section: ChangeSection | undefined) {
  return section?.lines.filter((line) => line.kind !== 'context') ?? []
}

describe('compareSources', () => {
  it('reports identical bytes as identical, with nothing to show', () => {
    expect(compareSources(SOURCE, SOURCE)).toEqual({
      state: 'identical',
      sections: [],
      notes: [],
      tooLarge: null,
    })
  })

  it('shows a single changed line with numbers from the whole file', () => {
    const edited = SOURCE.replace('verification or done', 'done only')
    const result = compareSources(SOURCE, edited)
    const body = result.sections.find((section) => section.part === 'body')

    expect(result.state).toBe('changed')
    expect(result.sections.map((section) => section.part)).toEqual(['metadata', 'body'])
    expect(changed(body)).toEqual([
      expect.objectContaining({ kind: 'removed', oldNumber: 14, newNumber: null }),
      expect.objectContaining({ kind: 'added', oldNumber: null, newNumber: 14 }),
    ])
    expect(body?.added).toBe(1)
    expect(body?.removed).toBe(1)
  })

  it('numbers additions and deletions on their own side', () => {
    const edited = SOURCE.replace('## Acceptance criteria\n\n', '').concat('- A new line.\n')
    const body = compareSources(SOURCE, edited).sections.find((s) => s.part === 'body')

    expect(changed(body).map((line) => [line.kind, line.oldNumber, line.newNumber])).toEqual([
      ['removed', 12, null],
      ['removed', 13, null],
      ['added', null, 13],
    ])
  })

  it('labels a status change as bookkeeping and a title change as not', () => {
    const edited = SOURCE.replace('status: backlog', 'status: verification').replace(
      '"Add readiness check"',
      '"Add a readiness check"',
    )
    const metadata = compareSources(SOURCE, edited).sections.find((s) => s.part === 'metadata')
    const lines = changed(metadata)

    expect(lines.filter((line) => line.text.startsWith('status:'))).toEqual([
      expect.objectContaining({ bookkeeping: true }),
      expect.objectContaining({ bookkeeping: true }),
    ])
    expect(lines.filter((line) => line.text.startsWith('title:'))).toEqual([
      expect.objectContaining({ bookkeeping: false }),
      expect.objectContaining({ bookkeeping: false }),
    ])
  })

  it('treats a list under a bookkeeping field as that field', () => {
    const before = '---\nschema_version: 1\n---\n\nBody\n'
    const after = '---\nschema_version: 1\ncompletion:\n  recorded_by: user\n---\n\nBody\n'
    const metadata = compareSources(before, after).sections.find((s) => s.part === 'metadata')
    expect(changed(metadata).every((line) => line.bookkeeping)).toBe(true)
  })

  it('never labels body text as bookkeeping, whatever it looks like', () => {
    const edited = SOURCE.concat('status: done\n')
    const body = compareSources(SOURCE, edited).sections.find((s) => s.part === 'body')
    expect(changed(body)).toEqual([expect.objectContaining({ bookkeeping: false })])
  })

  it('handles a file with no frontmatter as body only', () => {
    const result = compareSources('# Notes\n\nOne\n', '# Notes\n\nTwo\n')
    expect(result.sections.map((section) => section.part)).toEqual(['body'])
  })

  it('reports line-ending and final-newline changes that a line view cannot show', () => {
    const crlf = SOURCE.replace(/\n/g, '\r\n')
    const result = compareSources(SOURCE, crlf.slice(0, -2))

    expect(result.state).toBe('changed')
    expect(result.sections.flatMap((section) => changed(section))).toEqual([])
    expect(result.notes).toEqual([
      'Line endings changed from LF to CRLF.',
      'The newline at the end of the file was removed.',
    ])
  })

  it('keeps unsafe HTML as the exact text it is', () => {
    const edited = SOURCE.concat('<img src=x onerror="alert(1)">\n')
    const body = compareSources(SOURCE, edited).sections.find((s) => s.part === 'body')
    expect(changed(body)[0]?.text).toBe('<img src=x onerror="alert(1)">')
  })

  it('refuses to compare a very large file line by line and says why', () => {
    const huge = SOURCE.concat('x\n'.repeat(20_001))
    const result = compareSources(SOURCE, huge)
    expect(result.state).toBe('too_large')
    expect(result.sections).toEqual([])
    expect(result.tooLarge).toMatch(/over 20,000 lines/)
  })

  it('gives up on two versions that differ almost everywhere', () => {
    const lines = (prefix: string) =>
      Array.from({ length: 6_000 }, (_, index) => `${prefix} ${index}`).join('\n')
    const result = compareSources(lines('old'), lines('new'))
    expect(result.state).toBe('too_large')
    expect(result.tooLarge).toMatch(/too many places/)
  })
})

describe('reviewChanges', () => {
  it('says there is no baseline rather than comparing against an empty document', async () => {
    await withFixtureProject(async (project) => {
      const result = await reviewChanges(project, ticketRecordId('t1'), SOURCE)
      expect(result.state).toBe('no_baseline')
      expect(result.lastReview).toBeNull()
      expect(result.sections).toEqual([])
      expect(result.substantive).toBeNull()
    })
  })

  it('compares against the most recent review', async () => {
    await withFixtureProject(async (project) => {
      const id = ticketRecordId('t1')
      await recordReview(project, id, SOURCE)
      await new Promise((resolve) => setTimeout(resolve, 5))
      const second = SOURCE.replace('verification or done', 'done only')
      await recordReview(project, id, second)

      const current = second.replace('done only', 'done, and reviewed')
      const result = await reviewChanges(project, id, current)
      const removed = result.sections.flatMap((s) => s.lines).find((l) => l.kind === 'removed')

      expect(result.state).toBe('changed')
      expect(removed?.text).toContain('done only')
      expect(result.substantive).toBe(true)
    })
  })

  it('shows a status-only change while saying review does not count it', async () => {
    await withFixtureProject(async (project) => {
      const id = ticketRecordId('t1')
      await recordReview(project, id, SOURCE)

      const result = await reviewChanges(project, id, SOURCE.replace('backlog', 'in_progress'))
      expect(result.state).toBe('changed')
      expect(result.substantive).toBe(false)
    })
  })

  it('notes a line-ending change and agrees with review status that it does not count', async () => {
    await withFixtureProject(async (project) => {
      const id = ticketRecordId('t1')
      await recordReview(project, id, SOURCE)

      const result = await reviewChanges(project, id, SOURCE.replace(/\n/g, '\r\n'))
      expect(result.notes).toContain('Line endings changed from LF to CRLF.')
      expect(result.substantive).toBe(false)
    })
  })

  it('reports identical content as identical', async () => {
    await withFixtureProject(async (project) => {
      const id = ticketRecordId('t1')
      const review = await recordReview(project, id, SOURCE)

      const result = await reviewChanges(project, id, SOURCE)
      expect(result.state).toBe('identical')
      expect(result.currentRevision).toBe(review.reviewedRevision)
    })
  })

  it('counts a corrupt snapshot instead of hiding it, and leaves it on disk', async () => {
    await withFixtureProject(async (project) => {
      const id = ticketRecordId('t1')
      const directory = join(project.root.path, snapshotWritePath(project.root, id))
      await mkdir(directory, { recursive: true })
      await writeFile(join(directory, 'broken.md'), '---\nreviewed_at: [unclosed\n---\n')

      const result = await reviewChanges(project, id, SOURCE)
      expect(result.state).toBe('no_baseline')
      expect(result.unreadableSnapshots).toBe(1)
    })
  })
})

describe('recordReview against the revision that was shown', () => {
  it('refuses a review when the content changed after it was shown', async () => {
    await withFixtureProject(async (project) => {
      const id = ticketRecordId('t1')
      const shown = (await reviewChanges(project, id, SOURCE)).currentRevision
      const edited = SOURCE.replace('backlog', 'in_progress')

      await expect(
        recordReview(project, id, edited, { expectedRevision: shown }),
      ).rejects.toMatchObject({ code: 'revision_conflict' })
      expect((await reviewChanges(project, id, edited)).state).toBe('no_baseline')
    })
  })

  it('records it when the content is what was shown', async () => {
    await withFixtureProject(async (project) => {
      const id = ticketRecordId('t1')
      const shown = (await reviewChanges(project, id, SOURCE)).currentRevision
      await recordReview(project, id, SOURCE, { expectedRevision: shown })
      expect((await reviewChanges(project, id, SOURCE)).state).toBe('identical')
    })
  })
})
