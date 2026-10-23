import { execFile } from 'node:child_process'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTempDir } from '../test/build-dir.js'

/**
 * Builds the site with the real guides, and with fixture guides that exercise
 * what the placeholders cannot: headings, a published guide's version, links
 * between guides, link syntax shown in code, a production build that drops
 * drafts, and a broken link.
 */

const run = promisify(execFile)
const SITE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const GUIDES_DIR = join(SITE_ROOT, 'src', 'content', 'docs')
const INTERNAL_DOCS = resolve(SITE_ROOT, '..', '..', 'docs')
const ASTRO_BIN = join(
  dirname(createRequire(import.meta.url).resolve('astro/package.json')),
  'bin',
  'astro.mjs',
)

const PUBLISHED = `---
title: Working with tickets
description: How tickets move from Backlog to Done.
group: Everyday use
order: 1
appVersion: 0.3.0
---

Read [the draft guide](../writing-in-progress/) first, or go [back to all guides](/docs/).

A link is written \`[the spec](spec.md)\`, or \`\` \`[a ticket](ticket.md)\` \`\`, like [this one](../writing-in-progress/):

\`\`\`markdown
See [the installation guide](../not-a-guide/).
\`\`\`

## The four states

Backlog, In progress, Verification and Done.

### Verification

Where finished work waits for you.

## Deciding Done

Only you decide.
`

const DRAFT = `---
title: Writing in progress
description: A guide that is not written yet.
group: Start here
order: 1
draft: true
---

See [Working with tickets](../working-with-tickets/).
`

let workDir: string

async function build(name: string, env: NodeJS.ProcessEnv) {
  const outDir = join(workDir, name)
  const clean: NodeJS.ProcessEnv = { ...process.env, ...env }
  if (!env.KNIGHTBOOK_DOCS_DIR_FOR_TESTS) delete clean.KNIGHTBOOK_DOCS_DIR_FOR_TESTS
  if (!env.KNIGHTBOOK_SITE_STAGE) delete clean.KNIGHTBOOK_SITE_STAGE
  await run(process.execPath, [ASTRO_BIN, 'build', '--outDir', outDir], {
    cwd: SITE_ROOT,
    env: clean,
  })
  return outDir
}

async function guideFolder(name: string, files: Record<string, string>) {
  const folder = join(workDir, name)
  await mkdir(folder, { recursive: true })
  for (const [file, content] of Object.entries(files)) await writeFile(join(folder, file), content)
  return folder
}

async function htmlFiles(directory: string, prefix = ''): Promise<string[]> {
  const found: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) found.push(...(await htmlFiles(join(directory, entry.name), path)))
    else if (entry.name.endsWith('.html')) found.push(path)
  }
  return found
}

let real: string
let fixture: string

beforeAll(async () => {
  workDir = await buildTempDir('knightbook-docs-')
  real = await build('real', {})
  const guides = await guideFolder('guides', {
    'working-with-tickets.md': PUBLISHED,
    'writing-in-progress.md': DRAFT,
  })
  fixture = await build('fixture', { KNIGHTBOOK_DOCS_DIR_FOR_TESTS: guides })
})

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true })
})

const page = (outDir: string, path: string) => readFile(join(outDir, path), 'utf8')

