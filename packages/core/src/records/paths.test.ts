import { mkdir, mkdtemp, readFile, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, win32 } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectError } from './errors.js'
import { relativeToRoot, resolveProjectRoot } from './paths.js'
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

/**
 * Found on Windows: including a folder through the app's picker failed with "Path
 * must be project-relative: C:\Users\Denny\Projects\car-meet-app\docs". The dialog
 * returns absolute paths in the platform's form; these use Windows rules on any OS.
 */
describe('making a picked absolute path project-relative', () => {
  const root = 'C:\\Users\\Denny\\Projects\\car-meet-app'

  it('turns a folder or file under the root into a forward-slash relative path', () => {
    expect(relativeToRoot(root, `${root}\\docs`, win32)).toBe('docs')
    expect(relativeToRoot(root, `${root}\\docs\\guides\\setup.md`, win32)).toBe(
      'docs/guides/setup.md',
    )
  })

  it('matches the root regardless of letter case, as Windows does', () => {
    expect(relativeToRoot(root, 'c:\\users\\denny\\projects\\car-meet-app\\docs', win32)).toBe(
      'docs',
    )
  })

  it('keeps a folder whose name merely starts with two dots', () => {
    expect(relativeToRoot(root, `${root}\\..notes`, win32)).toBe('..notes')
  })

  it('refuses a path beside the root, on another drive, or above it', () => {
    for (const outside of [
      'C:\\Users\\Denny\\Projects\\car-meet-app-old\\docs',
      'D:\\car-meet-app\\docs',
      'C:\\Users\\Denny\\Projects',
    ]) {
      expect(() => relativeToRoot(root, outside, win32)).toThrow(ProjectError)
    }
  })
})
