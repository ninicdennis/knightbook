import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
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
  // Paths relative to the build folder, with forward slashes, such as "download/index.html".
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)).split(sep).join('/'))
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
    // Exactly the site's pages and one page per guide in src/content/docs; nothing
    // else is generated.
    const guides = (await readdir(join(SITE_ROOT, 'src', 'content', 'docs')))
      .filter((name) => name.endsWith('.md'))
      .map((name) => `docs/${name.replace(/\.md$/, '')}/index.html`)
    expect(files.filter((name) => name.endsWith('.html')).sort()).toEqual(
      [
        '404.html',
        'docs/index.html',
        'download/index.html',
        'index.html',
        'releases/index.html',
        'license/index.html',
        'privacy/index.html',
        ...guides,
      ].sort(),
    )
    expect(files.filter((name) => /\.m?js$/.test(name))).toEqual([])

    for (const path of ['index.html', '404.html']) {
      expect(await page(path), path).not.toMatch(/<script/i)
    }
  })

  it('marks every page of a preview build noindex and labels it a preview (D-044)', async () => {
    for (const path of (await filesUnder(outDir)).filter((name) => name.endsWith('.html'))) {
      const html = await page(path)
      expect(html, path).toMatch(/<meta name="robots" content="noindex, nofollow"/)
      expect(html, path).toMatch(
        /<p class="preview-banner[^"]*" role="note"[^>]*>\s*Preview build\. This is not the published Knightbook website\.\s*<\/p>/,
      )
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

  it('has the same header on every page: wordmark, main links and a Download action', async () => {
    for (const path of ['index.html', '404.html']) {
      const header = slice(await page(path), /<header[\s\S]*?<\/header>/)
      // An empty alt marks the logo as decorative; the wordmark beside it names the link.
      expect(header, path).toMatch(
        /<a class="brand[^"]*" href="\/"[^>]*>\s*<img[^>]*\salt(?:="")?[\s>][\s\S]*?Knightbook<\/span>/,
      )
      const inlineNav = slice(header, /<nav class="inline-nav"[\s\S]*?<\/nav>/)
      expect(inlineNav, path).toMatch(/^<nav class="inline-nav[^"]*" aria-label="Main"/)
      for (const [label, href] of MAIN_LINKS) expect(inlineNav, path).toMatch(linkTo(href, label))
      expect(header, path).toMatch(
        /<a class="kb-button download[^"]*" href="\/download\/"[^>]*>Download<\/a>/,
      )
    }
  })

  it('folds the links into a menu that works without JavaScript on narrow screens', async () => {
    for (const path of ['index.html', '404.html']) {
      const menu = slice(await page(path), /<details class="menu[\s\S]*?<\/details>/)
      expect(menu, path).toMatch(
        /^<details class="menu[^"]*"[^>]*>\s*<summary[^>]*>Menu<\/summary>\s*<nav aria-label="Main"/,
      )
      for (const [label, href] of MAIN_LINKS) expect(menu, path).toMatch(linkTo(href, label))
      // The Download action is outside the menu, so it stays visible when the menu is closed.
      expect(menu, path).not.toContain('href="/download/"')
    }
  })

  it('names the footer navigation for assistive technology', async () => {
    for (const path of ['index.html', '404.html']) {
      const footer = slice(await page(path), /<footer[\s\S]*?<\/footer>/)
      expect(footer, path).toMatch(/<nav class="groups[^"]*" aria-label="Footer"/)
    }
  })

  it('shows the cropped logo artwork, sized in the header and footer', async () => {
    const html = await page('index.html')
    // Built from the desktop app's derived icon, whose artwork fills the square,
    // not the canonical PNG with its wide transparent margin.
    const headerLogo = slice(slice(html, /<header[\s\S]*?<\/header>/), /<img[^>]*>/)
    expect(headerLogo).toMatch(/src="\/_astro\/icon\./)
    expect(headerLogo).toMatch(/width="32"[^>]*height="32"|height="32"[^>]*width="32"/)
    const footerLogo = slice(slice(html, /<footer[\s\S]*?<\/footer>/), /<img[^>]*>/)
    expect(footerLogo).toMatch(/src="\/_astro\/icon\./)
  })

  it('ends every page with the brand line and Product and Guides groups', async () => {
    for (const path of ['index.html', '404.html']) {
      const footer = slice(await page(path), /<footer class="site-footer[\s\S]*?<\/footer>/)
      expect(footer, path).toMatch(/<a class="brand[^"]*" href="\/"[\s\S]*?Knightbook<\/span>/)
      expect(footer, path).toContain('Project documents and a work board, together.')

      const groups = [...footer.matchAll(/<h2[^>]*>([^<]+)<\/h2>\s*<ul[^>]*>([\s\S]*?)<\/ul>/g)]
      expect(
        groups.map((group) => group[1]),
        path,
      ).toEqual(['Product', 'Guides'])
      const [product, guides] = groups.map((group) => group[2] ?? '')
      for (const [label, href] of [
        ['Download', '/download/'],
        ['How it works', '/#how-it-works'],
        ['Releases', '/releases/'],
      ]) {
        expect(product, path).toMatch(linkTo(href, label))
      }
      expect(guides, path).toMatch(linkTo('/docs/', 'Documentation'))
    }
  })

  it('links privacy, the license, support and the source code in the footer', async () => {
    for (const path of ['index.html', '404.html', 'license/index.html', 'privacy/index.html']) {
      const html = await page(path)
      const utility = slice(html, /<ul class="utility[\s\S]*?<\/ul>/)
      const links = [...utility.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => [
        m[1],
        m[2],
      ])
      expect(links, path).toEqual([
        ['/privacy/', 'Privacy'],
        ['/license/', 'License'],
        ['https://github.com/ninicdennis/knightbook/issues/new/choose', 'Support'],
        ['https://github.com/ninicdennis/knightbook', 'Source code'],
      ])
      expect(html, path).not.toMatch(/all rights reserved|©/i)
    }
  })

  it('explains privacy in four separate sections, with its last-updated date', async () => {
    const html = await page('privacy/index.html')
    expect(html).toContain('<title>Privacy · Knightbook</title>')
    expect(html).toMatch(
      /Last updated <time datetime="\d{4}-\d{2}-\d{2}"[^>]*>\d{1,2} [A-Z][a-z]+ \d{4}<\/time>/,
    )
    const headings = [...html.matchAll(/<h2 id="([^"]+)"[^>]*>([^<]+)<\/h2>/g)].map((m) => m[2])
    expect(headings.slice(0, 4)).toEqual([
      'This website',
      'The desktop app',
      'The AI tool you connect',
      'Getting help',
    ])
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(text).toMatch(/GitHub logs the IP address of every visitor/)
    expect(text).toMatch(/is up to them and their terms, not Knightbook/)
    expect(text).toMatch(/Everything in an issue, including your GitHub username, is public/)
    // Claims the evidence does not support (spec §9).
    expect(text).not.toMatch(
      /no data (collection|leaves)|zero data|never leaves your (device|computer)|fully offline|secure by default/i,
    )
  })

  it('shows the license summary and the full text of LICENSE.md, with one h1', async () => {
    const html = await page('license/index.html')
    expect(html).toContain('<title>License · Knightbook</title>')
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
    expect(html).toMatch(
      /Knightbook is free\. Its source code is public under the Functional Source License/,
    )
    expect(html).toMatch(
      /cannot offer Knightbook, or something built from it, as a commercial product/,
    )
    expect(html).toContain('This summary is not the license.')
    expect(html).toMatch(
      /it is also in the <a href="https:\/\/github\.com\/ninicdennis\/knightbook"/,
    )
    // Sentences only the license text has, so the page shows the real file.
    const license = await readFile(join(SITE_ROOT, '..', '..', 'LICENSE.md'), 'utf8')
    expect(license).toContain('A Competing Use')
    expect(html).toMatch(
      /<h2[^>]*>Functional Source License, Version 1\.1, ALv2 Future License<\/h2>/,
    )
    expect(html).toContain('A Competing Use')
    expect(html).toMatch(/Grant of Future License/)
  })

  it('offers nothing for sale anywhere, and never says open source (D-043): no price, purchase, trial, subscription or sign-up', async () => {
    for (const path of (await filesUnder(outDir)).filter((name) => name.endsWith('.html'))) {
      const text = (await page(path)).replace(/<[^>]+>/g, ' ')
      expect(text, path).not.toMatch(
        /\$\s?\d|\bpric(?:e|es|ing)\b|\bpurchase|\bbuy\b|free trial|\btrial\b|subscri|sign[ -]?up|create an account|open[ -]source/i,
      )
    }
  })

  it('marks no header link as the current page on the homepage or 404', async () => {
    // How it works is an anchor on the homepage, never a page of its own, and the
    // other destinations are not built yet, so nothing here is "current".
    for (const path of ['index.html', '404.html']) {
      expect(await page(path), path).not.toContain('aria-current')
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
