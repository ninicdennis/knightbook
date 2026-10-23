import { execFile } from 'node:child_process'
import { access, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import type { Server } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { chromium, type Browser } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fixtureRelease } from '../download/test-releases'
import { buildTempDir } from '../test/build-dir.js'
import { serveBuild } from '../test/static-server.js'
import { UMAMI } from './analytics'
import { REFERRER_POLICY } from './security-policy'

/**
 * The Content-Security-Policy and Referrer-Policy meta tags (D-053) in a
 * production build, the one that loads Umami. layout.test.ts checks a preview
 * build's policy names no other site.
 *
 * Every page is opened in Chromium with Umami's address answered by a stand-in
 * script that posts a visit the way the real one does, so a policy that blocks
 * the script or its post, or anything the page itself loads, shows up as a
 * violation. Without Chromium the browser half skips, unless
 * REQUIRE_WEBSITE_BROWSER makes that a failure (see site-accessibility.test.ts).
 */

const run = promisify(execFile)
const SITE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const ASTRO_BIN = join(
  dirname(createRequire(import.meta.url).resolve('astro/package.json')),
  'bin',
  'astro.mjs',
)
const UMAMI_ORIGIN = new URL(UMAMI.src).origin
const STAND_IN = `fetch(new URL('/api/send', document.currentScript.src), { method: 'POST', body: '{}' })`

const browserPath = process.env['KNIGHTBOOK_CHROMIUM_PATH'] || chromium.executablePath()
const browserInstalled = await access(browserPath).then(
  () => true,
  () => false,
)
const required = Boolean(process.env['REQUIRE_WEBSITE_BROWSER'])

let workDir: string
let outDir: string
let pages: string[]
let server: Server | undefined
let origin: string
let browser: Browser | undefined

/** The pages BaseLayout renders; a redirect page (redirects.ts) is Astro's own. */
async function layoutPages() {
  const entries = await readdir(outDir, { withFileTypes: true, recursive: true })
  const found: string[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.html')) continue
    const path = relative(outDir, join(entry.parentPath, entry.name)).split(sep).join('/')
    const html = await readFile(join(outDir, path), 'utf8')
    if (!/http-equiv="refresh"/.test(html)) found.push(path)
  }
  return found
}

/** The address a visitor would use for a built file, such as /docs/ for docs/index.html. */
function addressOf(path: string) {
  return path === '404.html' ? '/no-such-page/' : `/${path.replace(/index\.html$/, '')}`
}

function directive(policy: string, name: string) {
  const found = policy.split(';').find((part) => part.trim().split(' ')[0] === name)
  return found?.trim().split(' ').slice(1) ?? []
}

interface Opened {
  violations: string[]
  umamiPosts: number
}

