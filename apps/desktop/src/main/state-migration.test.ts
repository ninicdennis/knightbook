// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { adoptLegacyAppState } from './state-migration.js'

/**
 * Renaming the product moves Electron's userData directory, so the settings and
 * the recent-project list have to be carried across or they silently disappear.
 */

let sandbox: string
let current: string
/** What the installed app actually used: the scoped package name, as a path. */
let scoped: string
/** What an earlier build used. */
let legacy: string

const STATE = JSON.stringify({
  recentProjects: [{ path: 'C:\\projects\\demo', name: 'Demo' }],
  settings: { colorScheme: 'dark' },
})

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'knightbook-migration-'))
  current = join(sandbox, 'Knightbook', 'app-state.json')
  scoped = join(sandbox, '@projectspace', 'desktop', 'app-state.json')
  legacy = join(sandbox, 'Projectspace', 'app-state.json')
  await mkdir(join(sandbox, '@projectspace', 'desktop'), { recursive: true })
  await mkdir(join(sandbox, 'Projectspace'), { recursive: true })
})

/** The real order: the installed app's directory first, the older one second. */
const candidates = () => [scoped, legacy]

afterEach(async () => await rm(sandbox, { recursive: true, force: true }))

describe('carrying app state across the rename', () => {
  it('copies the old state forward when there is nothing under the new name', async () => {
    await writeFile(legacy, STATE, 'utf8')

    const result = await adoptLegacyAppState(current, candidates())

    expect(result).toMatchObject({ outcome: 'adopted', from: legacy })
    expect(JSON.parse(await readFile(current, 'utf8'))).toMatchObject({
      settings: { colorScheme: 'dark' },
    })
  })

  it('leaves the old file where it is, so an older build still works', async () => {
    await writeFile(legacy, STATE, 'utf8')

    await adoptLegacyAppState(current, candidates())

    expect(await readFile(legacy, 'utf8')).toBe(STATE)
  })

  it('never overwrites state the new name already has', async () => {
    await mkdir(join(sandbox, 'Knightbook'), { recursive: true })
    await writeFile(current, '{"settings":{"colorScheme":"light"}}', 'utf8')
    await writeFile(legacy, STATE, 'utf8')

    const result = await adoptLegacyAppState(current, candidates())

    expect(result).toEqual({ outcome: 'kept' })
    // The dark scheme from the old file must not come back over the light one.
    expect(await readFile(current, 'utf8')).toContain('light')
  })

  it('prefers the directory the installed app really used', async () => {
    // Both exist on a machine that has run more than one build. The scoped one
    // is what the packaged app wrote; the other is an older, staler file, and
    // taking it would quietly replace a real recent-project list with a dead one.
    await writeFile(scoped, JSON.stringify({ settings: { colorScheme: 'dark' } }), 'utf8')
    await writeFile(legacy, JSON.stringify({ settings: { colorScheme: 'light' } }), 'utf8')

    const result = await adoptLegacyAppState(current, candidates())

    expect(result).toMatchObject({ outcome: 'adopted', from: scoped })
    expect(await readFile(current, 'utf8')).toContain('dark')
  })

  it('falls through to the older directory when the scoped one is absent', async () => {
    await writeFile(legacy, STATE, 'utf8')

    expect(await adoptLegacyAppState(current, candidates())).toMatchObject({
      outcome: 'adopted',
      from: legacy,
    })
  })

  it('reports a first run as neither, rather than as a failure', async () => {
    expect(await adoptLegacyAppState(current, candidates())).toEqual({ outcome: 'none' })
  })

  it('runs once: the second launch finds its own file and stops', async () => {
    await writeFile(legacy, STATE, 'utf8')

    expect((await adoptLegacyAppState(current, candidates())).outcome).toBe('adopted')
    expect((await adoptLegacyAppState(current, candidates())).outcome).toBe('kept')
  })

  it('reports a copy it could not make instead of throwing at startup', async () => {
    await writeFile(legacy, STATE, 'utf8')
    // A file standing where the new state's directory has to go, so the copy
    // cannot succeed. The app still has to start.
    await writeFile(join(sandbox, 'Knightbook'), 'not a directory', 'utf8')

    const result = await adoptLegacyAppState(current, candidates())

    expect(result.outcome).toBe('failed')
    expect(result).toMatchObject({ from: legacy })
  })
})
