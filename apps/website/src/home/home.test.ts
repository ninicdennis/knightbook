import { execFile } from 'node:child_process'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fixtureRelease } from '../download/test-releases'
import { DRAFTS } from './drafts'
import { buildTempDir } from '../test/build-dir.js'

/**
 * Builds the real site and checks the homepage a visitor would receive: with
 * the checked-in release data (no release), with a stable release and with a
 * preview, so the download action's states come from data that triggers them.
 */

const run = promisify(execFile)
const SITE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const ASTRO_BIN = join(
  dirname(createRequire(import.meta.url).resolve('astro/package.json')),
  'bin',
  'astro.mjs',
)

const STATES = {
  noRelease: [],
  stable: [fixtureRelease('0.3.0')],
  previewOnly: [fixtureRelease('0.2.0', { channel: 'preview' })],
  stableAndPreview: [fixtureRelease('0.3.0'), fixtureRelease('0.4.0', { channel: 'preview' })],
  onlyWithdrawn: [fixtureRelease('0.3.1', { withdrawnReason: 'It could not open projects.' })],
} as const

type State = keyof typeof STATES

let workDir: string
const homes = {} as Record<State, string>

function build(outDir: string, env: NodeJS.ProcessEnv) {
  return run(process.execPath, [ASTRO_BIN, 'build', '--outDir', outDir], { cwd: SITE_ROOT, env })
}

beforeAll(async () => {
  workDir = await buildTempDir('knightbook-home-')
  for (const [state, releases] of Object.entries(STATES) as [State, readonly unknown[]][]) {
    const env: NodeJS.ProcessEnv = { ...process.env }
    delete env.KNIGHTBOOK_SITE_STAGE
    env.KNIGHTBOOK_RELEASE_DATA_FOR_TESTS = join(workDir, `${state}.json`)
    await writeFile(env.KNIGHTBOOK_RELEASE_DATA_FOR_TESTS, JSON.stringify({ releases }))
    await build(join(workDir, state), env)
    homes[state] = await readFile(join(workDir, state, 'index.html'), 'utf8')
  }
})

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true })
})

/** The text a visitor reads, without markup or the inlined stylesheet. */
function visibleText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}

/** Text a visitor or a search engine meets outside the page body: description, alt, labels. */
function attributeText(html: string) {
  return [...html.matchAll(/\s(?:content|alt|aria-label|title)="([^"]*)"/g)]
    .map((match) => match[1])
    .join(' ')
}

function section(html: string, labelledBy: string) {
  return (
    html.match(
      new RegExp(`<section[^>]*aria-labelledby="${labelledBy}"[\\s\\S]*?</section>`),
    )?.[0] ?? ''
  )
}

function installerLinks(html: string) {
  return [...html.matchAll(/href="([^"]+\.(?:exe|dmg|deb))"/g)].map((match) => match[1])
}

