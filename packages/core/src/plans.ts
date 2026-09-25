import { randomUUID } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { Document } from 'yaml'
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
import { planFrontmatterSchema, type PlanFrontmatter, type PlanPhase } from './schema.js'
import { readRecord, writeRecord } from './write.js'

/**
 * Plan records: one file per plan in `.projectspace/plans/`, found by listing the
 * folder the way tickets are, so a project written before plans existed simply
 * has none and needs no migration. A plan references tickets by id and stores
 * nothing about them, so it can never disagree with the board.
 */

export interface Plan {
  readonly frontmatter: PlanFrontmatter
  readonly body: string
  readonly revision: Revision
}

/** A phase as a caller writes it. Leaving out `id` asks for a new phase. */
export interface PhaseInput {
  readonly id?: string | undefined
  readonly title: string
  readonly scope?: string | undefined
  readonly value?: string | undefined
  readonly tickets?: readonly string[] | undefined
}

export interface CreatePlanInput {
  readonly title: string
  readonly body?: string | undefined
  readonly phases?: readonly PhaseInput[] | undefined
}

export interface UpdatePlanInput {
  readonly expectedRevision: Revision
  readonly title?: string
  readonly body?: string
  /** Replaces every phase, in order. Omitted keeps the phases the plan has. */
  readonly phases?: readonly PhaseInput[]
}

export interface PlanProblem {
  readonly id: string
  readonly file: string
  readonly code: string
  readonly reason: string
}

export interface PlanListing {
  readonly plans: Plan[]
  readonly problems: PlanProblem[]
}

/**
 * Gives new phases a readable id (`p1`, `p2`, …) that no phase in the plan uses,
 * and refuses a plan that would be ambiguous: two phases with one id, or one
 * ticket listed twice in the same phase.
 */
export function normalizePhases(inputs: readonly PhaseInput[]): PlanPhase[] {
  const taken = new Set(inputs.flatMap((phase) => (phase.id ? [phase.id] : [])))
  let next = 1
  const seen = new Set<string>()

  return inputs.map((input) => {
    let id = input.id
    if (!id) {
      while (taken.has(`p${next}`)) next += 1
      id = `p${next}`
      taken.add(id)
    }
    if (seen.has(id)) {
      throw new ProjectError('invalid_record', `Two phases share the id "${id}".`)
    }
    seen.add(id)

    const tickets = [...(input.tickets ?? [])]
    const repeated = tickets.find((ticket, index) => tickets.indexOf(ticket) !== index)
    if (repeated) {
      throw new ProjectError(
        'invalid_record',
        `Phase "${input.title}" lists ticket ${repeated} twice. List each ticket once per phase.`,
      )
    }
    return {
      id,
      title: input.title,
      ...(input.scope !== undefined ? { scope: input.scope } : {}),
      ...(input.value !== undefined ? { value: input.value } : {}),
      tickets,
    }
  })
}

/** Throws `invalid_record` unless the file is a plan the app can trust. */
export function parsePlan(
  content: string,
  id: string,
): { frontmatter: PlanFrontmatter; body: string } {
  assertNoConflictMarkers(content, `plans/${id}.md`)
  const record = parseRecord(content)
  assertSupportedSchema(record)

  const parsed = planFrontmatterSchema.safeParse(record.data.toJS())
  if (!parsed.success) {
    throw new ProjectError('invalid_record', `Plan ${id} is not valid: ${parsed.error.message}`)
  }
  if (parsed.data.id !== id) {
    throw new ProjectError(
      'invalid_record',
      `Plan file ${id}.md declares a different id (${parsed.data.id}).`,
    )
  }
  const ids = parsed.data.phases.map((phase) => phase.id)
  const repeated = ids.find((phaseId, index) => ids.indexOf(phaseId) !== index)
  if (repeated) {
    throw new ProjectError('invalid_record', `Plan ${id} has two phases with the id "${repeated}".`)
  }
  return { frontmatter: parsed.data, body: record.body }
}

