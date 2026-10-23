import { execFile } from 'node:child_process'
import { readdir, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { UMAMI } from './analytics'
import { buildTempDir } from '../test/build-dir.js'

/**
 * The Umami visit counter (D-052) in a production build. layout.test.ts checks
 * the other half: a preview build loads none of it.
 */

const run = promisify(execFile)
const SITE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const ASTRO_BIN = join(
  dirname(createRequire(import.meta.url).resolve('astro/package.json')),
  'bin',
  'astro.mjs',
)
const SCRIPT = `<script defer src="${UMAMI.src}" data-website-id="${UMAMI.websiteId}"></script>`

let outDir: string

async function htmlFiles() {
  const entries = await readdir(outDir, { withFileTypes: true, recursive: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => relative(outDir, join(entry.parentPath, entry.name)).split(sep).join('/'))
}

beforeAll(async () => {
  outDir = await buildTempDir('knightbook-analytics-')
  const env: NodeJS.ProcessEnv = { ...process.env, KNIGHTBOOK_SITE_STAGE: 'production' }
  delete env.KNIGHTBOOK_RELEASE_DATA_FOR_TESTS
  await run(process.execPath, [ASTRO_BIN, 'build', '--outDir', outDir], { cwd: SITE_ROOT, env })
}, 120_000)

afterAll(async () => {
  await rm(outDir, { recursive: true, force: true })
})

describe('analytics in a production build', () => {
  it('loads the Umami script once, in the head of every page', async () => {
    const pages = await htmlFiles()
    expect(pages).toContain('index.html')
    for (const path of pages) {
      const html = await readFile(join(outDir, path), 'utf8')
      // A redirect page (redirects.ts) is Astro's own and has no layout.
      if (/http-equiv="refresh"/.test(html)) continue
      const head = html.match(/<head>([\s\S]*)<\/head>/)?.[1] ?? ''
      expect(head, path).toContain(SCRIPT)
      expect(html.split(UMAMI.src).length - 1, path).toBe(1)
    }
  })
})
