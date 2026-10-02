import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Builds the real site once, into a temporary folder, and checks the HTML a
 * visitor would receive. Testing the output rather than the components is what
 * shows the pages need no JavaScript: whatever Astro decides to emit is here.
 */

const run = promisify(execFile)
const SITE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const ASTRO_BIN = join(
  dirname(createRequire(import.meta.url).resolve('astro/package.json')),
  'bin',
  'astro.mjs',
)

const MAIN_LINKS = [
  ['How it works', '/#how-it-works'],
  ['Documentation', '/docs/'],
  ['Releases', '/releases/'],
] as const

let outDir: string

/** The first part of `html` matching `pattern`; the test fails if there is none. */
function slice(html: string, pattern: RegExp) {
  const match = html.match(pattern)
  expect(match, `nothing matches ${pattern}`).not.toBeNull()
  return match?.[0] ?? ''
}

/** A link with this exact address and text, whatever attributes Astro adds. */
function linkTo(href: string, label: string) {
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  return new RegExp(`<a href="${escape(href)}"[^>]*>${escape(label)}</a>`)
}

async function page(path: string) {
  return readFile(join(outDir, path), 'utf8')
}

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true })
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
}

beforeAll(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'knightbook-website-'))
  await run(process.execPath, [ASTRO_BIN, 'build', '--outDir', outDir], { cwd: SITE_ROOT })
})

afterAll(async () => {
  await rm(outDir, { recursive: true, force: true })
})

describe('the built site', () => {
  it('is static HTML with no client-side JavaScript', async () => {
    const files = await filesUnder(outDir)
    expect(files).toContain('index.html')
    expect(files.filter((name) => /\.m?js$/.test(name))).toEqual([])

    for (const path of ['index.html', '404.html']) {
      expect(await page(path), path).not.toMatch(/<script/i)
    }
  })

  it('opens every page with a skip link to the main content', async () => {
    for (const path of ['index.html', '404.html']) {
      const html = await page(path)
      const firstLink = html.match(/<body[^>]*>\s*<a [^>]*href="([^"]+)"[^>]*>([^<]+)</)
      expect(firstLink?.[1], path).toBe('#main')
      expect(firstLink?.[2], path).toBe('Skip to content')
      expect(html, path).toMatch(/<main id="main"/)
    }
  })

  it('has a header with the wordmark, the main links and a Download action', async () => {
    const html = await page('index.html')
    // An empty alt marks the logo as decorative; the wordmark beside it names the link.
    expect(html).toMatch(
      /<a class="brand[^"]*" href="\/"[^>]*>\s*<img[^>]*\salt(?:="")?[\s>][\s\S]*?Knightbook<\/span>/,
    )
    const inlineNav = slice(html, /<nav class="inline-nav"[\s\S]*?<\/nav>/)
    for (const [label, href] of MAIN_LINKS) expect(inlineNav).toMatch(linkTo(href, label))
    expect(slice(html, /<header[\s\S]*?<\/header>/)).toMatch(
      /<a class="kb-button download[^"]*" href="\/download\/"[^>]*>Download<\/a>/,
    )
  })

  it('folds the links into a menu that works without JavaScript on narrow screens', async () => {
    const html = await page('index.html')
    const menu = slice(html, /<details class="menu[\s\S]*?<\/details>/)
    expect(menu).toMatch(/^<details class="menu[^"]*"[^>]*>\s*<summary[^>]*>Menu<\/summary>/)
    for (const [label, href] of MAIN_LINKS) expect(menu).toMatch(linkTo(href, label))
    // The Download action is outside the menu, so it stays visible when the menu is closed.
    expect(menu).not.toContain('href="/download/"')
  })

  it('ends every page with a footer linking the main pages', async () => {
    for (const path of ['index.html', '404.html']) {
      const footer = slice(await page(path), /<footer class="site-footer[\s\S]*?<\/footer>/)
      for (const [label, href] of [
        ['Download', '/download/'],
        ['Documentation', '/docs/'],
        ['Releases', '/releases/'],
      ]) {
        expect(footer, path).toMatch(linkTo(href, label))
      }
    }
  })

  it('has a 404 page that says what happened and offers the main pages', async () => {
    const notFound = await page('404.html')
    expect(notFound).toContain('<title>Page not found · Knightbook</title>')
    expect(notFound).toMatch(/<h1[^>]*>Page not found<\/h1>/)
    const content = slice(notFound, /<main[\s\S]*?<\/main>/)
    for (const [label, href] of [
      ['Home', '/'],
      ['Download', '/download/'],
      ['Documentation', '/docs/'],
      ['Releases', '/releases/'],
    ]) {
      expect(content).toMatch(linkTo(href, label))
    }
  })

  it('gives the homepage the plain product name as its title, and a description', async () => {
    const home = await page('index.html')
    expect(home).toContain('<title>Knightbook</title>')
    expect(home).toMatch(/<meta name="description" content="[^"]+"/)
  })
})
