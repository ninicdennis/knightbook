import { execFile } from 'node:child_process'
import { readdir, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTempDir } from '../test/build-dir.js'

/**
 * The two first-use guides, getting started and connecting an AI tool, built
 * from the real guides. Every label they quote must be a label the app's own
 * screens use, so a renamed button fails here instead of misleading a reader.
 * Whether the steps work on a clean install is checked by following them.
 */

const run = promisify(execFile)
const SITE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const APP_SOURCE = join(SITE_ROOT, '..', 'desktop', 'src')
const ASTRO_BIN = join(
  dirname(createRequire(import.meta.url).resolve('astro/package.json')),
  'bin',
  'astro.mjs',
)

let outDir: string
let gettingStarted: string
let connecting: string
let appSource: string

async function appText(directory: string): Promise<string> {
  let text = ''
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) text += await appText(path)
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name))
      text += await readFile(path, 'utf8')
  }
  return text
}

beforeAll(async () => {
  outDir = await buildTempDir('knightbook-first-use-')
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.KNIGHTBOOK_DOCS_DIR_FOR_TESTS
  delete env.KNIGHTBOOK_SITE_STAGE
  await run(process.execPath, [ASTRO_BIN, 'build', '--outDir', outDir], { cwd: SITE_ROOT, env })
  gettingStarted = await readFile(join(outDir, 'docs', 'getting-started', 'index.html'), 'utf8')
  connecting = await readFile(join(outDir, 'docs', 'connecting-ai', 'index.html'), 'utf8')
  appSource = await appText(APP_SOURCE)
})

afterAll(async () => {
  await rm(outDir, { recursive: true, force: true })
})

