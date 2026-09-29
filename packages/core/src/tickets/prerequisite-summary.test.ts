import { describe, expect, it } from 'vitest'
import { evaluateReadiness, summarizePrerequisites } from './dependencies.js'
import type { TicketFrontmatter } from '../records/schema.js'

/**
 * What a card says about a ticket's prerequisites: how many are still unmet, and
 * whether every one is met. A blocker, a cycle and a failure further up the chain
 * each have their own badge, so none of them may turn into an unmet count.
 */

const ids = {
  subject: '10000000-0000-4000-8000-000000000001',
  first: '10000000-0000-4000-8000-000000000002',
  second: '10000000-0000-4000-8000-000000000003',
  upstream: '10000000-0000-4000-8000-000000000004',
  absent: '10000000-0000-4000-8000-000000000005',
}

function frontmatter(id: string, overrides: Partial<TicketFrontmatter> = {}): TicketFrontmatter {
  return {
    schema_version: 1,
    id,
    title: `Ticket ${id.slice(-1)}`,
    status: 'backlog',
    depends_on: [],
    created_at: '2026-09-29T08:00:00.000Z',
    updated_at: '2026-09-29T08:00:00.000Z',
    related_documents: [],
    ...overrides,
  } as TicketFrontmatter
}

function failure(reason: string): TicketFrontmatter['verification_issue'] {
  return {
    reason,
    decision_source: 'direct_user_action',
    recorded_by: 'user',
    recorded_at: '2026-09-29T09:00:00.000Z',
  }
}

function summarize(
  subject: TicketFrontmatter,
  others: TicketFrontmatter[],
  unreadable: ReadonlySet<string> = new Set(),
) {
  const all = new Map([subject, ...others].map((t) => [t.id, t]))
  return summarizePrerequisites(subject, evaluateReadiness(subject, all, unreadable))
}

describe('summarizing prerequisites for a card', () => {
  it('counts a prerequisite whose file could not be read as unmet', () => {
    const subject = frontmatter(ids.subject, { depends_on: [ids.absent] })

    const summary = summarize(subject, [], new Set([ids.absent]))

    expect(summary.unmet.map((reason) => reason.kind)).toEqual(['prerequisite_unreadable'])
    expect(summary.allMet).toBe(false)
  })

  it('leaves the count and Unlocked alone when the ticket itself failed verification', () => {
    const subject = frontmatter(ids.subject, {
      depends_on: [ids.first],
      verification_issue: failure('Not what was asked for'),
    })

    const summary = summarize(subject, [frontmatter(ids.first, { status: 'done' })])

    expect(summary.unmet).toEqual([])
    expect(summary.allMet).toBe(true)
  })

  it('treats a ticket that depends on itself as a cycle, not as waiting', () => {
    const subject = frontmatter(ids.subject, { depends_on: [ids.subject] })

    const readiness = evaluateReadiness(subject, new Map([[subject.id, subject]]))
    const summary = summarizePrerequisites(subject, readiness)

    expect(readiness.reasons.map((reason) => reason.kind)).toContain('dependency_cycle')
    expect(summary.unmet).toEqual([])
    expect(summary.allMet).toBe(false)
  })

  it('counts only the prerequisites that are not in Verification or Done', () => {
    const subject = frontmatter(ids.subject, { depends_on: [ids.first, ids.second] })

    const summary = summarize(subject, [
      frontmatter(ids.first, { status: 'done' }),
      frontmatter(ids.second, { status: 'in_progress' }),
    ])

    expect(summary.unmet.map((reason) => reason.kind)).toEqual(['prerequisite_not_ready'])
    expect(summary.allMet).toBe(false)
  })

  it('counts a missing, an archived unfinished and a failed prerequisite as unmet', () => {
    const subject = frontmatter(ids.subject, {
      depends_on: [ids.first, ids.second, ids.absent],
    })

    const summary = summarize(subject, [
      frontmatter(ids.first, {
        status: 'backlog',
        archived: { archived_at: '2026-09-29T09:00:00.000Z' },
      }),
      frontmatter(ids.second, { status: 'verification', verification_issue: failure('Wrong') }),
    ])

    expect(summary.unmet.map((reason) => reason.kind).sort()).toEqual([
      'prerequisite_archived',
      'prerequisite_failed_verification',
      'prerequisite_missing',
    ])
    expect(summary.allMet).toBe(false)
  })

  it('counts a reopened prerequisite that also failed verification once', () => {
    const subject = frontmatter(ids.subject, { depends_on: [ids.first] })

    const summary = summarize(subject, [
      frontmatter(ids.first, { status: 'in_progress', verification_issue: failure('Wrong') }),
    ])

    expect(summary.unmet).toHaveLength(1)
  })

  it('is all met when every prerequisite is in Verification or Done, even with a blocker', () => {
    const subject = frontmatter(ids.subject, {
      depends_on: [ids.first, ids.second],
      blocker: 'Deferred until the user decides.',
    })

    const summary = summarize(subject, [
      frontmatter(ids.first, { status: 'verification' }),
      frontmatter(ids.second, { status: 'done' }),
    ])

    expect(summary.unmet).toEqual([])
    expect(summary.allMet).toBe(true)
  })

  it('is neither unmet nor all met for a ticket with no prerequisites, blocked or not', () => {
    const summary = summarize(frontmatter(ids.subject, { blocker: 'Waiting upstream.' }), [])

    expect(summary.unmet).toEqual([])
    expect(summary.allMet).toBe(false)
  })

  it('does not count a failure further up the chain, and does not call it all met', () => {
    const subject = frontmatter(ids.subject, { depends_on: [ids.first] })

    const summary = summarize(subject, [
      frontmatter(ids.first, { status: 'verification', depends_on: [ids.upstream] }),
      frontmatter(ids.upstream, { status: 'done', verification_issue: failure('Wrong') }),
    ])

    expect(summary.unmet).toEqual([])
    expect(summary.allMet).toBe(false)
  })

  it('does not count a cycle as unmet, and does not call a cycle all met', () => {
    const subject = frontmatter(ids.subject, { depends_on: [ids.first] })

    const summary = summarize(subject, [
      frontmatter(ids.first, { status: 'verification', depends_on: [ids.subject] }),
    ])

    expect(summary.unmet).toEqual([])
    expect(summary.allMet).toBe(false)
  })
})
