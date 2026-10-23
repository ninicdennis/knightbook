import AxeBuilder from '@axe-core/playwright'
import { execFile } from 'node:child_process'
import { access, rm, writeFile } from 'node:fs/promises'
import type { Server } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { chromium, type Browser, type Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fixtureRelease } from '../download/test-releases'
import { buildTempDir } from '../test/build-dir.js'
import { serveBuild } from '../test/static-server.js'

/**
 * The site in a real browser (spec §8): every page template at a phone and a wide
 * width with no sideways page scroll and no serious or critical axe findings, and
 * the downloads and a guide still complete with JavaScript off.
 *
 * Built once with fixture release data, so the download page has real links and
 * long filenames to lay out. Chromium comes from Playwright's own download. When
 * it is not installed these tests skip, and REQUIRE_WEBSITE_BROWSER (set in CI)
 * turns that skip into a failure, the same way REQUIRE_PACKAGED_APP does.
 */

const run = promisify(execFile)
const SITE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const ASTRO_BIN = join(
  dirname(createRequire(import.meta.url).resolve('astro/package.json')),
  'bin',
  'astro.mjs',
)

const RELEASES = [fixtureRelease('0.3.0'), fixtureRelease('0.4.0', { channel: 'preview' })]

/** One page per template. */
const PAGES = [
  ['home', '/'],
  ['download', '/download/'],
  ['docs index', '/docs/'],
  ['guide', '/docs/tickets-and-verification/'],
  ['releases', '/releases/'],
  ['license', '/license/'],
  ['privacy', '/privacy/'],
  ['not found', '/no-such-page/'],
] as const

const VIEWPORTS = [
  { name: 'narrow', width: 375, height: 812 },
  { name: 'wide', width: 1440, height: 900 },
] as const

// A Chromium already on this machine can stand in for Playwright's own build, so a
// local run need not download one. CI leaves this unset and installs the right build.
const browserPath = process.env['KNIGHTBOOK_CHROMIUM_PATH'] || chromium.executablePath()
const browserInstalled = await access(browserPath).then(
  () => true,
  () => false,
)
const required = Boolean(process.env['REQUIRE_WEBSITE_BROWSER'])

let workDir: string
let server: Server
let origin: string
let browser: Browser

beforeAll(async () => {
  if (!browserInstalled) return
  workDir = await buildTempDir('knightbook-a11y-')
  const dataFile = join(workDir, 'releases.json')
  await writeFile(dataFile, JSON.stringify({ releases: RELEASES }))
  const outDir = join(workDir, 'site')
  const env: NodeJS.ProcessEnv = { ...process.env, KNIGHTBOOK_RELEASE_DATA_FOR_TESTS: dataFile }
  delete env['KNIGHTBOOK_DOCS_DIR_FOR_TESTS']
  delete env['KNIGHTBOOK_SITE_STAGE']
  await run(process.execPath, [ASTRO_BIN, 'build', '--outDir', outDir], { cwd: SITE_ROOT, env })
  ;({ server, origin } = await serveBuild(outDir))
  browser = await chromium.launch({ executablePath: browserPath })
  // A build plus a browser launch, beside other packages' suites: more than the
  // shared two minutes on a slow Windows runner (see commit a20df5f).
}, 240_000)

afterAll(async () => {
  await browser?.close()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)))
  if (workDir) await rm(workDir, { recursive: true, force: true })
})

interface OpenOptions {
  width: number
  height: number
  script?: boolean
  scheme?: 'light' | 'dark'
}

async function open(path: string, options: OpenOptions) {
  const context = await browser.newContext({
    viewport: { width: options.width, height: options.height },
    javaScriptEnabled: options.script ?? true,
    colorScheme: options.scheme ?? 'light',
  })
  const page = await context.newPage()
  await page.goto(`${origin}${path}`)
  return page
}

function sidewaysOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}

describe.skipIf(!browserInstalled && !required)('the website in a browser', () => {
  it('has a browser to run in', () => {
    // Only reached when it is required or present; says plainly what is missing.
    expect(
      browserInstalled,
      'Chromium is not installed: run playwright-core install chromium',
    ).toBe(true)
  })

  // Both schemes at both widths, so axe's contrast check sees the dark tokens too.
  const layouts = VIEWPORTS.flatMap((viewport) =>
    (['light', 'dark'] as const).map((scheme) => ({ ...viewport, scheme })),
  )
  for (const layout of layouts) {
    for (const [name, path] of PAGES) {
      it(`${name} at ${layout.width}px, ${layout.scheme}: no sideways scroll or serious axe findings`, async () => {
        const page = await open(path, layout)
        try {
          // Closed panels take no width, so open every one (checksum commands, the
          // preview, menus, FAQ answers) before measuring and scanning.
          await page.evaluate(() => {
            for (const details of document.querySelectorAll('details')) details.open = true
          })
          expect(await sidewaysOverflow(page), `${path} scrolls sideways`).toBeLessThanOrEqual(0)
          const { violations } = await new AxeBuilder({ page }).analyze()
          const serious = violations
            .filter(
              (violation) => violation.impact === 'serious' || violation.impact === 'critical',
            )
            .map(
              (violation) =>
                `${violation.id}: ${violation.nodes.map((node) => node.target).join(', ')}`,
            )
          expect(serious, path).toEqual([])
        } finally {
          await page.context().close()
        }
      }, 60_000)
    }
  }

  it('puts a visible skip link first in the keyboard order, leading to the main content', async () => {
    const page = await open('/docs/tickets-and-verification/', { width: 1440, height: 900 })
    try {
      await page.keyboard.press('Tab')
      const focused = page.locator(':focus')
      expect(await focused.textContent()).toContain('Skip to content')
      expect(await focused.getAttribute('href')).toBe('#main')
      // It sits above the top edge until focused; isVisible() alone would pass off screen.
      const box = await focused.boundingBox()
      expect(box?.y ?? -1).toBeGreaterThanOrEqual(0)
      expect(await page.locator('#main').count()).toBe(1)
    } finally {
      await page.context().close()
    }
  }, 60_000)

  it('serves the not-found page with a 404 status', async () => {
    const response = await fetch(`${origin}/no-such-page/`)
    expect(response.status).toBe(404)
    expect(await response.text()).toContain('<h1')
  })

  it('reaches every download with JavaScript off', async () => {
    const page = await open('/download/', { width: 375, height: 812, script: false })
    try {
      // The opt-in preview sits in a native <details>, which opens without a
      // script; open it the way a visitor would before looking for its links.
      for (const summary of await page.locator('main details.opt-in > summary').all()) {
        await summary.click()
      }
      for (const asset of RELEASES.flatMap((release) => release.assets)) {
        const link = page.locator(`a[href="${asset.url}"]`).first()
        expect(await link.isVisible(), asset.filename).toBe(true)
      }
    } finally {
      await page.context().close()
    }
  }, 60_000)

  it('shows the whole of a guide with JavaScript off', async () => {
    const page = await open('/docs/tickets-and-verification/', {
      width: 375,
      height: 812,
      script: false,
    })
    try {
      const headings = await page.locator('article h2').all()
      expect(headings.length).toBeGreaterThan(5)
      for (const heading of headings) expect(await heading.isVisible()).toBe(true)
      // The last section, so nothing after the fold depends on a script to appear.
      expect(
        await page.getByText('What Knightbook does is make the record visible').isVisible(),
      ).toBe(true)
    } finally {
      await page.context().close()
    }
  }, 60_000)
})
