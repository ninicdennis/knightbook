import { randomUUID } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { Document } from 'yaml'
import { isProjectError, ProjectError } from '../records/errors.js'
import {
  assertNoConflictMarkers,
  assertSupportedSchema,
  parseRecord,
  serializeRecord,
  SUPPORTED_SCHEMA_VERSION,
} from '../records/frontmatter.js'
import { RESERVED_DIR, reservedPaths } from '../records/paths.js'
import type { Project } from '../records/project.js'
import type { Revision } from '../records/revision.js'
import { routineFrontmatterSchema, type RoutineFrontmatter } from '../records/schema.js'
import { readRecord, writeRecord } from '../records/write.js'
import { createTicket, listTicketRecords, type Ticket } from '../tickets/tickets.js'
import { routineHistory } from './routine-history.js'

/**
 * Routines (D-051): recurring work, such as a weekly package review, kept as
 * permanent instructions in `.projectspace/routines/<id>.md`. Starting a run
 * creates an ordinary Backlog ticket with a copy of the routine's title and
 * instructions and a `routine.id` pointing back. The routine file never records
 * a run, so its history is read from those tickets, and nothing here schedules
 * or executes anything.
 */

export interface Routine {
  readonly frontmatter: RoutineFrontmatter
  /** The instructions, as Markdown. */
  readonly body: string
  readonly revision: Revision
}

export interface CreateRoutineInput {
  readonly title: string
  readonly instructions?: string | undefined
}

export interface UpdateRoutineInput {
  readonly expectedRevision: Revision
  readonly title?: string | undefined
  /** Replaces the whole body. */
  readonly instructions?: string | undefined
}

export interface StartRunInput {
  /**
   * Start a run even though one is still open. Without it, an open run refuses
   * the start, so a scheduler firing twice cannot pile up duplicate tickets.
   */
  readonly anotherRun?: boolean | undefined
}

export interface RoutineProblem {
  readonly id: string
  readonly file: string
  readonly code: string
  readonly reason: string
}

export interface RoutineListing {
  readonly routines: Routine[]
  readonly problems: RoutineProblem[]
}

/** Throws `invalid_record` unless the file is a routine the app can trust. */
export function parseRoutine(
  content: string,
  id: string,
): { frontmatter: RoutineFrontmatter; body: string } {
  assertNoConflictMarkers(content, `routines/${id}.md`)
  const record = parseRecord(content)
  assertSupportedSchema(record)

  const parsed = routineFrontmatterSchema.safeParse(record.data.toJS())
  if (!parsed.success) {
    throw new ProjectError('invalid_record', `Routine ${id} is not valid: ${parsed.error.message}`)
  }
  if (parsed.data.id !== id) {
    throw new ProjectError(
      'invalid_record',
      `Routine file ${id}.md declares a different id (${parsed.data.id}).`,
    )
  }
  return { frontmatter: parsed.data, body: record.body }
}

function requireTitle(title: string): string {
  const trimmed = title.trim()
  if (trimmed === '') throw new ProjectError('invalid_record', 'A routine needs a title.')
  return trimmed
}

export async function createRoutine(project: Project, input: CreateRoutineInput): Promise<Routine> {
  const now = new Date().toISOString()
  const title = requireTitle(input.title)
  const frontmatter: RoutineFrontmatter = {
    schema_version: SUPPORTED_SCHEMA_VERSION,
    id: randomUUID(),
    title,
    created_at: now,
    updated_at: now,
  }
  const body = input.instructions ?? `# ${title}\n`
  const content = serializeRecord(
    { data: new Document(frontmatter), body, hadFrontmatter: true, eol: '\n' },
    body,
  )
  parseRoutine(content, frontmatter.id)

  const path = reservedPaths.routineFile(project.root, frontmatter.id)
  const { revision } = await writeRecord(project.root, path, content, { mustNotExist: true })
  return { frontmatter, body, revision }
}

export async function readRoutine(project: Project, id: string): Promise<Routine> {
  const path = reservedPaths.routineFile(project.root, id)
  const { content, revision } = await readRecord(project.root, path)
  return { ...parseRoutine(content, id), revision }
}

/** Every routine file, oldest first, with unreadable ones listed apart so one never hides the rest. */
export async function listRoutineRecords(project: Project): Promise<RoutineListing> {
  let files: string[]
  try {
    files = await readdir(reservedPaths.routinesDir(project.root))
  } catch {
    return { routines: [], problems: [] }
  }

  const routines: Routine[] = []
  const problems: RoutineProblem[] = []
  for (const file of files.filter((name) => name.endsWith('.md')).sort()) {
    const id = file.slice(0, -3)
    try {
      routines.push(await readRoutine(project, id))
    } catch (error) {
      const path = `${RESERVED_DIR}/routines/${file}`
      problems.push(
        isProjectError(error)
          ? { id, file: path, code: error.code, reason: error.message }
          : { id, file: path, code: 'not_readable', reason: String(error) },
      )
    }
  }
  routines.sort((a, b) =>
    a.frontmatter.created_at === b.frontmatter.created_at
      ? a.frontmatter.id.localeCompare(b.frontmatter.id)
      : a.frontmatter.created_at.localeCompare(b.frontmatter.created_at),
  )
  return { routines, problems }
}

/**
 * Edits the title or instructions at the revision the caller read. Runs already
 * started keep the copy they were given: their tickets are not touched.
 */
export async function updateRoutine(
  project: Project,
  id: string,
  input: UpdateRoutineInput,
): Promise<Routine> {
  const path = reservedPaths.routineFile(project.root, id)
  const { content } = await readRecord(project.root, path)
  parseRoutine(content, id)
  const record = parseRecord(content)

  if (input.title !== undefined) record.data.set('title', requireTitle(input.title))
  record.data.set('updated_at', new Date().toISOString())

  const next = serializeRecord(record, input.instructions ?? record.body)
  parseRoutine(next, id)
  await writeRecord(project.root, path, next, { expectedRevision: input.expectedRevision })
  return await readRoutine(project, id)
}

/**
 * Creates the next run: a Backlog ticket titled like the routine, whose body is
 * a copy of the instructions as they are now. An unfinished run that is still on
 * the board refuses the start with `run_already_open`, naming it, unless
 * `anotherRun` says a second one is deliberate. Done and archived runs never
 * block. The routine file is read, not written.
 */
export async function startRoutineRun(
  project: Project,
  id: string,
  input: StartRunInput = {},
): Promise<{ routine: Routine; ticket: Ticket }> {
  const routine = await readRoutine(project, id)
  if (!input.anotherRun) {
    const open = routineHistory(id, await listTicketRecords(project)).openRuns[0]
    if (open) {
      throw new ProjectError(
        'run_already_open',
        `Routine "${routine.frontmatter.title}" already has an open run: ticket ${open.id} ` +
          `("${open.title}"), in ${open.status}. Work on that one, or start another run deliberately.`,
      )
    }
  }
  const ticket = await createTicket(project, {
    title: routine.frontmatter.title,
    body: routine.body,
    routine: { id },
  })
  return { routine, ticket }
}
