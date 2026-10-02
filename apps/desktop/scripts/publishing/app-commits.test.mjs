// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { APP_PATHS, isAppPath } from './app-commits.mjs'

const RELEASE_WORKFLOW = new URL('../../../../.github/workflows/release.yml', import.meta.url)

/** The `paths:` entries under `on.push` in release.yml, read as plain lines. */
async function workflowPaths() {
  const workflow = await readFile(RELEASE_WORKFLOW, 'utf8')
  const block = workflow.match(
    /^on:\r?\n {2}push:\r?\n(?: {4}.*\r?\n)*? {4}paths:\r?\n((?: {6}- .*\r?\n)+)/m,
  )
  if (!block) throw new Error('release.yml has no paths filter under on.push')
  // Quoted or not, so an entry added without quotes still counts as drift.
  return [...block[1].matchAll(/- ['"]?([^'"\r\n]+?)['"]?\s*$/gm)].map((match) => match[1])
}

describe('which changes count as the desktop app', () => {
  it('matches the release workflow’s path filter, so the two cannot drift apart', async () => {
    const asGlobs = APP_PATHS.map((path) => (path.endsWith('/') ? `${path}**` : path))
    expect(await workflowPaths()).toEqual(asGlobs)
  })

  it('is exactly the list D-041 names, so an entry cannot drop out of both places', () => {
    expect(APP_PATHS).toEqual([
      'apps/desktop/',
      'packages/',
      'skills/projectspace/',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'tsconfig.base.json',
      '.github/workflows/ci.yml',
      '.github/workflows/release.yml',
    ])
  })

  it('counts the app, its packages, the skill and the build setup', () => {
    for (const file of [
      'apps/desktop/src/main/index.ts',
      'packages/core/src/tickets.ts',
      'skills/projectspace/SKILL.md',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'tsconfig.base.json',
      '.github/workflows/ci.yml',
      '.github/workflows/release.yml',
    ]) {
      expect(isAppPath(file), file).toBe(true)
    }
  })

  it('does not count the website, docs, README, the board or other workflows', () => {
    for (const file of [
      'apps/website/src/pages/index.astro',
      'apps/website/package.json',
      'docs/project-workspace-spec.md',
      'README.md',
      '.projectspace/tickets/a.md',
      '.github/workflows/pr-title.yml',
      'apps/desktop-notes.md',
    ]) {
      expect(isAppPath(file), file).toBe(false)
    }
  })
})
