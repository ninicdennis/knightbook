import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * The troubleshooting guide, built from the real guides: one anchored entry per
 * symptom in the landing-page proposal §7, each giving the same four things, the
 * support links, and links into it from the other guides that reach a heading
 * that exists. Whether the advice itself is right is settled by reading.
 */

const run = promisify(execFile)
const SITE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const GUIDES_DIR = join(SITE_ROOT, 'src', 'content', 'docs')
const ASTRO_BIN = join(
  dirname(createRequire(import.meta.url).resolve('astro/package.json')),
  'bin',
  'astro.mjs',
)

const SYMPTOMS = [
  'the-installer-will-not-run',
  'mcp-runtime-missing',
  'mcp-not-connected',
  'the-wrong-project-appears',
  'documents-or-changes-are-missing',
  'a-change-was-not-saved-or-a-record-cannot-be-read',
  'done-or-review-looks-wrong',
  'something-changed-after-an-update',
]

const LABELS = ['First checks', 'What you should see:', 'Next safe step:', 'When to ask for help:']

let outDir: string
let guide: string

beforeAll(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'knightbook-troubleshooting-'))
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.KNIGHTBOOK_DOCS_DIR_FOR_TESTS
  delete env.KNIGHTBOOK_SITE_STAGE
  await run(process.execPath, [ASTRO_BIN, 'build', '--outDir', outDir], { cwd: SITE_ROOT, env })
  guide = await readFile(join(outDir, 'docs', 'troubleshooting', 'index.html'), 'utf8')
})

afterAll(async () => {
  await rm(outDir, { recursive: true, force: true })
})

/** The HTML from one h2 to the next, or to the end of the guide's prose. */
function section(id: string) {
  const start = guide.indexOf(`<h2 id="${id}"`)
  if (start === -1) return ''
  const next = guide.indexOf('<h2 ', start + 1)
  return guide.slice(start, next === -1 ? undefined : next)
}

const headingIds = () => new Set([...guide.matchAll(/<h[23] id="([^"]+)"/g)].map((m) => m[1]))

describe('the troubleshooting guide', () => {
  it('is published as written, for the release it describes', () => {
    expect(guide).not.toContain('data-draft-guide')
    expect(guide).toMatch(/>Written for Knightbook 0\.2\.0</)
  })

  it.each(SYMPTOMS)(
    'has an entry for %s with first checks, the expected result, the next safe step and when to ask',
    (id) => {
      const entry = section(id)
      expect(entry, id).not.toBe('')
      for (const label of LABELS) expect(entry, `${id}: ${label}`).toContain(`<strong>${label}`)
    },
  )

  it('links the bug report form and private vulnerability reporting', () => {
    const help = section('asking-for-help')
    expect(help).toContain(
      'href="https://github.com/ninicdennis/knightbook/issues/new?template=bug_report.yml"',
    )
    expect(help).toContain(
      'href="https://github.com/ninicdennis/knightbook/security/advisories/new"',
    )
  })

  it('says what to include in a report and what never to post', () => {
    const include = section('asking-for-help').split('id="what-never-to-post"')
    const [asks, never] = [include[0] ?? '', include[1] ?? '']
    for (const item of [
      'Knightbook version',
      'operating system',
      'processor',
      'Steps to reproduce',
    ])
      expect(asks, item).toContain(item)
    expect(asks).toMatch(/error, redacted/)
    // Ticket b411cc60: the app shows its version in Settings, under About.
    expect(asks).toContain('<strong>Settings</strong>')
    expect(asks).toContain('<strong>About</strong>')
    for (const item of ['A whole private project', 'Credentials', 'Unredacted client logs'])
      expect(never, item).toContain(item)
  })

  it('is linked from every other published guide, and each link reaches a heading here', async () => {
    const ids = headingIds()
    const others = (await readdir(GUIDES_DIR)).filter(
      (name) => name.endsWith('.md') && name !== 'troubleshooting.md',
    )
    const linkedFrom: string[] = []
    const published: string[] = []
    for (const name of others) {
      const source = await readFile(join(GUIDES_DIR, name), 'utf8')
      const fragments = [...source.matchAll(/\]\(\.\.\/troubleshooting\/#([^)\s]+)\)/g)].map(
        (m) => m[1] ?? '',
      )
      for (const fragment of fragments)
        expect(ids.has(fragment), `${name}: #${fragment}`).toBe(true)
      if (!/^draft: true$/m.test(source)) published.push(name)
      if (fragments.length > 0) linkedFrom.push(name)
    }
    // Every guide that is published rather than a draft points readers here.
    expect(published.length).toBeGreaterThan(0)
    for (const name of published) expect(linkedFrom, name).toContain(name)
  })
})
