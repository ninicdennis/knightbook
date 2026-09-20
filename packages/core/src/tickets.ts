import { randomUUID } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { isProjectError, ProjectError } from './errors.js'
import {
  assertNoConflictMarkers,
  assertSupportedSchema,
  parseRecord,
  serializeRecord,
  SUPPORTED_SCHEMA_VERSION,
} from './frontmatter.js'
import { RESERVED_DIR, reservedPaths } from './paths.js'
import type { Project } from './project.js'
import type { Revision } from './revision.js'
import {
  mutableStatusSchema,
  ticketFrontmatterSchema,
  type TicketFrontmatter,
  type TicketStatus,
} from './schema.js'
import { readRecord, writeRecord } from './write.js'

/**
 * Ticket records. Technical design section 5: each ticket is one file with a
 * stable UUID independent of its filename, so creating one needs no shared
 * counter and no second file.
 */

export interface Ticket {
  readonly frontmatter: TicketFrontmatter
  readonly body: string
  readonly revision: Revision
}

export interface CreateTicketInput {
  readonly title: string
  readonly body?: string
  readonly dependsOn?: string[]
  readonly relatedDocuments?: string[]
}

export async function createTicket(project: Project, input: CreateTicketInput): Promise<Ticket> {
  const now = new Date().toISOString()
  const frontmatter: TicketFrontmatter = {
    schema_version: SUPPORTED_SCHEMA_VERSION,
    id: randomUUID(),
    title: input.title,
    status: 'backlog',
    depends_on: input.dependsOn ?? [],
    created_at: now,
    updated_at: now,
    related_documents: input.relatedDocuments ?? [],
  }

  const body = input.body ?? defaultTicketBody(input.title)
  const content = renderTicket(frontmatter, body)
  const path = reservedPaths.ticketFile(project.root, frontmatter.id)
  const { revision } = await writeRecord(project.root, path, content, { mustNotExist: true })

  return { frontmatter, body, revision }
}

/**
 * Throws `invalid_record` unless the file is a ticket the app can trust. Reads
 * and writes both go through this, so a record that fails to load also refuses
 * to be edited (technical design section 3).
 */
function parseTicket(
  content: string,
  id: string,
): { frontmatter: TicketFrontmatter; body: string } {
  assertNoConflictMarkers(content, `tickets/${id}.md`)
  const record = parseRecord(content)
  assertSupportedSchema(record)

  const parsed = ticketFrontmatterSchema.safeParse(record.data.toJS())
  if (!parsed.success) {
    throw new ProjectError('invalid_record', `Ticket ${id} is not valid: ${parsed.error.message}`)
  }
  if (parsed.data.id !== id) {
    throw new ProjectError(
      'invalid_record',
      `Ticket file ${id}.md declares a different id (${parsed.data.id}).`,
    )
  }
  return { frontmatter: parsed.data, body: record.body }
}

export async function readTicket(project: Project, id: string): Promise<Ticket> {
  const path = reservedPaths.ticketFile(project.root, id)
  const { content, revision } = await readRecord(project.root, path)
  return { ...parseTicket(content, id), revision }
}

/** A ticket file that could not be used, and why. Its bytes are never touched. */
export interface TicketProblem {
  /** The id in the file name. The file's own id cannot be trusted when it is what is wrong. */
  readonly id: string
  /** Project-relative path, for showing to a person. */
  readonly file: string
  readonly code: string
  readonly reason: string
}

export interface TicketListing {
  readonly tickets: Ticket[]
  readonly problems: TicketProblem[]
}

/**
 * Every ticket file, sorted into the tickets that loaded and the files that did
 * not. One malformed ticket or an unresolved merge conflict must not take the
 * whole project down, so failures are collected rather than thrown.
 */
export async function listTicketRecords(project: Project): Promise<TicketListing> {
  let files: string[]
  try {
    files = await readdir(reservedPaths.ticketsDir(project.root))
  } catch {
    return { tickets: [], problems: [] }
  }

  const tickets: Ticket[] = []
  const problems: TicketProblem[] = []
  for (const file of files.filter((f) => f.endsWith('.md')).sort()) {
    const id = file.slice(0, -3)
    try {
      tickets.push(await readTicket(project, id))
    } catch (error) {
      problems.push(toProblem(id, file, error))
    }
  }
  return { tickets: sortByBacklogOrder(tickets, project.frontmatter.backlog_order), problems }
}

