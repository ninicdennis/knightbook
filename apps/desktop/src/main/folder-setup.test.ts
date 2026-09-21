// @vitest-environment node
import { ProjectError, openProject } from '@knightbook/core'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { explainSetupFailure, inspectFolder, setUpFolder } from './folder-setup.js'
import { allowSetupFor, assertAwaitingSetup } from './setup-permit.js'

const README = '# My app\n\nWritten long before Knightbook.\n'
const GUIDE = '# Guide\n\nAlready here.\n'

let sandbox: string
let folder: string

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'knightbook-setup-'))
  folder = join(sandbox, 'my-app')
  await mkdir(join(folder, 'docs'), { recursive: true })
  await writeFile(join(folder, 'README.md'), README, 'utf8')
  await writeFile(join(folder, 'docs', 'guide.md'), GUIDE, 'utf8')
  await writeFile(join(folder, 'index.ts'), 'export {}\n', 'utf8')
})

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true })
})

describe('looking at a folder before setup', () => {
  it('offers the README and docs folder that are there, and names the folder', async () => {
    expect(await inspectFolder(folder)).toEqual({
      name: 'my-app',
      suggestions: ['README.md', 'docs'],
    })
  })

  it('offers nothing for a bare folder', async () => {
    const bare = join(sandbox, 'bare')
    await mkdir(bare)

    expect((await inspectFolder(bare)).suggestions).toEqual([])
  })

  it('does not offer a README that is a directory, or a docs that is a file', async () => {
    const odd = join(sandbox, 'odd')
    await mkdir(join(odd, 'README.md'), { recursive: true })
    await writeFile(join(odd, 'docs'), 'not a folder', 'utf8')

    expect((await inspectFolder(odd)).suggestions).toEqual([])
  })

  it('writes nothing', async () => {
    const before = await readdir(folder)
    await inspectFolder(folder)

    expect(await readdir(folder)).toEqual(before)
  })
})

describe('setting up a folder', () => {
  it('creates a project named after the folder unless told otherwise', async () => {
    const outcome = await setUpFolder(folder, { name: '   ', include: [] })

    expect(outcome.warning).toBeNull()
    const project = await openProject(outcome.path)
    expect(project.frontmatter.name).toBe(basename(folder))
  })

  it('uses the name the person typed, trimmed', async () => {
    const outcome = await setUpFolder(folder, { name: '  Better name ', include: [] })

    expect((await openProject(outcome.path)).frontmatter.name).toBe('Better name')
  })

  it('adds only .projectspace and leaves every existing file exactly as it was', async () => {
    const before = await readdir(folder)

    await setUpFolder(folder, { name: '', include: ['README.md', 'docs'] })

    expect((await readdir(folder)).sort()).toEqual([...before, '.projectspace'].sort())
    expect(await readFile(join(folder, 'README.md'), 'utf8')).toBe(README)
    expect(await readFile(join(folder, 'docs', 'guide.md'), 'utf8')).toBe(GUIDE)
    expect(await readFile(join(folder, 'index.ts'), 'utf8')).toBe('export {}\n')
  })

  it('includes the chosen documents in place', async () => {
    const outcome = await setUpFolder(folder, { name: '', include: ['README.md', 'docs'] })

    expect((await openProject(outcome.path)).frontmatter.documents_include).toEqual([
      'README.md',
      'docs',
    ])
  })

  it('includes nothing the person did not tick', async () => {
    const outcome = await setUpFolder(folder, { name: '', include: ['docs'] })

    expect((await openProject(outcome.path)).frontmatter.documents_include).toEqual(['docs'])
  })

  it('ignores anything that was not offered, so the renderer cannot widen the list', async () => {
    // index.ts really exists in the folder, so it would be included if the filter let it through.
    const outcome = await setUpFolder(folder, { name: '', include: ['index.ts'] })

    expect(outcome.warning).toBeNull()
    expect((await openProject(outcome.path)).frontmatter.documents_include).toEqual([])
  })
})

describe('setup that must not go ahead', () => {
  it('refuses a .projectspace that holds unrelated files, and changes nothing', async () => {
    await mkdir(join(folder, '.projectspace'))
    await writeFile(join(folder, '.projectspace', 'notes.txt'), 'someone else’s file', 'utf8')

    await expect(setUpFolder(folder, { name: '', include: [] })).rejects.toThrow(/unrelated files/i)

    expect(await readdir(join(folder, '.projectspace'))).toEqual(['notes.txt'])
  })

  it('refuses a folder that is already a project', async () => {
    await setUpFolder(folder, { name: 'First', include: [] })

    await expect(setUpFolder(folder, { name: 'Second', include: [] })).rejects.toThrow(
      /already a Knightbook project/i,
    )
    expect((await openProject(folder)).frontmatter.name).toBe('First')
  })
})

describe('explaining a failure', () => {
  const errno = (code: string) => Object.assign(new Error(`${code}: raw message`), { code })

  it('says permission was denied, and that no project was created', () => {
    for (const code of ['EACCES', 'EPERM']) {
      expect(explainSetupFailure(errno(code)).message).toMatch(
        /permission denied.*no project was created/i,
      )
    }
  })

  it('says a read-only location cannot be written to', () => {
    expect(explainSetupFailure(errno('EROFS')).message).toMatch(/read-only/i)
  })

  it('says the disk is full', () => {
    expect(explainSetupFailure(errno('ENOSPC')).message).toMatch(/disk is full/i)
  })

  it('says the folder is gone', () => {
    expect(explainSetupFailure(errno('ENOENT')).message).toMatch(/no longer exists/i)
  })

  it('passes an already-specific project error through untouched', () => {
    const specific = new ProjectError('already_exists', 'already there')

    expect(explainSetupFailure(specific)).toBe(specific)
  })

  it('keeps the underlying message for anything unrecognized', () => {
    expect(explainSetupFailure(new Error('something odd')).message).toMatch(/something odd/)
  })
})

describe('the setup permit', () => {
  it('allows only the folder that was chosen', () => {
    allowSetupFor('C:\\chosen')

    expect(assertAwaitingSetup('C:\\chosen')).toBe('C:\\chosen')
    expect(() => assertAwaitingSetup('C:\\somewhere\\else')).toThrow(/choose the folder again/i)
  })

  it('allows nothing until a folder has been chosen, or once it is spent', () => {
    allowSetupFor(null)

    expect(() => assertAwaitingSetup('C:\\chosen')).toThrow()
    expect(() => assertAwaitingSetup(undefined)).toThrow()
  })
})
