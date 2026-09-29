import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseRecord, serializeRecord } from '../records/frontmatter.js'
import { reservedPaths } from '../records/paths.js'
import { initializeProject, type Project } from '../records/project.js'

/** A throwaway project on disk, so tests exercise the real filesystem path. */
export async function withFixtureProject(run: (project: Project) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'knightbook-test-'))
  try {
    await run(await initializeProject(dir, { name: 'Fixture' }))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * Writes a ticket's prerequisites straight into its file, as a person editing it
 * by hand would. `updateTicket` refuses a cycle or an unknown id (D-032), so this
 * is the only way such a reference reaches a file, and readiness still has to
 * report it.
 */
export async function setDependenciesByHand(
  project: Project,
  id: string,
  dependsOn: string[],
): Promise<void> {
  const path = reservedPaths.ticketFile(project.root, id)
  const record = parseRecord(await readFile(path, 'utf8'))
  record.data.set('depends_on', dependsOn)
  await writeFile(path, serializeRecord(record, record.body))
}