/** Opens a page and gathers every CSP violation it reports, and Umami's visit posts. */
async function open(path: string, act?: (page: import('playwright-core').Page) => Promise<void>) {
  const context = await browser!.newContext()
  const result: Opened = { violations: [], umamiPosts: 0 }
  await context.route(`${UMAMI_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/script.js') {
      return route.fulfill({ contentType: 'text/javascript', body: STAND_IN })
    }
    if (url.pathname === '/api/send' && route.request().method() === 'POST') {
      result.umamiPosts += 1
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    }
    return route.fulfill({ status: 404 })
  })
  // Nothing may reach any other site, whether or not the policy would allow it.
  await context.route(
    (url) => url.origin !== origin && url.origin !== UMAMI_ORIGIN,
    (route) => route.fulfill({ status: 404 }),
  )
  await context.exposeFunction('reportViolation', (text: string) => result.violations.push(text))
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const report = (window as unknown as { reportViolation: (text: string) => void })
        .reportViolation
      report(`${event.effectiveDirective} blocked ${event.blockedURI || '(inline)'}`)
    })
  })
  const page = await context.newPage()
  try {
    await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' })
    await act?.(page)
    // A violation event is queued as a task; give the last ones a moment to arrive.
    await page.waitForTimeout(100)
  } finally {
    await context.close()
  }
  return result
}

beforeAll(async () => {
  workDir = await buildTempDir('knightbook-csp-')
  const dataFile = join(workDir, 'releases.json')
  await writeFile(dataFile, JSON.stringify({ releases: [fixtureRelease('0.3.0')] }))
  outDir = join(workDir, 'site')
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    KNIGHTBOOK_SITE_STAGE: 'production',
    KNIGHTBOOK_RELEASE_DATA_FOR_TESTS: dataFile,
  }
  delete env['KNIGHTBOOK_DOCS_DIR_FOR_TESTS']
  await run(process.execPath, [ASTRO_BIN, 'build', '--outDir', outDir], { cwd: SITE_ROOT, env })
  pages = await layoutPages()
  if (!browserInstalled) return
  ;({ server, origin } = await serveBuild(outDir))
  browser = await chromium.launch({ executablePath: browserPath })
}, 240_000)

afterAll(async () => {
  await browser?.close()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)))
  if (workDir) await rm(workDir, { recursive: true, force: true })
})

describe('security meta tags in a production build', () => {
  it('opens every page head with the policy, then the referrer policy', async () => {
    expect(pages).toContain('index.html')
    expect(pages).toContain('404.html')
    for (const path of pages) {
      const html = await readFile(join(outDir, path), 'utf8')
      expect(html, path).toMatch(
        new RegExp(
          `<head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="[^"]+"><meta name="referrer" content="${REFERRER_POLICY}">`,
        ),
      )
      expect(html.split('http-equiv="Content-Security-Policy"').length - 1, path).toBe(1)
    }
  })

  it("lets Umami's script load and post its visit, and nothing else from another site", async () => {
    const html = await readFile(join(outDir, 'index.html'), 'utf8')
    const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? ''
    expect(directive(policy, 'default-src')).toEqual(["'self'"])
    expect(directive(policy, 'script-src')).toEqual(["'self'", UMAMI_ORIGIN])
    expect(directive(policy, 'connect-src')).toEqual(["'self'", UMAMI_ORIGIN])
    expect(directive(policy, 'img-src')).toEqual(["'self'"])
    expect(directive(policy, 'object-src')).toEqual(["'none'"])
    expect(directive(policy, 'base-uri')).toEqual(["'self'"])
  })
})

describe.skipIf(!browserInstalled && !required)('the policy in a browser', () => {
  it('has a browser to run in', () => {
    expect(
      browserInstalled,
      'Chromium is not installed: run playwright-core install chromium',
    ).toBe(true)
  })

  it('loads every page with no violation, and Umami posts one visit from each', async () => {
    // The code blocks' style attributes and Astro's inlined <style> blocks are on these.
    expect(pages).toContain('docs/tickets-and-verification/index.html')
    for (const path of pages) {
      const { violations, umamiPosts } = await open(addressOf(path))
      expect(violations, path).toEqual([])
      expect(umamiPosts, path).toBe(1)
    }
  }, 120_000)

  it('refuses a script from another site, an inline script and an image from another site', async () => {
    let ran: unknown
    const { violations } = await open('/', async (page) => {
      await page.evaluate(() => {
        const remote = document.createElement('script')
        remote.src = 'https://scripts.example/injected.js'
        document.head.append(remote)
        const inline = document.createElement('script')
        inline.textContent = 'window.injectedRan = true'
        document.head.append(inline)
        const image = document.createElement('img')
        image.src = 'https://images.example/pixel.png'
        document.body.append(image)
      })
      ran = await page.evaluate(() => (window as unknown as { injectedRan?: boolean }).injectedRan)
    })
    expect(ran).toBeUndefined()
    expect(violations).toEqual(
      expect.arrayContaining([
        'script-src-elem blocked https://scripts.example/injected.js',
        'script-src-elem blocked inline',
        'img-src blocked https://images.example/pixel.png',
      ]),
    )
  }, 60_000)
})
