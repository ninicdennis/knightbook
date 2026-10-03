import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fixtureRelease } from './test-releases'

/**
 * Builds the real site from the checked-in release data and from a history
 * that has every kind of entry, and checks /releases/ as a visitor receives it.
 */

const run = promisify(execFile)
const SITE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const ASTRO_BIN = join(
  dirname(createRequire(import.meta.url).resolve('astro/package.json')),
  'bin',
  'astro.mjs',
)

const HISTORY = [
  fixtureRelease('0.2.0', { date: '2026-08-03' }),
  fixtureRelease('0.3.0', {
    date: '2026-09-01',
    compatibilityChanges: ['Projects opened in 0.3.0 cannot be opened again in 0.2.0.'],
    knownIssues: ['Refresh can take a few seconds on very large projects.'],
  }),
  fixtureRelease('0.3.1', {
    date: '2026-09-15',
    withdrawnReason: 'It could not open existing projects.',
  }),
  fixtureRelease('0.4.0', { date: '2026-09-20', channel: 'preview' }),
  // Newer than 0.4.0 by number, though a text sort would put it first or last.
  fixtureRelease('0.10.0', { date: '2026-10-02' }),
]

let workDir: string
let empty: string
let history: string
let onlyWithdrawn: string

async function releasesPage(name: string, releases: unknown[] | null) {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.KNIGHTBOOK_RELEASE_DATA_FOR_TESTS
  if (releases) {
    env.KNIGHTBOOK_RELEASE_DATA_FOR_TESTS = join(workDir, `${name}.json`)
    await writeFile(env.KNIGHTBOOK_RELEASE_DATA_FOR_TESTS, JSON.stringify({ releases }))
  }
  const outDir = join(workDir, name)
  await run(process.execPath, [ASTRO_BIN, 'build', '--outDir', outDir], { cwd: SITE_ROOT, env })
  return readFile(join(outDir, 'releases', 'index.html'), 'utf8')
}

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'knightbook-releases-'))
  empty = await releasesPage('empty', [])
  history = await releasesPage('history', HISTORY)
  onlyWithdrawn = await releasesPage('onlyWithdrawn', [HISTORY[2]])
})

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true })
})

function entry(html: string, version: string) {
  return (
    html.match(
      new RegExp(
        `<li[^>]*data-version="${version.replace(/\./g, '\\.')}"[\\s\\S]*?(?=<li[^>]*data-version=|</ol>)`,
      ),
    )?.[0] ?? ''
  )
}

function text(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
}

describe('the releases page', () => {
  it('says plainly that there are no releases, rather than showing an empty list', () => {
    expect(text(empty)).toContain('There are no Knightbook releases yet.')
    expect(empty).not.toContain('class="history')
  })

  it('lists every release newest first, with channel, date and its release notes', () => {
    const versions = [...history.matchAll(/<li[^>]*data-version="([^"]+)"/g)].map((m) => m[1])
    expect(versions).toEqual(['0.10.0', '0.4.0', '0.3.1', '0.3.0', '0.2.0'])
    for (const release of HISTORY) {
      const one = entry(history, release.version)
      expect(one, release.version).toContain(`href="${release.notesUrl}"`)
      // Each release shows its own date, not another's.
      const shown = new Date(`${release.date}T00:00:00Z`).toLocaleDateString('en', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      })
      expect(one, release.version).toMatch(
        new RegExp(`<time datetime="${release.date}"[^>]*>${shown}</time>`),
      )
      expect(text(one), release.version).toContain(
        release.channel === 'preview' ? 'Preview channel' : 'Stable channel',
      )
    }
    expect(entry(history, '0.4.0')).toMatch(/<span class="label[^"]*"[^>]*>Preview</)
  })

  it('marks a withdrawn release, says why, and names the known-good release to use instead', () => {
    const withdrawn = entry(history, '0.3.1')
    expect(withdrawn).toMatch(/>Withdrawn</)
    // The recommended release (0.10.0), not merely the one just below (0.3.0).
    expect(text(withdrawn)).toMatch(
      /Withdrawn: It could not open existing projects\. Use Knightbook 0\.10\.0 instead\./,
    )
    expect(withdrawn).toMatch(/<a href="\/download\/"[^>]*>Knightbook 0\.10\.0<\/a>/)
  })

  it('says when there is no release to use instead of a withdrawn one', () => {
    expect(text(entry(onlyWithdrawn, '0.3.1'))).toContain(
      'There is no other release to use instead yet.',
    )
  })

  it('shows compatibility changes and known issues only where a release records them', () => {
    const recorded = text(entry(history, '0.3.0'))
    expect(recorded).toContain('Compatibility changes')
    expect(recorded).toContain('Projects opened in 0.3.0 cannot be opened again in 0.2.0.')
    expect(recorded).toContain('Known issues')
    expect(recorded).toContain('Refresh can take a few seconds on very large projects.')
    const plain = text(entry(history, '0.2.0'))
    expect(plain).not.toContain('Compatibility changes')
    expect(plain).not.toContain('Known issues')
  })

  it('reads the same release data as the download page, with no copy of its own', async () => {
    const source = await readFile(join(SITE_ROOT, 'src/pages/releases/index.astro'), 'utf8')
    expect(source).toContain("from '../../download/load-release-data'")
    expect(source).not.toMatch(/\d+\.\d+\.\d+/)
  })

  it('works without JavaScript', () => {
    for (const html of [empty, history]) expect(html).not.toMatch(/<script/i)
  })
})
