import { randomUUID } from 'node:crypto'
import { access, mkdir, readdir } from 'node:fs/promises'
import { basename } from 'node:path'
import { ProjectError } from './errors.js'
import {
  assertNoConflictMarkers,
  assertSupportedSchema,
  parseRecord,
  serializeRecord,
  SUPPORTED_SCHEMA_VERSION,
} from './frontmatter.js'
import { RESERVED_DIR, reservedPaths, resolveProjectRoot, type ProjectRoot } from './paths.js'
import { projectFrontmatterSchema, type ProjectFrontmatter } from './schema.js'
import { readRecord, writeRecord } from './write.js'
import type { Revision } from './revision.js'

/**
 * Project identity and the manifest. Technical design section 3: initialization
 * adds the reserved folder only when absent and never overwrites an unrelated
 * directory. Section 4: the project UUID is logical identity, while each local
 * checkout keeps its own root path.
 */

export interface Project {
  readonly root: ProjectRoot
  readonly frontmatter: ProjectFrontmatter
  readonly body: string
  readonly revision: Revision
}

export async function projectExists(root: ProjectRoot): Promise<boolean> {
  try {
    await access(reservedPaths.projectFile(root))
    return true
  } catch {
    return false
  }
}

export async function initializeProject(
  rootPath: string,
  options: { name?: string } = {},
): Promise<Project> {
  const root = await resolveProjectRoot(rootPath)

  if (await projectExists(root)) {
    throw new ProjectError(
      'already_exists',
      `${root.path} is already a Knightbook project. Open it instead of initializing it.`,
    )
  }
  await assertReservedDirIsOurs(root)

  const now = new Date().toISOString()
  const frontmatter: ProjectFrontmatter = {
    schema_version: SUPPORTED_SCHEMA_VERSION,
    id: randomUUID(),
    name: options.name ?? basename(root.path),
    documents_include: [],
    backlog_order: [],
  }

  const content = renderProject(frontmatter, `# ${frontmatter.name}\n`, now)
  await mkdir(reservedPaths.ticketsDir(root), { recursive: true })
  const { revision } = await writeRecord(root, reservedPaths.projectFile(root), content, {
    mustNotExist: true,
  })

  return { root, frontmatter, body: `# ${frontmatter.name}\n`, revision }
}

/**
 * A `.projectspace` directory that exists but holds no project file may be an
 * unrelated folder that happens to share the name. Refuse rather than write into
 * it.
 */
async function assertReservedDirIsOurs(root: ProjectRoot): Promise<void> {
  let entries: string[]
  try {
    entries = await readdir(reservedPaths.dir(root))
  } catch {
    return // Absent, which is the normal case.
  }
  // `runtime` holds our own coordination state (MCP session heartbeats), so it
  // is ours in the same way the record folders are, not a sign of a stranger.
  const ours = ['tickets', 'documents', 'reviews', 'runtime', '.write-lock']
  const unexpected = entries.filter((e) => !ours.includes(e))
  if (unexpected.length > 0) {
    throw new ProjectError(
      'already_exists',
      `${RESERVED_DIR}/ already exists and holds unrelated files (${unexpected.join(', ')}). ` +
        'Initialization stopped without changing anything.',
    )
  }
}

export async function openProject(rootPath: string): Promise<Project> {
  const root = await resolveProjectRoot(rootPath)
  const path = reservedPaths.projectFile(root)
  const { content, revision } = await readRecord(root, path)

  assertNoConflictMarkers(content, `${RESERVED_DIR}/project.md`)
  const record = parseRecord(content)
  assertSupportedSchema(record)

  const parsed = projectFrontmatterSchema.safeParse(record.data.toJS())
  if (!parsed.success) {
    throw new ProjectError('invalid_record', `project.md is not valid: ${parsed.error.message}`)
  }

  return { root, frontmatter: parsed.data, body: record.body, revision }
}

/** Reordering the backlog edits only the manifest, never ticket files. */
export async function setBacklogOrder(project: Project, order: string[]): Promise<Project> {
  const path = reservedPaths.projectFile(project.root)
  const { content, revision } = await readRecord(project.root, path)
  const record = parseRecord(content)
  record.data.set('backlog_order', order)

  const next = serializeRecord(record)
  const written = await writeRecord(project.root, path, next, { expectedRevision: revision })
  return {
    ...project,
    frontmatter: { ...project.frontmatter, backlog_order: order },
    revision: written.revision,
  }
}

function renderProject(frontmatter: ProjectFrontmatter, body: string, _now: string): string {
  const lines = [
    '---',
    `schema_version: ${frontmatter.schema_version}`,
    `id: ${frontmatter.id}`,
    `name: ${JSON.stringify(frontmatter.name)}`,
    'documents_include: []',
    'backlog_order: []',
    '---',
    '',
    body,
  ]
  return lines.join('\n')
}
