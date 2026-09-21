import { mkdir, mkdtemp, readFile, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveProjectRoot } from './paths.js'
import { initializeProject } from './project.js'

/**
 * Found by CI on macOS, where the temporary directory is /var/folders/... and /var
 * is a symlink to /private/var. Initializing a project in a folder that did not
 * exist yet kept the unresolved path as its root, then failed because every real
 * path it checked resolved to /private/var: "outside the project". Any symlinked
 * parent triggers it, so this reproduces on every platform.
 */

let sandbox: string
let realDir: string
let linkedDir: string

beforeEach(async () => {
  sandbox = await realpath(await mkdtemp(join(tmpdir(), 'knightbook-paths-')))
  realDir = join(sandbox, 'real')
  linkedDir = join(sandbox, 'link')
  await mkdir(realDir)
  // 'junction' is what Windows allows without elevation; other platforms ignore it.
  await symlink(realDir, linkedDir, 'junction')
})

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true })
})

describe('resolving a project root that does not exist yet', () => {
  it('resolves a symlinked parent, keeping the part that does not exist', async () => {
    const root = await resolveProjectRoot(join(linkedDir, 'new-project'))

    expect(root.path).toBe(join(realDir, 'new-project'))
  })

  it('resolves through several missing levels', async () => {
    const root = await resolveProjectRoot(join(linkedDir, 'a', 'b', 'c'))

    expect(root.path).toBe(join(realDir, 'a', 'b', 'c'))
  })

  it('leaves a path with no symlinks as it was', async () => {
    const plain = join(realDir, 'plain', 'project')

    expect((await resolveProjectRoot(plain)).path).toBe(plain)
  })

  it('still resolves a root that already exists', async () => {
    expect((await resolveProjectRoot(linkedDir)).path).toBe(realDir)
  })

  it('lets a project be initialized there, with its files landing in the real folder', async () => {
    const project = await initializeProject(join(linkedDir, 'new-project'), { name: 'Linked' })

    expect(project.root.path).toBe(join(realDir, 'new-project'))
    const manifest = await readFile(
      join(realDir, 'new-project', '.projectspace', 'project.md'),
      'utf8',
    )
    expect(manifest).toContain('"Linked"')
  })
})
