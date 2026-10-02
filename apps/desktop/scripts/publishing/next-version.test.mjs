// @vitest-environment node
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import semanticRelease from 'semantic-release'
import {
  decideRelease,
  FIRST_VERSION,
  releaseOptions,
  withoutVersionHeading,
} from './next-version.mjs'

const run = promisify(execFile)

/**
 * The rules are checked by running semantic-release itself against a throwaway
 * repository, so the version a merge would get is observed rather than assumed
 * from the configuration. `origin` is a local bare repository, which is enough
 * for the push check semantic-release makes even in dry-run mode.
 */

let root
let work

async function git(...args) {
  const { stdout } = await run('git', args, { cwd: work })
  return stdout.trim()
}

/** Commits a change to `file`, which is inside the desktop app unless a test says otherwise. */
async function commit(message, file = 'apps/desktop/file.txt') {
  await mkdir(dirname(join(work, file)), { recursive: true })
  await writeFile(join(work, file), `${message}\n${Math.random()}\n`)
  await git('add', '.')
  await git('commit', '-q', '-m', message)
  await git('push', '-q', 'origin', 'HEAD:main')
}

/** semantic-release's answer for the repository as it stands, read through decideRelease. */
async function nextRelease() {
  const quiet = { write: () => true }
  const result = await semanticRelease(
    // A file:// URL, not a bare path: the release-notes plugin parses the
    // repository as a URL, and only a Windows path happens to parse as one.
    { ...releaseOptions, repositoryUrl: pathToFileURL(join(root, 'origin.git')).href },
    {
      cwd: work,
      env: { ...process.env, GITHUB_ACTIONS: '', CI: '' },
      stdout: quiet,
      stderr: quiet,
    },
  )
  return decideRelease(result)
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'knightbook-next-version-'))
  work = join(root, 'work')
  await run('git', ['init', '-q', '--bare', '-b', 'main', join(root, 'origin.git')])
  await run('git', ['clone', '-q', join(root, 'origin.git'), work])
  await git('checkout', '-q', '-b', 'main')
  await git('config', 'user.name', 'Test')
  await git('config', 'user.email', 'test@example.com')
  await git('config', 'commit.gpgsign', 'false')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('the version a merge to main releases', () => {
  it('starts at 0.1.0 rather than 1.0.0', async () => {
    await commit('feat: first feature')
    const decision = await nextRelease()
    expect(decision).toMatchObject({ release: true, version: FIRST_VERSION, tag: 'v0.1.0' })
    expect(decision.notes).toContain('first feature')
    expect(decision.notes).not.toContain('1.0.0')
  })

  it('releases a patch for a docs: commit that changes the app', async () => {
    await commit('feat: first feature')
    await git('tag', 'v0.1.0')
    await commit('docs: explain the board')
    expect(await nextRelease()).toMatchObject({ release: true, version: '0.1.1' })
  })

  it('releases a minor version for a feature and a patch for a fix', async () => {
    await commit('feat: first feature')
    await git('tag', 'v0.1.0')
    await commit('fix: a bug')
    expect(await nextRelease()).toMatchObject({ version: '0.1.1' })
    await commit('feat: another feature')
    expect(await nextRelease()).toMatchObject({ version: '0.2.0' })
  })

  it('releases a major version for a breaking change', async () => {
    await commit('feat: first feature')
    await git('tag', 'v0.1.0')
    await commit('feat!: change the record format')
    expect(await nextRelease()).toMatchObject({ version: '1.0.0' })
  })

  it('releases nothing for a merge that changes only the website or the docs', async () => {
    await commit('feat: first feature')
    await git('tag', 'v0.1.0')
    await commit('feat: a new homepage', 'apps/website/src/pages/index.astro')
    await commit('docs: explain the board', 'docs/guide.md')
    expect(await nextRelease()).toEqual({ release: false })
  })

  it('leaves earlier website changes out of the next app release', async () => {
    await commit('feat: first feature')
    await git('tag', 'v0.1.0')
    await commit('feat: a new homepage', 'apps/website/src/pages/index.astro')
    await commit('fix: a desktop bug')

    const decision = await nextRelease()
    expect(decision).toMatchObject({ release: true, version: '0.1.1' })
    expect(decision.notes).toContain('a desktop bug')
    expect(decision.notes).not.toContain('homepage')
  })

  it('still counts an app change that arrives as a two-parent merge commit', async () => {
    await commit('feat: first feature')
    await git('tag', 'v0.1.0')
    await git('checkout', '-q', '-b', 'topic')
    await commit('wip', 'apps/desktop/other.txt')
    await git('checkout', '-q', 'main')
    await git('merge', '-q', '--no-ff', '-m', 'fix: a merged desktop change', 'topic')
    await git('push', '-q', 'origin', 'HEAD:main')
    expect(await nextRelease()).toMatchObject({ release: true, version: '0.1.1' })
  })

  it('counts a change to the shared lockfile as an app change', async () => {
    await commit('feat: first feature')
    await git('tag', 'v0.1.0')
    await commit('chore: add the website dependencies', 'pnpm-lock.yaml')
    expect(await nextRelease()).toMatchObject({ release: true, version: '0.1.1' })
  })

  it('releases nothing again when the workflow is re-run after its release was tagged', async () => {
    await commit('feat: first feature')
    await git('tag', 'v0.1.0')
    await git('push', '-q', 'origin', 'v0.1.0')
    expect(await nextRelease()).toEqual({ release: false })
  })

  it('releases nothing when no commit since the last tag is a Conventional Commit', async () => {
    await commit('feat: first feature')
    await git('tag', 'v0.1.0')
    await commit('Merge pull request #36 from somewhere')
    expect(await nextRelease()).toEqual({ release: false })
  })
})

describe('reading semantic-release’s answer', () => {
  it('treats no answer as no release', () => {
    expect(decideRelease(false)).toEqual({ release: false })
  })

  it('keeps semantic-release’s version once a release exists', () => {
    const decision = decideRelease({
      lastRelease: { version: '0.3.0' },
      nextRelease: { version: '0.4.0', notes: '## 0.4.0 (2026-10-01)\n\n### Features\n\n* x\n' },
    })
    expect(decision).toEqual({
      release: true,
      version: '0.4.0',
      tag: 'v0.4.0',
      notes: '### Features\n\n* x',
    })
  })

  it('removes only the leading version heading from the notes', () => {
    const notes = '## [0.2.0](https://example.com) (2026-10-01)\n\n### Bug Fixes\n\n## kept'
    expect(withoutVersionHeading(notes)).toBe('### Bug Fixes\n\n## kept')
  })
})
