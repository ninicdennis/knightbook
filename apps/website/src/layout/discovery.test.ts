import { execFile } from 'node:child_process'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { metadataProblems, readMetadata } from './metadata-check'
import { REDIRECTS } from './redirects'
import { buildTempDir } from '../test/build-dir.js'

/**
 * How the site is found and shared (ticket 0f142dd8): canonical addresses on
 * the production domain (D-046), a sitemap of public pages only, a social image
 * from the approved logo, redirects from one list, robots.txt, and a build that
 * refuses missing or repeated titles and descriptions.
 */

const run = promisify(execFile)
const SITE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const ASTRO_BIN = join(
  dirname(createRequire(import.meta.url).resolve('astro/package.json')),
  'bin',
  'astro.mjs',
)
const DOMAIN = 'https://knightbook.xyz'

let workDir: string
let outDir: string

const page = (path: string) => readFile(join(outDir, path), 'utf8')

async function htmlFiles() {
  const entries = await readdir(outDir, { withFileTypes: true, recursive: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => relative(outDir, join(entry.parentPath, entry.name)).split(sep).join('/'))
}

function build(out: string, env: NodeJS.ProcessEnv = process.env) {
  return run(process.execPath, [ASTRO_BIN, 'build', '--outDir', out], { cwd: SITE_ROOT, env })
}

beforeAll(async () => {
  workDir = await buildTempDir('knightbook-discovery-')
  outDir = join(workDir, 'site')
  await build(outDir)
})

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true })
})

describe('finding and sharing the site', () => {
  it('gives every page a canonical address on knightbook.xyz, except the 404 page', async () => {
    for (const path of await htmlFiles()) {
      const html = await page(path)
      if (/http-equiv="refresh"/.test(html)) continue
      const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1]
      if (path === '404.html') {
        expect(canonical, path).toBeUndefined()
        continue
      }
      const expected = `${DOMAIN}/${path.replace(/index\.html$/, '')}`
      expect(canonical, path).toBe(expected)
      expect(html, path).toContain(`<meta property="og:url" content="${expected}"`)
    }
  })

  it('lists exactly the public pages in the sitemap: no 404, redirect or draft guide', async () => {
    const sitemap = await page('sitemap.xml')
    const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort()
    const drafts: string[] = []
    const expected: string[] = []
    for (const path of await htmlFiles()) {
      const html = await page(path)
      if (path === '404.html' || /http-equiv="refresh"/.test(html)) continue
      // A preview build includes draft guides, marked with the draft note.
      if (path.startsWith('docs/') && /data-draft-guide=/.test(html)) {
        drafts.push(`${DOMAIN}/${path.replace(/index\.html$/, '')}`)
        continue
      }
      expected.push(`${DOMAIN}/${path.replace(/index\.html$/, '')}`)
    }
    expect(drafts.length).toBeGreaterThan(0)
    expect(listed).toEqual(expected.sort())
    for (const draft of drafts) expect(listed).not.toContain(draft)
    expect(listed).not.toContain(`${DOMAIN}/404.html`)
  })

  it('uses the approved logo, 512 pixels square, as every page’s social image', async () => {
    for (const path of ['index.html', 'download/index.html', 'privacy/index.html']) {
      const html = await page(path)
      const image = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ?? ''
      expect(image, path).toMatch(new RegExp(`^${DOMAIN}/_astro/icon\\.[^/]+\\.png$`))
      const file = await readFile(join(outDir, new URL(image).pathname))
      // PNG width and height, big-endian, at bytes 16 and 20.
      expect([file.readUInt32BE(16), file.readUInt32BE(20)], path).toEqual([512, 512])
      expect(html, path).toContain('<meta name="twitter:card" content="summary"')
    }
  })

  it('builds every redirect as a page that points to a real page', async () => {
    expect(Object.keys(REDIRECTS).length).toBeGreaterThan(0)
    for (const [from, to] of Object.entries(REDIRECTS)) {
      const html = await page(`${from.replace(/^\//, '')}index.html`)
      expect(html, from).toContain(`<meta http-equiv="refresh" content="0;url=${to}">`)
      expect(html, from).toContain(`<link rel="canonical" href="${DOMAIN}${to}">`)
      expect(await page(`${to.replace(/^\//, '')}index.html`), to).toMatch(/<main id="main"/)
    }
  })

  it('keeps search engines out of a preview build with robots.txt', async () => {
    expect(await page('robots.txt')).toBe('User-agent: *\nDisallow: /\n')
  })

  it('gives each page its own title and description', async () => {
    const pages = []
    for (const path of await htmlFiles()) {
      const metadata = readMetadata(path, await page(path))
      if (metadata) pages.push(metadata)
    }
    expect(pages.length).toBeGreaterThan(5)
    expect(metadataProblems(pages)).toEqual([])
  })
})

describe('the title and description check', () => {
  it('names a page with no description and two pages sharing a title', () => {
    expect(
      metadataProblems([
        { path: 'a/index.html', title: 'A · Knightbook', description: 'About A.' },
        { path: 'b/index.html', title: 'A · Knightbook', description: '' },
      ]),
    ).toEqual([
      'b/index.html has the same title as a/index.html: "A · Knightbook"',
      'b/index.html has no description',
    ])
  })

  it('stops the real build when two guides share a title', async () => {
    const docs = join(workDir, 'duplicate-guides')
    await mkdir(docs, { recursive: true })
    for (const name of ['one', 'two']) {
      await writeFile(
        join(docs, `${name}.md`),
        `---\ntitle: Same title\ndescription: Guide ${name}.\ngroup: Start here\norder: 1\ndraft: true\n---\n\nText.\n`,
      )
    }
    const failure = await build(join(workDir, 'duplicate'), {
      ...process.env,
      KNIGHTBOOK_DOCS_DIR_FOR_TESTS: docs,
    }).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(Error)
    expect(String((failure as { stderr?: string }).stderr ?? failure)).toMatch(
      /docs\/two\/index\.html has the same title as docs\/one\/index\.html|docs\/one\/index\.html has the same title as docs\/two\/index\.html/,
    )
    // A whole `astro build`, like the other build-in-a-test cases; the default 5 s
    // was enough on Linux and not on Windows.
  }, 120_000)
})
