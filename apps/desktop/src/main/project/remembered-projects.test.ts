// @vitest-environment node
import { initializeProject } from '@knightbook/core'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { describeRememberedProjects, parseRememberedEntries } from './remembered-projects.js'

let sandbox: string

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'knightbook-remembered-'))
})

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true })
})

describe('reading the stored list', () => {
  it('keeps entries saved as bare paths by earlier versions', () => {
    expect(parseRememberedEntries(['C:\\one', { path: 'C:\\two', name: 'Two' }])).toEqual([
      { path: 'C:\\one' },
      { path: 'C:\\two', name: 'Two' },
    ])
  })

  it('skips malformed entries instead of failing the whole list', () => {
    expect(parseRememberedEntries([42, null, { name: 'no path' }, { path: 'C:\\ok' }])).toEqual([
      { path: 'C:\\ok' },
    ])
    expect(parseRememberedEntries('not a list')).toEqual([])
  })
})

describe('describing remembered projects', () => {
  it('reports an existing project as available, under its remembered name', async () => {
    const root = join(sandbox, 'real')
    await initializeProject(root, { name: 'Real one' })

    const [described] = await describeRememberedProjects([{ path: root, name: 'Real one' }])

    expect(described).toEqual({ path: root, name: 'Real one', unavailable: null })
  })

  it('falls back to the folder name when no name was remembered', async () => {
    const root = join(sandbox, 'legacy-entry')
    await initializeProject(root, { name: 'Anything' })

    const [described] = await describeRememberedProjects([{ path: root }])

    expect(described?.name).toBe(basename(root))
  })

  it('says a missing folder is unavailable and keeps it in the list', async () => {
    const gone = join(sandbox, 'gone')

    const [described] = await describeRememberedProjects([{ path: gone, name: 'Gone' }])

    expect(described?.name).toBe('Gone')
    expect(described?.unavailable).toMatch(/not found/i)
  })

  it('says a folder without project records is unavailable, and touches nothing in it', async () => {
    const bare = join(sandbox, 'bare')
    await mkdir(bare)

    const [described] = await describeRememberedProjects([{ path: bare, name: 'Bare' }])

    expect(described?.unavailable).toMatch(/no longer has project records/i)
    expect(await readdir(bare)).toEqual([])
  })

  it('says a file where a folder was expected is unavailable', async () => {
    const file = join(sandbox, 'a-file.txt')
    await writeFile(file, 'x')

    const [described] = await describeRememberedProjects([{ path: file }])

    expect(described?.unavailable).toMatch(/not a folder/i)
  })
})
