// @vitest-environment node
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  exportSkill,
  fingerprintOf,
  inspectInstalledSkill,
  installSkill,
  readSkillFolder,
  skillTargets,
  type SkillFiles,
} from './skill-install.js'

let sandbox: string

beforeEach(async () => {
  // A space in the path, because installed apps and home folders have them.
  sandbox = await mkdtemp(join(tmpdir(), 'knightbook skill-'))
})

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true })
})

function files(entries: Record<string, string>): SkillFiles {
  return new Map(Object.entries(entries).map(([path, text]) => [path, Buffer.from(text)]))
}

const BUNDLED = files({ 'SKILL.md': '# Skill v2\n', 'reference/tools.md': 'companion\n' })
const OLDER = files({ 'SKILL.md': '# Skill v1\n' })

async function writeFolder(dir: string, contents: SkillFiles): Promise<void> {
  for (const [path, content] of contents) {
    await mkdir(join(dir, ...path.split('/').slice(0, -1)), { recursive: true })
    await writeFile(join(dir, ...path.split('/')), content)
  }
}

describe('where the skill goes', () => {
  it('names the folders each client documents, under home or the checkout', () => {
    const targets = skillTargets(join('H', 'me'), join('W', 'app'))
    expect(targets.map((t) => [t.id, t.dir])).toEqual([
      ['claude-personal', join('H', 'me', '.claude', 'skills', 'projectspace')],
      ['claude-project', join('W', 'app', '.claude', 'skills', 'projectspace')],
      ['codex-personal', join('H', 'me', '.agents', 'skills', 'projectspace')],
      ['codex-project', join('W', 'app', '.agents', 'skills', 'projectspace')],
    ])
  })
})

describe('reading what is installed', () => {
  it('reports absent, matching, and modified for a copy of unknown origin', async () => {
    const dir = join(sandbox, 'skills', 'projectspace')
    expect(await inspectInstalledSkill(dir, BUNDLED, null)).toBe('absent')

    await writeFolder(dir, BUNDLED)
    expect(await inspectInstalledSkill(dir, BUNDLED, null)).toBe('matching')

    await writeFile(join(dir, 'SKILL.md'), '# My own edits\n')
    expect(await inspectInstalledSkill(dir, BUNDLED, null)).toBe('modified')
  })

  it('calls a copy outdated only when it is still exactly what Knightbook wrote', async () => {
    const dir = join(sandbox, 'projectspace')
    await writeFolder(dir, OLDER)
    expect(await inspectInstalledSkill(dir, BUNDLED, fingerprintOf(OLDER))).toBe('outdated')

    await writeFile(join(dir, 'notes.md'), 'added by the user\n')
    expect(await inspectInstalledSkill(dir, BUNDLED, fingerprintOf(OLDER))).toBe('modified')
  })

  it('treats a file where the folder should be as modified, not absent', async () => {
    const dir = join(sandbox, 'projectspace')
    await writeFile(dir, 'not a folder')
    expect(await inspectInstalledSkill(dir, BUNDLED, null)).toBe('modified')
  })
})

describe('installing', () => {
  it('writes every file, companions included, into an absent folder', async () => {
    const dir = join(sandbox, 'home', '.claude', 'skills', 'projectspace')
    const fingerprint = await installSkill(dir, BUNDLED, { expected: 'absent', recorded: null })

    expect(fingerprint).toBe(fingerprintOf(BUNDLED))
    expect(await readFile(join(dir, 'reference', 'tools.md'), 'utf8')).toBe('companion\n')
    expect(fingerprintOf((await readSkillFolder(dir))!)).toBe(fingerprint)
    // No staging folder is left beside it for a client to find.
    expect(await readdir(join(sandbox, 'home', '.claude', 'skills'))).toEqual(['projectspace'])
  })

  it('updates an outdated copy in place', async () => {
    const dir = join(sandbox, 'projectspace')
    await writeFolder(dir, OLDER)
    await installSkill(dir, BUNDLED, { expected: 'outdated', recorded: fingerprintOf(OLDER) })
    expect(await readFile(join(dir, 'SKILL.md'), 'utf8')).toBe('# Skill v2\n')
    expect(await readdir(sandbox)).toEqual(['projectspace'])
  })

  it('refuses to touch a customised copy, even when asked to update it', async () => {
    const dir = join(sandbox, 'projectspace')
    await writeFolder(dir, files({ 'SKILL.md': '# Mine\n' }))

    for (const expected of ['absent', 'outdated'] as const) {
      await expect(installSkill(dir, BUNDLED, { expected, recorded: null })).rejects.toThrow(
        /now modified\. Nothing was written/,
      )
    }
    expect(await readFile(join(dir, 'SKILL.md'), 'utf8')).toBe('# Mine\n')
  })

  it('refuses when a folder appeared after the dialog showed it absent', async () => {
    const dir = join(sandbox, 'projectspace')
    await writeFolder(dir, BUNDLED)
    await expect(
      installSkill(dir, BUNDLED, { expected: 'absent', recorded: null }),
    ).rejects.toThrow(/now matching/)
  })
})

describe('exporting', () => {
  it('writes a complete projectspace folder under the chosen one', async () => {
    const exported = await exportSkill(sandbox, BUNDLED)
    expect(exported).toBe(join(sandbox, 'projectspace'))
    expect(fingerprintOf((await readSkillFolder(exported))!)).toBe(fingerprintOf(BUNDLED))
  })

  it('never writes into a projectspace folder that is already there', async () => {
    await writeFolder(join(sandbox, 'projectspace'), files({ 'SKILL.md': '# Mine\n' }))
    await expect(exportSkill(sandbox, BUNDLED)).rejects.toThrow(/already exists/)
    expect(await readFile(join(sandbox, 'projectspace', 'SKILL.md'), 'utf8')).toBe('# Mine\n')
  })
})
