import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { analyzeCommits as analyzeAll } from '@semantic-release/commit-analyzer'
import { generateNotes as generateAllNotes } from '@semantic-release/release-notes-generator'

/**
 * A semantic-release plugin that only counts commits which change the desktop
 * app (D-041). A commit touching only the website, the docs or the board neither
 * raises the version nor appears in the notes; the next app release ignores it.
 *
 * It wraps the commit analyzer and the notes generator, handing each the same
 * options, so the release rules themselves stay in next-version.mjs.
 */

const run = promisify(execFile)

/**
 * What goes into the installers, or decides how they are built. A folder ends in
 * `/`. Releases are started by hand (D-048), so this list no longer decides when
 * the release workflow runs, only which commits count toward its version and notes.
 */
export const APP_PATHS = [
  'apps/desktop/',
  'packages/',
  'skills/projectspace/',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  '.github/workflows/ci.yml',
  '.github/workflows/release.yml',
]

export function isAppPath(file) {
  return APP_PATHS.some((path) => (path.endsWith('/') ? file.startsWith(path) : file === path))
}

/**
 * The files a commit changed. `-m --first-parent` lists a merge commit's changes
 * against the branch it was merged into; plain `diff-tree` lists nothing for a
 * merge, which would drop it. `-z` keeps paths unquoted whatever their characters.
 */
async function changedFiles(hash, cwd) {
  const { stdout } = await run(
    'git',
    [
      'diff-tree',
      '--no-commit-id',
      '--name-only',
      '-r',
      '--root',
      '-m',
      '--first-parent',
      '-z',
      hash,
    ],
    { cwd },
  )
  return stdout.split('\0').filter(Boolean)
}

async function appCommits(context) {
  const kept = []
  for (const commit of context.commits) {
    const files = await changedFiles(commit.hash, context.cwd)
    if (files.some(isAppPath)) kept.push(commit)
    else context.logger.log(`Not an app change, ignored: ${commit.message.split('\n')[0]}`)
  }
  return kept
}

export async function analyzeCommits(pluginConfig, context) {
  return analyzeAll(pluginConfig, { ...context, commits: await appCommits(context) })
}

export async function generateNotes(pluginConfig, context) {
  return generateAllNotes(pluginConfig, { ...context, commits: await appCommits(context) })
}
