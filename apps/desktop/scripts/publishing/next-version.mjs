import { appendFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * Works out the version a merge to `main` releases, without releasing anything.
 *
 * semantic-release runs here only in dry-run mode, to read the commits since the
 * last `v*` tag and choose the next version and its notes. It creates no tag and
 * no GitHub Release: the release workflow builds every installer first and its
 * publishing job creates the tag and the prerelease once they all exist
 * (docs/proposals/release-automation.md). semantic-release's own GitHub plugin
 * cannot do that, because it publishes before anything is built and only marks a
 * release as a prerelease on a dedicated prerelease branch.
 *
 * Even in dry-run mode semantic-release checks that it could push to `main`, so
 * the step that runs this needs a token with write access, though nothing is
 * pushed.
 */

/**
 * Every Conventional Commit type that changes the app releases something: the user
 * chose a release per app-changing merge (D-040, narrowed by D-041). Commits that
 * leave the app alone are dropped earlier, by app-commits.mjs.
 */
const PATCH_TYPES = ['docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert']

const PRESET = 'conventionalcommits'

/**
 * The first release is 0.1.0, not semantic-release's 1.0.0: releases start as
 * prereleases, and 1.0.0 is kept for the first stable one.
 */
export const FIRST_VERSION = '0.1.0'

export const releaseRules = [
  { breaking: true, release: 'major' },
  { type: 'feat', release: 'minor' },
  { type: 'fix', release: 'patch' },
  ...PATCH_TYPES.map((type) => ({ type, release: 'patch' })),
]

/** semantic-release loads a plugin by path; this one wraps the analyzer and the notes. */
const APP_COMMITS_PLUGIN = fileURLToPath(new URL('./app-commits.mjs', import.meta.url))

export const releaseOptions = {
  branches: ['main'],
  tagFormat: 'v${version}',
  dryRun: true,
  ci: true,
  plugins: [[APP_COMMITS_PLUGIN, { preset: PRESET, releaseRules }]],
}

/**
 * The generated notes open with a heading naming the version semantic-release
 * chose. The release title already names the version, and for the first release
 * the heading would name 1.0.0, so it is removed.
 */
export function withoutVersionHeading(notes) {
  return notes.replace(/^#{1,2} .*\r?\n+/, '').trim()
}

/**
 * semantic-release's answer, turned into what the release workflow needs.
 * `false` means no release: no commit since the last tag is a Conventional
 * Commit, or `main` moved on while this ran (the newer run releases instead).
 */
export function decideRelease(result) {
  if (!result || !result.nextRelease) return { release: false }

  const version = result.lastRelease?.version ? result.nextRelease.version : FIRST_VERSION
  return {
    release: true,
    version,
    tag: `v${version}`,
    notes: withoutVersionHeading(result.nextRelease.notes ?? ''),
  }
}

/** Writes `release`, `version` and `tag` as step outputs, and the notes to a file. */
async function report(decision, notesFile) {
  const lines = [`release=${decision.release}`]
  if (decision.release) lines.push(`version=${decision.version}`, `tag=${decision.tag}`)

  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`)
  if (decision.release) await writeFile(notesFile, `${decision.notes}\n`)

  console.log(decision.release ? `Next release: ${decision.tag}` : 'No release for this push.')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const notesFile = process.argv[2] ?? 'release-notes.md'
  const { default: semanticRelease } = await import('semantic-release')
  const result = await semanticRelease(releaseOptions)
  await report(decideRelease(result), notesFile)
}
