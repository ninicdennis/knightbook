// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { APP_PATHS, isAppPath } from './app-commits.mjs'

describe('which changes count as the desktop app', () => {
  it('is exactly the list D-041 names, so an entry cannot be added or dropped unnoticed', () => {
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