/** The HTML from one h2 to the next. */
function section(guide: string, id: string) {
  const start = guide.indexOf(`<h2 id="${id}"`)
  if (start === -1) return ''
  const next = guide.indexOf('<h2 ', start + 1)
  return guide.slice(start, next === -1 ? undefined : next)
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const codeBlocks = (html: string) => [...html.matchAll(/<pre[\s\S]*?<\/pre>/g)].map((m) => m[0])

const STEPS = [
  '1-install-and-open-knightbook',
  '2-choose-a-project-folder',
  '3-find-your-documents',
  '4-understand-the-board',
  '5-connect-an-ai-tool-if-you-want-to',
  '6-confirm-the-connection',
  '7-try-a-small-handoff',
  '8-come-back-later',
]

const CHECK_PROMPT =
  'Use Knightbook to tell me the project name and checkout path, then list its documents and summarize the board. Do not change files or ticket statuses yet.'

describe('the getting-started guide', () => {
  it('is published for 0.2.0 and says when it was written and how far it was checked', () => {
    expect(gettingStarted).not.toContain('data-draft-guide')
    expect(gettingStarted).toMatch(/>Written for Knightbook 0\.2\.0</)
    expect(text(gettingStarted)).toContain('written on 2026-10-21 for Knightbook 0.2.0')
    expect(gettingStarted).toContain('<strong>Not yet checked')
  })

  it.each(STEPS)('has step %s, with the expected result and a troubleshooting link', (id) => {
    const step = section(gettingStarted, id)
    expect(step, id).not.toBe('')
    expect(step, id).toContain('<strong>What you should see:')
    expect(step, id).toMatch(/href="\.\.\/troubleshooting\/#[a-z-]+"/)
  })

  it('suggests the read-only check prompt before any handoff', () => {
    expect(text(section(gettingStarted, '6-confirm-the-connection'))).toContain(CHECK_PROMPT)
  })

  it('has a path without AI, and says what happens outside the app', () => {
    const alone = text(section(gettingStarted, 'using-knightbook-without-an-ai-tool'))
    expect(alone).toContain('Two things happen outside the app')
    expect(alone).toContain('Edit externally')
  })

  it('needs no Git, pnpm, Node or source build', () => {
    for (const command of [/\bpnpm\b/, /\bnpm\b/, /\bnpx\b/, /git clone/, /\bnode\s+\S/])
      expect(text(gettingStarted), String(command)).not.toMatch(command)
  })
})

describe('the connecting-an-AI-tool guide', () => {
  it('is published for 0.2.0', () => {
    expect(connecting).not.toContain('data-draft-guide')
    expect(connecting).toMatch(/>Written for Knightbook 0\.2\.0</)
  })

  it('explains the server and the workflow skill as two separate steps', () => {
    const steps = text(section(connecting, 'two-separate-steps'))
    expect(steps).toContain('The MCP server gives the tool its abilities')
    expect(steps).toContain('The workflow skill teaches the tool how to work')
  })

  it('takes paths from the copied configuration, never from a developer checkout', () => {
    for (const path of ['packages/mcp', 'dist/server.mjs', 'pnpm', 'Projects\\knightbook'])
      expect(connecting, path).not.toContain(path)
    // The one example is for every system, so it names no Windows program or drive.
    for (const block of codeBlocks(connecting)) {
      expect(block).not.toContain('node.exe')
      expect(block).not.toMatch(/\b[A-Z]:\\/)
    }
  })

  it('records the client version, the app version and the date it was tested', () => {
    const tested = text(section(connecting, 'what-has-been-tested'))
    expect(tested).toContain('Claude Code 2.1.306, Knightbook 0.2.0')
    expect(tested).toContain('2026-10-21')
    expect(tested).toContain('Not yet checked')
  })

  it.each([
    'working-with-the-window-closed',
    'one-configuration-many-projects',
    'after-updating-knightbook',
  ])('covers %s', (id) => {
    expect(section(connecting, id), id).not.toBe('')
  })

  it('covers several copies of one project and moving a project', () => {
    const many = text(section(connecting, 'one-configuration-many-projects'))
    expect(many).toContain('Several copies of one project')
    expect(many).toContain('Moving a project')
  })

  it('says a connected status does not prove the workflow skill is followed', () => {
    const connected = text(section(connecting, 'what-connected-does-and-does-not-tell-you'))
    expect(connected).toContain('whether the tool loaded the workflow skill, or follows it')
  })

  it('does not call untested clients supported', () => {
    expect(text(connecting)).not.toMatch(/\bsupported\b/i)
    expect(text(section(connecting, 'other-ai-tools'))).toContain(
      'Knightbook has not been tested with any of these yet',
    )
  })
})

describe('both first-use guides', () => {
  // Labels quoted in bold that name something on screen. Column names and the
  // MCP status labels come from the same source.
  const LABELS = [
    'Choose a project folder',
    'Set up this folder',
    'Project name',
    'Documents already here',
    'Could not set up this folder',
    'Include',
    'Markdown files…',
    'A folder…',
    'New',
    'Edit externally',
    'Recent',
    'Open now',
    'Copy path',
    'Open folder…',
    'Next up',
    'Title',
    'Type',
    'Body',
    'Accept as done',
    'Accepted by you',
    'Recorded by AI',
    'Did not pass…',
    'Record the issue',
    'Failed verification',
    'Allow AI access through MCP',
    'Set up your AI tool',
    '1. Connect your AI client',
    '2. Give it the workflow skill',
    'Copy MCP configuration',
    'Claude Code or Claude Desktop',
    'Install',
    'Export skill folder…',
    'Copy skill text',
    'MCP not connected',
    'MCP available',
  ]

  it.each(LABELS)('quote "%s" as the app shows it', (label) => {
    const both = `${gettingStarted}${connecting}`.replace(/\s+/g, ' ')
    expect(both, label).toContain(`<strong>${label}</strong>`)
    expect(appSource.includes(label), `${label} in the app`).toBe(true)
  })

  it('never call Knightbook open source', () => {
    for (const guide of [gettingStarted, connecting])
      expect(text(guide)).not.toMatch(/open[ -]source/i)
  })
})