describe('the documentation section', () => {
  it('publishes a page for every guide in src/content/docs, and for nothing else under /docs/', async () => {
    const guideFiles = (await readdir(GUIDES_DIR)).filter((name) => name.endsWith('.md'))
    const expected = guideFiles.map((name) => `docs/${name.replace(/\.md$/, '')}/index.html`)
    const built = (await htmlFiles(real)).filter((path) => path.startsWith('docs/'))
    expect(built.sort()).toEqual(['docs/index.html', ...expected].sort())
  })

  it('never reads the internal docs folder', async () => {
    const config = await readFile(join(SITE_ROOT, 'src', 'content.config.ts'), 'utf8')
    expect(config).toContain("'./src/content/docs'")
    const sources = await readdir(join(SITE_ROOT, 'src'), { recursive: true })
    for (const file of sources.filter((name) => /\.(astro|ts|mjs)$/.test(name))) {
      const source = await readFile(join(SITE_ROOT, 'src', file), 'utf8')
      // Any relative path, of any depth, that resolves into the repository's
      // internal docs folder. The site's own src/docs code folder is fine.
      const internal = [...source.matchAll(/['"`](\.{1,2}\/[^'"`]*)['"`]/g)]
        .map((match) => resolve(dirname(join(SITE_ROOT, 'src', file)), match[1] ?? ''))
        .filter((path) => path === INTERNAL_DOCS || path.startsWith(`${INTERNAL_DOCS}${sep}`))
      expect(internal, file).toEqual([])
    }
    const index = await page(real, 'docs/index.html')
    expect(index).not.toContain('Accepted decisions')
  })

  it('groups the index as Start here, Everyday use, AI setup and Troubleshooting, linking every spec route', async () => {
    const index = await page(real, 'docs/index.html')
    const main = index.match(/<main[\s\S]*?<\/main>/)?.[0] ?? ''
    const groups = [...main.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1])
    expect(groups).toEqual(['Start here', 'Everyday use', 'AI setup', 'Troubleshooting'])
    for (const route of [
      'getting-started',
      'installation',
      'connecting-ai',
      'projects-and-documents',
      'tickets-and-verification',
      'troubleshooting',
    ]) {
      expect(index, route).toContain(`href="/docs/${route}/"`)
    }
  })

  it('marks placeholder guides as drafts, on the index and on the guide', async () => {
    const index = await page(fixture, 'docs/index.html')
    expect(index.match(/<span class="draft[^"]*"[^>]*>Draft</g)).toHaveLength(1)
    const guide = await page(fixture, 'docs/writing-in-progress/index.html')
    expect(guide).toMatch(
      /data-draft-guide="writing-in-progress"[^>]*>\s*Draft: this guide has not been written yet/,
    )
  })

  it.each([
    ['tickets-and-verification', 'deciding-done'],
    ['projects-and-documents', 'moving-and-sharing-a-project-with-git'],
  ])('publishes the %s guide as written, for the release it describes', async (slug, heading) => {
    const guide = await page(real, `docs/${slug}/index.html`)
    expect(guide).not.toContain('data-draft-guide')
    expect(guide).toMatch(/>Written for Knightbook 0\.2\.0</)
    expect(guide).toMatch(new RegExp(`<h2 id="${heading}"`))
  })

  it('publishes the installation guide with a section per platform, updating and removing', async () => {
    const guide = await page(real, 'docs/installation/index.html')
    expect(guide).not.toContain('data-draft-guide')
    expect(guide).toMatch(/>Written for Knightbook 0\.2\.0</)
    for (const heading of [
      'choosing-a-download',
      'windows',
      'macos',
      'linux',
      'updating',
      'removing-knightbook',
      'what-stays-the-apps-settings',
      'what-stays-your-projects',
    ]) {
      expect(guide, heading).toMatch(new RegExp(`<h2 id="${heading}"|<h3 id="${heading}"`))
    }
    // One installer name per target the release must carry (release-assets.mjs).
    for (const name of [
      'Knightbook-&lt;version&gt;-windows-x64.exe',
      'Knightbook-&lt;version&gt;-macos-arm64.dmg',
      'Knightbook-&lt;version&gt;-macos-x64.dmg',
      'Knightbook-&lt;version&gt;-linux-amd64.deb',
    ]) {
      expect(guide, name).toContain(name)
    }
    expect(guide).toContain('Knightbook has no updater yet')
    expect(guide).toContain('<strong>Not yet checked')
  })

  it('never tells readers to turn off a protection for the whole computer', async () => {
    const text = (await page(real, 'docs/installation/index.html')).replace(/<[^>]+>/g, ' ')
    for (const advice of [
      /spctl\s+--master-disable/i,
      /--global-disable/i,
      /xattr\s+-[a-z]*[cd]/i,
      /\bAnywhere\b/,
      /turn off (?:SmartScreen|Microsoft Defender|Windows Defender)/i,
      /disable (?:Gatekeeper|SmartScreen|Defender)/i,
    ]) {
      expect(text, String(advice)).not.toMatch(advice)
    }
    expect(text).toMatch(/Do not turn off Gatekeeper or other protections for\s+the whole Mac/)
    expect(text).toContain('report it')
  })

  it.each(['installation', 'getting-started', 'connecting-ai', 'troubleshooting'])(
    'gives no steps for getting past an unsigned-app warning in the %s guide',
    async (slug) => {
      const text = (await page(real, `docs/${slug}/index.html`)).replace(/<[^>]+>/g, ' ')
      for (const step of [
        /Run anyway/i,
        /Open Anyway/i,
        /More info/i,
        /Privacy\s+&amp;\s+Security/i,
      ]) {
        expect(text, String(step)).not.toMatch(step)
      }
    },
  )

  it('tells readers to commit .projectspace and ignore only its coordination files', async () => {
    const guide = await page(real, 'docs/projects-and-documents/index.html')
    expect(guide).toContain('.projectspace/runtime/')
    expect(guide).toContain('.projectspace/.write-lock')
    expect(guide).toMatch(/Do not ignore the whole <code>\.projectspace\/<\/code> folder/)
  })

  it('gives a guide a sidebar, a no-JavaScript menu, an on-page contents list and anchored headings', async () => {
    const guide = await page(fixture, 'docs/working-with-tickets/index.html')
    const sidebar = guide.match(/<aside class="sidebar[\s\S]*?<\/aside>/)?.[0] ?? ''
    expect(sidebar).toMatch(/<nav aria-label="Guides"/)
    expect(sidebar).toMatch(/href="\/docs\/working-with-tickets\/" aria-current="page"/)
    const menu = guide.match(/<details class="guides-menu[\s\S]*?<\/details>/)?.[0] ?? ''
    expect(menu).toMatch(/<summary[^>]*>Guides<\/summary>/)
    expect(menu).toMatch(/<nav aria-label="Guides"/)

    const contents = guide.match(/<nav class="contents[\s\S]*?<\/nav>/)?.[0] ?? ''
    for (const [slug, text] of [
      ['the-four-states', 'The four states'],
      ['verification', 'Verification'],
      ['deciding-done', 'Deciding Done'],
    ]) {
      expect(contents, slug).toContain(`href="#${slug}"`)
      expect(contents, slug).toContain(`>${text}</a>`)
      expect(guide, slug).toMatch(new RegExp(`<h[23] id="${slug}"`))
    }
    expect(guide).not.toMatch(/<script/i)
  })

  it('refuses to build a published guide that does not say which version it was written for', async () => {
    const guides = await guideFolder('no-version', {
      'unversioned.md': PUBLISHED.replace('appVersion: 0.3.0\n', '').replace(
        /Read \[the draft guide\][^\n]*\n/,
        '',
      ),
    })
    const failure = await build('no-version-out', { KNIGHTBOOK_DOCS_DIR_FOR_TESTS: guides }).catch(
      (error) => error,
    )
    expect(failure).toBeInstanceOf(Error)
    expect(failure.stderr).toMatch(
      /a published guide must say which app version it was written against/,
    )
  }, 120_000)

  it('shows the app version a published guide was written for', async () => {
    const guide = await page(fixture, 'docs/working-with-tickets/index.html')
    expect(guide).toMatch(/>Written for Knightbook 0\.3\.0</)
  })

  it('publishes a draft guide in a preview but leaves it out of a production build', async () => {
    // In a preview the published guide's link to the draft resolves.
    expect(await page(fixture, 'docs/writing-in-progress/index.html')).toContain('Draft:')
    // In production the draft is dropped, so that same link now leads nowhere,
    // and the link check names it before any page is written.
    const production = await build('production-docs', {
      KNIGHTBOOK_DOCS_DIR_FOR_TESTS: join(workDir, 'guides'),
      KNIGHTBOOK_SITE_STAGE: 'production',
    }).catch((error) => error)
    expect(production).toBeInstanceOf(Error)
    expect(production.stderr).toMatch(
      /working-with-tickets: \.\.\/writing-in-progress\/ \(\/docs\/writing-in-progress\/\)/,
    )
  }, 120_000)

  it('stops the build and names a link to a guide that does not exist', async () => {
    const guides = await guideFolder('broken', {
      'working-with-tickets.md': PUBLISHED.replace('../writing-in-progress/', '../no-such-guide/')
        // A real link beside code spans, after a backtick with no partner.
        .replace('A link is written', 'Press ` to open the board.\n\nA link is written')
        .replace('[this one](../writing-in-progress/)', '[this one](../also-missing/)'),
      'writing-in-progress.md': DRAFT,
    })
    const failure = await build('broken-out', { KNIGHTBOOK_DOCS_DIR_FOR_TESTS: guides }).catch(
      (error) => error,
    )
    expect(failure).toBeInstanceOf(Error)
    expect(failure.stderr).toMatch(/guide links lead to no published guide/)
    expect(failure.stderr).toMatch(
      /working-with-tickets: \.\.\/no-such-guide\/ \(\/docs\/no-such-guide\/\)/,
    )
    expect(failure.stderr).toMatch(
      /working-with-tickets: \.\.\/also-missing\/ \(\/docs\/also-missing\/\)/,
    )
    // Link syntax shown in code in the same guide is an example, not a link.
    for (const example of ['spec.md', 'ticket.md', 'not-a-guide']) {
      expect(failure.stderr, example).not.toContain(example)
    }
  }, 120_000)
})