function toProblem(id: string, file: string, error: unknown): TicketProblem {
  const path = `${RESERVED_DIR}/tickets/${file}`
  if (isProjectError(error)) return { id, file: path, code: error.code, reason: error.message }
  return {
    id,
    file: path,
    code: 'not_readable',
    reason: `Could not be read: ${error instanceof Error ? error.message : String(error)}`,
  }
}

/** The tickets that loaded. Files that did not are reported by listTicketRecords. */
export async function listTickets(project: Project): Promise<Ticket[]> {
  return (await listTicketRecords(project)).tickets
}

/**
 * Manual order first, then creation time and stable id, so a ticket missing from
 * the manifest still has a deterministic place.
 */
export function sortByBacklogOrder(tickets: Ticket[], order: readonly string[]): Ticket[] {
  /*
   * A manifest can list the same ticket twice: an external edit or a Git merge
   * can produce it, and that duplicate is reported rather than deleted. Its
   * first position is the one that counts, so a stale entry further down the
   * list cannot outrank the position someone just asked for.
   */
  const rank = new Map<string, number>()
  order.forEach((id, index) => {
    if (!rank.has(id)) rank.set(id, index)
  })
  return [...tickets].sort((a, b) => {
    const ra = rank.get(a.frontmatter.id) ?? Number.POSITIVE_INFINITY
    const rb = rank.get(b.frontmatter.id) ?? Number.POSITIVE_INFINITY
    if (ra !== rb) return ra - rb
    if (a.frontmatter.created_at !== b.frontmatter.created_at) {
      return a.frontmatter.created_at < b.frontmatter.created_at ? -1 : 1
    }
    return a.frontmatter.id < b.frontmatter.id ? -1 : 1
  })
}

export interface UpdateTicketInput {
  readonly expectedRevision: Revision
  readonly title?: string
  readonly status?: TicketStatus
  readonly body?: string
  readonly dependsOn?: string[]
  readonly blocker?: string | null
}

/**
 * Ordinary lifecycle mutation. Section 6 requires that this cannot reach `done`:
 * completion carries the user's decision and goes through its own operation.
 */
export async function updateTicket(
  project: Project,
  id: string,
  input: UpdateTicketInput,
): Promise<Ticket> {
  if (input.status !== undefined && !mutableStatusSchema.safeParse(input.status).success) {
    throw new ProjectError(
      'invalid_transition',
      `A general update cannot set status to "${input.status}". ` +
        "Recording completion requires the user's explicit instruction through ticket_record_user_completion.",
    )
  }

  const path = reservedPaths.ticketFile(project.root, id)
  const { content } = await readRecord(project.root, path)
  // Refuse before changing anything: an invalid record stays exactly as it is.
  parseTicket(content, id)
  const record = parseRecord(content)

  if (input.title !== undefined) record.data.set('title', input.title)
  if (input.status !== undefined) record.data.set('status', input.status)
  if (input.dependsOn !== undefined) record.data.set('depends_on', input.dependsOn)
  if (input.blocker !== undefined) {
    if (input.blocker === null) record.data.delete('blocker')
    else record.data.set('blocker', input.blocker)
  }
  record.data.set('updated_at', new Date().toISOString())

  const next = serializeRecord(record, input.body ?? record.body)
  const { revision } = await writeRecord(project.root, path, next, {
    expectedRevision: input.expectedRevision,
  })

  return await readTicketAt(project, id, revision)
}

async function readTicketAt(project: Project, id: string, _revision: Revision): Promise<Ticket> {
  return await readTicket(project, id)
}

function defaultTicketBody(title: string): string {
  return [
    `# ${title}`,
    '',
    '## Intended outcome',
    '',
    '## Acceptance criteria',
    '',
    '## Progress',
    '',
    '## Verification',
    '',
  ].join('\n')
}

function renderTicket(frontmatter: TicketFrontmatter, body: string): string {
  const lines = [
    '---',
    `schema_version: ${frontmatter.schema_version}`,
    `id: ${frontmatter.id}`,
    `title: ${JSON.stringify(frontmatter.title)}`,
    `status: ${frontmatter.status}`,
    `depends_on: ${JSON.stringify(frontmatter.depends_on)}`,
    `created_at: ${frontmatter.created_at}`,
    `updated_at: ${frontmatter.updated_at}`,
    `related_documents: ${JSON.stringify(frontmatter.related_documents)}`,
    '---',
    '',
    body,
  ]
  return lines.join('\n')
}