export async function createPlan(project: Project, input: CreatePlanInput): Promise<Plan> {
  const now = new Date().toISOString()
  const frontmatter: PlanFrontmatter = {
    schema_version: SUPPORTED_SCHEMA_VERSION,
    id: randomUUID(),
    title: input.title,
    phases: normalizePhases(input.phases ?? []),
    created_at: now,
    updated_at: now,
  }
  const body = input.body ?? `# ${input.title}\n`
  const content = serializeRecord(
    { data: new Document(frontmatter), body, hadFrontmatter: true, eol: '\n' },
    body,
  )
  parsePlan(content, frontmatter.id)

  const path = reservedPaths.planFile(project.root, frontmatter.id)
  const { revision } = await writeRecord(project.root, path, content, { mustNotExist: true })
  return { frontmatter, body, revision }
}

export async function readPlan(project: Project, id: string): Promise<Plan> {
  const path = reservedPaths.planFile(project.root, id)
  const { content, revision } = await readRecord(project.root, path)
  return { ...parsePlan(content, id), revision }
}

/**
 * Every plan file, sorted by creation, with the ones that could not be read
 * listed separately so a single broken plan never hides the others.
 */
export async function listPlanRecords(project: Project): Promise<PlanListing> {
  let files: string[]
  try {
    files = await readdir(reservedPaths.plansDir(project.root))
  } catch {
    return { plans: [], problems: [] }
  }

  const plans: Plan[] = []
  const problems: PlanProblem[] = []
  for (const file of files.filter((name) => name.endsWith('.md')).sort()) {
    const id = file.slice(0, -3)
    try {
      plans.push(await readPlan(project, id))
    } catch (error) {
      const path = `${RESERVED_DIR}/plans/${file}`
      problems.push(
        isProjectError(error)
          ? { id, file: path, code: error.code, reason: error.message }
          : { id, file: path, code: 'not_readable', reason: String(error) },
      )
    }
  }
  plans.sort((a, b) =>
    a.frontmatter.created_at === b.frontmatter.created_at
      ? a.frontmatter.id.localeCompare(b.frontmatter.id)
      : a.frontmatter.created_at.localeCompare(b.frontmatter.created_at),
  )
  return { plans, problems }
}

/**
 * Edits owned fields through the YAML document, so fields a later version or a
 * person added at the top level survive. Attaching or detaching tickets is a
 * phases edit; it never touches any ticket.
 */
export async function updatePlan(
  project: Project,
  id: string,
  input: UpdatePlanInput,
): Promise<Plan> {
  const path = reservedPaths.planFile(project.root, id)
  const { content } = await readRecord(project.root, path)
  parsePlan(content, id)
  const record = parseRecord(content)

  if (input.title !== undefined) record.data.set('title', input.title)
  if (input.phases !== undefined) record.data.set('phases', normalizePhases(input.phases))
  record.data.set('updated_at', new Date().toISOString())

  const next = serializeRecord(record, input.body ?? record.body)
  parsePlan(next, id)
  await writeRecord(project.root, path, next, { expectedRevision: input.expectedRevision })
  return await readPlan(project, id)
}

export interface PhaseMembership {
  readonly planId: string
  readonly planTitle: string
  readonly phaseId: string
  readonly phaseTitle: string
}

/** Every phase, in every plan that loaded, that lists this ticket, in plan and phase order. */
export function phasesContaining(plans: readonly Plan[], ticketId: string): PhaseMembership[] {
  return plans.flatMap((plan) =>
    plan.frontmatter.phases
      .filter((phase) => phase.tickets.includes(ticketId))
      .map((phase) => ({
        planId: plan.frontmatter.id,
        planTitle: plan.frontmatter.title,
        phaseId: phase.id,
        phaseTitle: phase.title,
      })),
  )
}
