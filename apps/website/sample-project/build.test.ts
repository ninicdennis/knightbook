import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  isUnattributedCompletion,
  listIncludedDocuments,
  listPlanRecords,
  listTickets,
  openProject,
  reviewStatus,
  ticketReviewStatus,
  type Project,
  type Ticket,
} from '../../../packages/core/src/index.ts'
import { buildSampleProject } from './build.ts'
import { DOCUMENTS, TICKETS } from './content.ts'

/**
 * Builds Seedling into a temporary folder and reads it back through core, the
 * way the app would, to check it shows what the screenshots need (ticket
 * 90c7aba5) and contains nothing real.
 */

let root: string
let project: Project
let tickets: Ticket[]

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'knightbook-seedling-'))
  await buildSampleProject(root)
  project = await openProject(root)
  tickets = await listTickets(project)
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

const byTitle = (title: string) => tickets.find((ticket) => ticket.frontmatter.title === title)!

describe('the Seedling sample project', () => {
  it('is named Seedling and includes its three documents', async () => {
    expect(project.frontmatter.name).toBe('Seedling')
    const { documents, problems } = await listIncludedDocuments(project)
    expect(problems).toEqual([])
    expect(documents.map((document) => document.path).sort()).toEqual(Object.keys(DOCUMENTS).sort())
  })

  it('has tickets in all four columns, of every type', () => {
    expect(tickets).toHaveLength(TICKETS.length)
    const count = (status: string) =>
      tickets.filter((ticket) => ticket.frontmatter.status === status).length
    expect(count('backlog')).toBe(5)
    expect(count('in_progress')).toBe(1)
    expect(count('verification')).toBe(1)
    expect(count('done')).toBe(3)
    expect(new Set(tickets.map((ticket) => ticket.frontmatter.type))).toEqual(
      new Set(['feature', 'bug', 'task', 'research', 'documentation']),
    )
  })

  it('has one ticket in Verification with a handoff note under its four headings', () => {
    const verifying = tickets.filter((ticket) => ticket.frontmatter.status === 'verification')
    expect(verifying.map((ticket) => ticket.frontmatter.title)).toEqual([
      'Water reminders for each bed',
    ])
    const body = verifying[0]!.body
    for (const heading of [
      '## Handoff',
      '### What changed',
      '### How it was checked',
      '### Not verified',
      '### For you to check',
    ]) {
      expect(body).toContain(heading)
    }
  })

  it('records every Done ticket as accepted by the user, not unattributed', () => {
    for (const ticket of tickets.filter((t) => t.frontmatter.status === 'done')) {
      expect(ticket.frontmatter.completion?.decision_source, ticket.frontmatter.title).toBe(
        'direct_user_action',
      )
      expect(isUnattributedCompletion(ticket), ticket.frontmatter.title).toBe(false)
    }
  })

  it('shows a blocked ticket and tickets waiting on a prerequisite', () => {
    expect(byTitle('Keep a plan in step between a phone and a laptop').frontmatter.blocker).toMatch(
      /Waiting on a decision/,
    )
    const sowing = byTitle('List seed packets by sowing date')
    expect(sowing.frontmatter.depends_on).toEqual([
      byTitle("Show last frost dates for the gardener's region").frontmatter.id,
    ])
  })

  it('has reviewed and unreviewed documents and tickets, for both review states', async () => {
    const documentState = async (path: string) =>
      (await reviewStatus(project, `document:${path}`, DOCUMENTS[path]!)).state
    expect(await documentState('docs/planting-calendar.md')).toBe('reviewed')
    expect(await documentState('docs/decisions.md')).toBe('unreviewed')
    const ticketState = async (title: string) =>
      (await ticketReviewStatus(project, byTitle(title).frontmatter.id)).state
    expect(await ticketState('Create garden beds with a width and length')).toBe('reviewed')
    expect(await ticketState('Drag plants onto the bed grid')).toBe('unreviewed')
  })

  it('has the Spring release plan with three phases covering every ticket', async () => {
    const { plans, problems } = await listPlanRecords(project)
    expect(problems).toEqual([])
    expect(plans).toHaveLength(1)
    const plan = plans[0]!
    expect(plan.frontmatter.title).toBe('Spring release')
    expect(plan.frontmatter.phases.map((phase) => phase.title)).toEqual([
      'Plan the beds',
      'Keep it growing',
      'Share the plan',
    ])
    const planned = plan.frontmatter.phases.flatMap((phase) => phase.tickets)
    const unplanned = tickets.filter((ticket) => !planned.includes(ticket.frontmatter.id))
    expect(unplanned.map((ticket) => ticket.frontmatter.title)).toEqual([
      'Compare sources of companion-planting data',
    ])
  })

  it('contains nothing from a real project: no paths, names, emails or Knightbook work', async () => {
    const files = (await readdir(root, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name))
    for (const file of files) {
      const text = await readFile(file, 'utf8')
      expect(text, file).not.toMatch(/knightbook|projectspace\b(?!\/)|ninicdennis|denny/i)
      expect(text, file).not.toMatch(/[A-Z]:\\|\/home\/|\/Users\/|@[a-z0-9-]+\.[a-z]{2,}/)
    }
  })
})
