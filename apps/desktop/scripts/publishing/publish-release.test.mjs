// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { publishRelease } from './publish-release.mjs'

/**
 * GitHub is replaced by a small fake that keeps releases and tags the way the
 * real one does: a draft has no tag, and publishing creates the tag at the
 * draft's target commit. Every write the script makes is recorded, so a test can
 * show that a refused run changed nothing.
 */

const SHA = 'a'.repeat(40)
const OTHER_SHA = 'b'.repeat(40)
const VERSION = '0.2.0'
const TAG = 'v0.2.0'

const INSTALLERS = [
  'Knightbook-0.2.0-windows-x64.exe',
  'Knightbook-0.2.0-macos-arm64.dmg',
  'Knightbook-0.2.0-macos-x64.dmg',
  'Knightbook-0.2.0-linux-amd64.deb',
]

let dir
let assetsDir
let notesFile

function notFound(message) {
  return Object.assign(new Error('gh failed'), { stderr: message })
}

function fakeGitHub({ failUpload = false } = {}) {
  const github = { releases: new Map(), tags: new Map(), writes: [], failUpload }

  github.run = async (command, args) => {
    expect(command).toBe('gh')
    const [group, action, tag] = args

    if (group === 'api') {
      const ref = action.split('/').pop()
      if (!github.tags.has(ref)) throw notFound(`No commit found for SHA: ${ref} (HTTP 422)`)
      return `${github.tags.get(ref)}\n`
    }
    if (action === 'view') {
      const release = github.releases.get(tag)
      if (!release) throw notFound('release not found')
      return JSON.stringify({ isDraft: release.isDraft, assets: release.assets })
    }
    if (action === 'download') {
      const name = args[args.indexOf('--pattern') + 1]
      return github.releases.get(tag).contents.get(name)
    }

    github.writes.push(args.slice(0, 2).join(' '))
    if (action === 'create') {
      const target = args[args.indexOf('--target') + 1]
      github.releases.set(tag, { isDraft: true, assets: [], contents: new Map(), target })
    } else if (action === 'upload') {
      const release = github.releases.get(tag)
      const paths = args.slice(3)
      for (const path of github.failUpload ? paths.slice(0, 2) : paths) {
        release.assets.push({ name: basename(path), size: (await stat(path)).size })
        release.contents.set(basename(path), await readFile(path, 'utf8'))
      }
      if (github.failUpload) throw new Error('upload interrupted')
    } else if (action === 'edit') {
      const release = github.releases.get(tag)
      release.isDraft = false
      github.tags.set(tag, release.target)
    } else if (action === 'delete') {
      github.releases.delete(tag)
    }
    return ''
  }
  return github
}

function publish(github, overrides = {}) {
  return publishRelease({
    tag: TAG,
    version: VERSION,
    sha: SHA,
    notesFile,
    assetsDir,
    run: github.run,
    log: () => {},
    ...overrides,
  })
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'knightbook-publish-'))
  assetsDir = join(dir, 'assets')
  notesFile = join(dir, 'notes.md')
  await writeFile(notesFile, '### Features\n')
  await mkdir(assetsDir)
  for (const name of INSTALLERS) await writeFile(join(assetsDir, name), `contents of ${name}`)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('publishing a release', () => {
  it('stages a draft prerelease, attaches every file, then publishes it at the tested commit', async () => {
    const github = fakeGitHub()
    expect(await publish(github)).toBe('published')

    expect(github.writes).toEqual(['release create', 'release upload', 'release edit'])
    const release = github.releases.get(TAG)
    expect(release.isDraft).toBe(false)
    expect(release.assets.map(({ name }) => name).sort()).toEqual(
      [...INSTALLERS, 'SHA256SUMS.txt'].sort(),
    )
    expect(github.tags.get(TAG)).toBe(SHA)
  })

  it('writes a checksum line for every installer, in sha256sum format', async () => {
    await publish(fakeGitHub())
    const lines = (await readFile(join(assetsDir, 'SHA256SUMS.txt'), 'utf8')).trim().split('\n')
    expect(lines).toHaveLength(INSTALLERS.length)
    for (const line of lines) expect(line).toMatch(/^[0-9a-f]{64} {2}Knightbook-0\.2\.0-/)
  })

  it('does nothing on a repeat run once the same release is published', async () => {
    const github = fakeGitHub()
    await publish(github)
    github.writes.length = 0

    expect(await publish(github)).toBe('already-published')
    expect(github.writes).toEqual([])
  })

  it('refuses, without writing, when the tag already points at another commit', async () => {
    const github = fakeGitHub()
    await publish(github, { sha: OTHER_SHA })
    github.writes.length = 0

    await expect(publish(github)).rejects.toThrow(/already points at/)
    expect(github.writes).toEqual([])
  })

  it('refuses to change a published release whose files differ', async () => {
    const github = fakeGitHub()
    await publish(github)
    github.writes.length = 0
    await writeFile(join(assetsDir, INSTALLERS[0]), 'a rebuilt installer of another size')

    await expect(publish(github)).rejects.toThrow(/different files/)
    expect(github.writes).toEqual([])
  })

  it('refuses a rebuilt installer of the same size but different bytes', async () => {
    const github = fakeGitHub()
    await publish(github)
    github.writes.length = 0
    const original = await readFile(join(assetsDir, INSTALLERS[0]), 'utf8')
    await writeFile(join(assetsDir, INSTALLERS[0]), original.replace('contents', 'CONTENTS'))

    await expect(publish(github)).rejects.toThrow(/different files/)
    expect(github.writes).toEqual([])
  })

  it('leaves only a draft when an upload fails, and a later run replaces it', async () => {
    const github = fakeGitHub({ failUpload: true })
    await expect(publish(github)).rejects.toThrow(/upload interrupted/)
    expect(github.releases.get(TAG).isDraft).toBe(true)
    expect(github.tags.has(TAG)).toBe(false)

    github.failUpload = false
    github.writes.length = 0
    expect(await publish(github)).toBe('published')
    expect(github.writes).toEqual([
      'release delete',
      'release create',
      'release upload',
      'release edit',
    ])
    expect(github.releases.get(TAG).assets).toHaveLength(INSTALLERS.length + 1)
  })

  it('publishes nothing when an installer is missing', async () => {
    await rm(join(assetsDir, INSTALLERS[2]))
    const github = fakeGitHub()

    await expect(publish(github)).rejects.toThrow(/missing: macOS Intel disk image/)
    expect(github.writes).toEqual([])
  })
})
