import { mkdtemp, readdir, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { call, callExpectingError, connect } from './client.js'
import { packagedResources, requireWhenAsked } from './packaged.js'
import { removeWorkspace, REPO_ROOT } from './stage.js'

/**
 * The same checks as packaging.test.ts, but against the output of a real
 * `electron-builder --dir` build rather than a staged copy. This is what
 * technical design section 11 actually asks for: the installed resources path,
 * the saved client command, and no GUI.
 *
 * Skipped when the packaged build is absent, so the suite still runs on a
 * machine that has not built the app. Produce it with
 * `pnpm --filter @knightbook/desktop pack:dir`.
 */

const resources = await packagedResources()
requireWhenAsked(resources, 'a packaged app')

const describePackaged = resources ? describe : describe.skip

let workspace: string
let projectRoot: string

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'knightbook-packaged-'))
  projectRoot = join(workspace, 'project')
})

afterAll(async () => {
  await removeWorkspace(workspace)
})

/** Every file under a folder, by relative path, so two copies can be compared whole. */
async function folderContents(dir: string): Promise<Record<string, string>> {
  const contents: Record<string, string> = {}
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const path = join(entry.parentPath, entry.name)
    contents[relative(dir, path).split(sep).join('/')] = await readFile(path, 'utf8')
  }
  return contents
}

describePackaged('the installed application', () => {
  // The app installs and exports this copy, so it must be the repository's, whole.
  it('ships the complete workflow skill, identical to its one source', async () => {
    const shipped = await folderContents(join(resources!.resourcesDir, 'skills', 'projectspace'))
    const source = await folderContents(join(REPO_ROOT, 'skills', 'projectspace'))
    expect(Object.keys(shipped)).toContain('SKILL.md')
    expect(shipped).toEqual(source)
  })

  it('keeps the MCP runtime outside the ASAR archive', async () => {
    const asar = await stat(join(resources!.resourcesDir, 'app.asar'))
    const runtime = await stat(resources!.nodePath)
    expect(asar.isFile()).toBe(true)
    expect(runtime.isFile()).toBe(true)
  })

  it('drives a full lifecycle with no Node on PATH and no GUI running', async () => {
    const connection = await connect(resources!, projectRoot, workspace)
    try {
      const project = await call(connection, 'project_initialize', { name: 'Packaged' })
      expect(project['name']).toBe('Packaged')

      const created = await call(connection, 'ticket_create', { title: 'Ship it' })
      const id = created['id'] as string

      const started = await call(connection, 'ticket_update', {
        id,
        expected_revision: created['revision'],
        status: 'in_progress',
      })
      const verifying = await call(connection, 'ticket_update', {
        id,
        expected_revision: started['revision'],
        status: 'verification',
      })

      // Reaching Verification with passing checks is still not the user decision.
      const refused = await callExpectingError(connection, 'ticket_record_user_completion', {
        id,
        expected_revision: verifying['revision'],
        user_instructed_completion: false,
        instruction: 'Tests are green.',
      })
      expect(refused).toContain('invalid_transition')

      const done = await call(connection, 'ticket_record_user_completion', {
        id,
        expected_revision: verifying['revision'],
        user_instructed_completion: true,
        instruction: 'User confirmed completion in chat.',
      })
      expect(done['status']).toBe('done')

      const file = await readFile(join(projectRoot, '.projectspace', 'tickets', `${id}.md`), 'utf8')
      expect(file).toContain('decision_source: reported_user_instruction')
    } finally {
      await connection.close()
    }
  })

  it('shows the same records to a second, independent connection', async () => {
    const connection = await connect(resources!, projectRoot, workspace)
    try {
      const project = await call(connection, 'project_get')
      expect(project['name']).toBe('Packaged')
      expect((project['ticket_counts'] as Record<string, number>)['done']).toBe(1)
    } finally {
      await connection.close()
    }
  })
})
