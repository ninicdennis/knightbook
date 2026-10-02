import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { CHECKSUMS_FILE, checkInstallers, listAssets, writeChecksums } from './release-assets.mjs'

/**
 * Publishes one GitHub prerelease for a tested commit, once, with every asset.
 *
 * The release is staged as a draft: created without a tag, given every file,
 * checked, and only then published, which is when GitHub creates the tag at the
 * tested commit. A failure part way leaves at most a draft, which nobody without
 * write access can see.
 *
 * Running it again is safe. A release already published for the same commit with
 * the same files is left alone and the run succeeds; one published for another
 * commit, or with different files, stops the run without changing anything. A
 * draft left by a failed run is deleted and staged again from these files, since
 * a draft was never public.
 */

const execFileAsync = promisify(execFile)

/** Runs a command and returns its standard output; a non-zero exit throws. */
async function runCommand(command, args) {
  const { stdout } = await execFileAsync(command, args, { maxBuffer: 16 * 1024 * 1024 })
  return stdout
}

function isNotFound(error) {
  return /not found|HTTP 404/i.test(`${error.stderr ?? ''}${error.message ?? ''}`)
}

/** The release for `tag`, draft or published, or null when there is none. */
async function findRelease(run, tag) {
  try {
    return JSON.parse(await run('gh', ['release', 'view', tag, '--json', 'isDraft,assets']))
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

/** The commit `tag` points at on GitHub, or null when the tag does not exist. */
async function taggedCommit(run, tag) {
  try {
    return (await run('gh', ['api', `repos/{owner}/{repo}/commits/${tag}`, '--jq', '.sha'])).trim()
  } catch (error) {
    if (/No commit found|HTTP 422|HTTP 404/i.test(`${error.stderr ?? ''}${error.message ?? ''}`)) {
      return null
    }
    throw error
  }
}

function sameAssets(published, local) {
  const key = (assets) =>
    assets
      .map(({ name, size }) => `${name}:${size}`)
      .sort()
      .join('\n')
  return key(published) === key(local)
}

function publishedChecksums(run, tag) {
  return run('gh', ['release', 'download', tag, '--pattern', CHECKSUMS_FILE, '--output', '-'])
}

async function refuseMovedTag(run, tag, sha) {
  const tagged = await taggedCommit(run, tag)
  if (tagged && tagged !== sha) {
    throw new Error(`Tag ${tag} already points at ${tagged}, not the tested commit ${sha}.`)
  }
}

/**
 * Publishes `tag` at `sha` from the files in `assetsDir`. Returns 'published', or
 * 'already-published' when an identical release exists.
 */
export async function publishRelease({ tag, version, sha, notesFile, assetsDir, run, log }) {
  const installers = checkInstallers(await listAssets(assetsDir), version)
  await writeChecksums(assetsDir, installers)
  const assets = await listAssets(assetsDir)

  const existing = await findRelease(run, tag)
  if (existing && !existing.isDraft) {
    await refuseMovedTag(run, tag, sha)
    // Names and sizes first, then the published checksum list, so an installer
    // rebuilt to the same size but different bytes still counts as different.
    const sameFiles =
      sameAssets(existing.assets, assets) &&
      (await publishedChecksums(run, tag)) ===
        (await readFile(join(assetsDir, CHECKSUMS_FILE), 'utf8'))
    if (!sameFiles) {
      throw new Error(`${tag} is already published with different files; it is left as it is.`)
    }
    log(`${tag} is already published from this commit with these files. Nothing to do.`)
    return 'already-published'
  }

  await refuseMovedTag(run, tag, sha)
  if (existing) {
    log(`Deleting the draft of ${tag} left by an earlier run.`)
    await run('gh', ['release', 'delete', tag, '--yes'])
  }

  await run('gh', [
    'release',
    'create',
    tag,
    '--draft',
    '--prerelease',
    '--target',
    sha,
    '--title',
    `Knightbook ${version}`,
    '--notes-file',
    notesFile,
  ])
  await run('gh', ['release', 'upload', tag, ...assets.map(({ name }) => join(assetsDir, name))])

  const staged = await findRelease(run, tag)
  if (!staged || !sameAssets(staged.assets, assets)) {
    throw new Error(`The draft of ${tag} does not hold every file; it was not published.`)
  }

  await run('gh', ['release', 'edit', tag, '--draft=false'])
  await refuseMovedTag(run, tag, sha)
  log(`Published ${tag} at ${sha} with ${assets.length} files.`)
  return 'published'
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [tag, version, sha, notesFile, assetsDir] = process.argv.slice(2)
  if (!assetsDir) {
    console.error('Usage: publish-release.mjs <tag> <version> <commit> <notes file> <assets dir>')
    process.exit(1)
  }
  await publishRelease({
    tag,
    version,
    sha,
    notesFile,
    assetsDir,
    run: runCommand,
    log: console.log,
  })
}
