import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