describe('the homepage', () => {
  it('opens with the agreed hero copy, the download action and the getting-started link', () => {
    const hero = section(homes.noRelease, 'hero-title')
    expect(hero).toMatch(/<h1[^>]*>Your project context, beyond the chat\.<\/h1>/)
    expect(visibleText(hero)).toContain(
      'Keep project documents, decisions, and a work board together in a desktop workspace. Connect your existing AI tools, keep your Markdown in your project folder, and decide when the work is done.',
    )
    expect(hero).toMatch(/href="\/docs\/getting-started\/"[^>]*>Read the getting-started guide</)
  })

  it('says Knightbook is free and links the license beside each download action', () => {
    for (const id of ['hero-title', 'closing-title']) {
      expect(section(homes.noRelease, id), id).toMatch(
        /<p class="terms"[^>]*>Free, with the source code available under the <a href="\/license\/"[^>]*>FSL<\/a>\.<\/p>/,
      )
    }
  })

  it('puts the copy and actions before the image, so they come first when stacked', () => {
    const hero = section(homes.noRelease, 'hero-title')
    const order = ['<h1', 'class="lead', 'class="download-action', '<figure'].map((mark) =>
      hero.indexOf(mark),
    )
    expect(order.every((position) => position >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('says downloads are not available yet when there is no release, as status text', () => {
    const html = homes.noRelease
    expect(
      html.match(/<p class="status[^"]*"[^>]*>Downloads are not available yet<\/p>/g),
    ).toHaveLength(2)
    expect(html).not.toMatch(/>Download Knightbook \d/)
    expect(html.match(/href="\/download\/"[^>]*>\s*All downloads\s*</g)).toHaveLength(2)
  })

  it('offers stable over a newer preview, and nothing when the only release is withdrawn', () => {
    expect(homes.stableAndPreview).toMatch(/>\s*Download Knightbook 0\.3\.0\s*</)
    expect(homes.stableAndPreview).not.toContain('0.4.0')
    expect(homes.onlyWithdrawn).toMatch(
      /<p class="status[^"]*"[^>]*>Downloads are not available yet</,
    )
    expect(homes.onlyWithdrawn).not.toContain('0.3.1')
  })

  it('links the download action only to the download page, never to a file or another site', () => {
    for (const state of Object.keys(STATES) as State[]) {
      for (const action of homes[state].match(/<div class="download-action[\s\S]*?<\/div>/g) ??
        []) {
        const hrefs = [...action.matchAll(/href="([^"]+)"/g)].map((match) => match[1])
        expect(hrefs.length, state).toBeGreaterThan(0)
        expect(new Set(hrefs), state).toEqual(new Set(['/download/']))
      }
    }
  })

  it('offers the recommended version when there is one, labels a preview, and never links a file', () => {
    expect(homes.stable).toMatch(
      /<a class="kb-button primary[^"]*" href="\/download\/"[^>]*>\s*Download Knightbook 0\.3\.0\s*</,
    )
    expect(homes.stable).not.toMatch(/<span class="preview-label/)
    expect(homes.previewOnly).toMatch(
      /Download Knightbook 0\.2\.0\s*<\/a>\s*<span class="preview-label[^"]*"[^>]*>Preview</,
    )
    for (const state of Object.keys(STATES) as State[]) {
      expect(installerLinks(homes[state]), state).toEqual([])
      expect(homes[state], state).toMatch(/href="\/download\/"[^>]*>\s*All downloads/)
    }
  })

  it('explains the four steps at the How it works anchor, with MCP beside the AI step', () => {
    const how = section(homes.noRelease, 'how-title')
    expect(how).toMatch(/<section[^>]*id="how-it-works"/)
    const titles = [...how.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map((match) => match[1])
    expect(titles).toEqual([
      'Open your project',
      'Keep the context together',
      'Work with your AI tool',
      'Verify and decide',
    ])
    expect(how).toMatch(
      /Work with your AI tool<\/h3>[\s\S]*?MCP is the connection that lets a compatible AI tool read and update this project\.[\s\S]*?Verify and decide/,
    )
    expect(how).toMatch(/href="\/docs\/getting-started\/"/)
  })

  it('explains files you keep using and the shared view, each with its own content', () => {
    const files = visibleText(section(homes.noRelease, 'files-title'))
    expect(files).toMatch(/ordinary Markdown files in your project folder/)
    expect(files).toMatch(/edit it in the editor you already use/)
    expect(section(homes.noRelease, 'files-title')).not.toContain('data-draft=')
    expect(section(homes.noRelease, 'files-title')).toMatch(/<img[^>]+alt="The Documents view/)
    const shared = visibleText(section(homes.noRelease, 'shared-title'))
    expect(shared).toMatch(/context the last one left behind/)
    expect(shared).toMatch(/what it depends on/)
    expect(shared).toMatch(/Example ticket:.*Outcome.*Acceptance criteria.*Handoff/)
  })

  it('has the three explanations, with Verification emphasised and the decision left to the user', () => {
    const headings = [...homes.noRelease.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1])
    for (const title of [
      'Files you can keep using',
      'A shared view of the work',
      'Your completion decision',
    ]) {
      expect(headings).toContain(title)
    }
    const decision = section(homes.noRelease, 'decision-title')
    expect(visibleText(decision)).toMatch(
      /Backlog In progress Verification You decide what happens next Done/,
    )
    expect(decision).toMatch(/<li class="emphasis[^"]*"[^>]*>\s*Verification/)
    expect(visibleText(decision)).toContain('you decide whether the work is done')
  })

  it('keeps each FAQ answer within its boundary', () => {
    const faq = section(homes.noRelease, 'faq-title')
    const answer = (question: string) =>
      visibleText(
        faq.match(
          new RegExp(
            `<summary[^>]*>${question.replace(/[?]/g, '\\?')}</summary>[\\s\\S]*?</details>`,
          ),
        )?.[0] ?? '',
      )
    expect(answer('Does Knightbook include an AI assistant?')).toMatch(
      /^ ?Does Knightbook include an AI assistant\? No\. .*AI tool you already use/,
    )
    expect(answer('Can I use an existing repository?')).toMatch(
      /Yes\..*\.projectspace.*stay where they are/,
    )
    expect(answer('Where are my files?')).toMatch(
      /project folder you choose.*\.projectspace.*own terms/,
    )
    expect(answer('Can I edit documents?')).toMatch(
      /edit them in your usual editor.*not part of the current release/,
    )
    expect(answer('Does the app need to stay open?')).toMatch(/designed not to/)
    expect(answer('Does it sync across computers?')).toMatch(/No\. .*does not sync them or run Git/)
    expect(answer('Which systems and AI clients work?')).toMatch(
      /have been tested will be listed here/,
    )
    expect(answer('Which systems and AI clients work?')).not.toMatch(/every|all AI|any AI/i)
    expect(answer('Is it free, and what is the license?')).toMatch(
      /Yes, Knightbook is free\..*Functional Source License \(FSL-1\.1-ALv2\).*except offering it.*competing commercial product.*Apache License 2\.0/,
    )
  })

  it('answers the eight questions in native expandable rows', () => {
    const faq = section(homes.noRelease, 'faq-title')
    const questions = [...faq.matchAll(/<summary[^>]*>([^<]+)<\/summary>/g)].map((m) => m[1])
    expect(questions).toEqual([
      'Does Knightbook include an AI assistant?',
      'Can I use an existing repository?',
      'Where are my files?',
      'Can I edit documents?',
      'Does the app need to stay open?',
      'Does it sync across computers?',
      'Which systems and AI clients work?',
      'Is it free, and what is the license?',
    ])
    expect(faq.match(/<details/g)).toHaveLength(8)
    expect(faq).not.toMatch(/<details[^>]*\sopen/)
  })

  it('ends with the closing heading, the same download action and the getting-started link', () => {
    const closing = section(homes.noRelease, 'closing-title')
    expect(closing).toMatch(/>Keep the next session connected to the project\.</)
    expect(closing).toContain('class="download-action')
    expect(closing).toMatch(/href="\/docs\/getting-started\/"/)
  })

  it('makes none of the banned claims, and shows no testimonials or usage counts', () => {
    const text = `${visibleText(homes.noRelease)} ${attributeText(homes.noRelease)}`.toLowerCase()
    for (const claim of [
      'works with every ai',
      'fully offline ai',
      'secure by default',
      'zero data leaves your device',
      'open source',
      'open-source',
      'trusted by',
      'testimonial',
    ]) {
      expect(text, claim).not.toContain(claim)
    }
    expect(text).not.toMatch(/\d[\d,.]*\s*k?\+?\s*(users|teams|developers|downloads|projects)\b/)
  })

  it('shows real screenshots, light and dark, resized, each with alt text', () => {
    for (const [id, alt] of [
      ['hero-title', 'The Knightbook board with four columns'],
      ['files-title', 'The Documents view in Knightbook'],
    ]) {
      const picture = section(homes.noRelease, id).match(/<picture[\s\S]*?<\/picture>/)?.[0] ?? ''
      const dark = picture.match(
        /<source media="\(prefers-color-scheme: dark\)"[^>]*srcset="([^"]+)"/,
      )
      const light = picture.match(/<img[^>]*srcset="([^"]+)"/)
      expect(dark?.[1], id).toMatch(/\.webp 640w, .*\.webp 1920w$/)
      expect(light?.[1], id).toMatch(/\.webp 640w, .*\.webp 1920w$/)
      expect(dark?.[1], id).not.toEqual(light?.[1])
      expect(picture, id).toMatch(new RegExp(`<img[^>]+alt="${alt}[^"]+"`))
      expect(picture, id).toMatch(/<img[^>]+width="1280"[^>]+height="800"/)
    }
    expect(section(homes.noRelease, 'hero-title')).toMatch(/<img[^>]+loading="eager"/)
    expect(section(homes.noRelease, 'files-title')).toMatch(/<img[^>]+loading="lazy"/)
  })

  it('marks every draft visibly, and only drafts that are listed', () => {
    const marked = [...homes.noRelease.matchAll(/data-draft="([^"]+)"/g)].map((m) => m[1])
    expect(new Set(marked)).toEqual(new Set(Object.keys(DRAFTS)))
  })

  it('refuses a production build while drafts remain, naming every one', async () => {
    const env: NodeJS.ProcessEnv = { ...process.env, KNIGHTBOOK_SITE_STAGE: 'production' }
    delete env.KNIGHTBOOK_RELEASE_DATA_FOR_TESTS
    const failure = await build(join(workDir, 'production'), env).catch((error) => error)
    expect(failure).toBeInstanceOf(Error)
    for (const id of Object.keys(DRAFTS)) expect(failure.stderr, id).toContain(`${id}: `)
  }, 120_000)

  it('works without JavaScript', () => {
    for (const state of Object.keys(STATES) as State[])
      expect(homes[state], state).not.toMatch(/<script/i)
  })
})
