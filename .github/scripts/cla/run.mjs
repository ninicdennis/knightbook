import { readFile, appendFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import {
  COMMENT_MARKER,
  SIGNATURES_BRANCH,
  SIGNATURES_FILE,
  claVersion,
  commentFor,
  decide,
  findSignature,
  withSignature,
} from './cla.mjs'

/**
 * Runs the contributor agreement check for one pull_request_target event, from
 * .github/workflows/cla.yml. It reads CLA.md from the checkout, which is main,
 * never the pull request. Exits non-zero while the author has not agreed.
 */

/** A GitHub REST call. Returns { status, data }; throws only on network errors. */
export function githubApi(token, base = 'https://api.github.com') {
  return async (method, path, body) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await response.text()
    return { status: response.status, data: text ? JSON.parse(text) : undefined }
  }
}

function expectOk({ status, data }, what) {
  if (status >= 200 && status < 300) return data
  throw new Error(`${what} failed with ${status}: ${data?.message ?? 'no message'}`)
}

/** The stored record and the file's sha. `branch` is false when there is no branch yet. */
export async function readSignatures(api, repo) {
  const ref = await api('GET', `/repos/${repo}/git/ref/heads/${SIGNATURES_BRANCH}`)
  if (ref.status === 404) return { record: { signatures: [] }, sha: undefined, branch: false }
  expectOk(ref, 'Reading the signatures branch')
  const file = await api(
    'GET',
    `/repos/${repo}/contents/${SIGNATURES_FILE}?ref=${SIGNATURES_BRANCH}`,
  )
  if (file.status === 404) return { record: { signatures: [] }, sha: undefined, branch: true }
  const data = expectOk(file, 'Reading the signatures')
  const record = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'))
  return { record, sha: data.sha, branch: true }
}

const encode = (record) => `${JSON.stringify(record, null, 2)}\n`

/**
 * Adds a signature to the signatures branch, creating the branch with no history
 * on the first agreement. Another pull request writing at the same moment makes
 * GitHub refuse the stale write (409 or 422), so it reads again and retries.
 */
export async function saveSignature(api, repo, signature, attempts = 3) {
  const message = `Record CLA ${signature.cla_version} agreement by @${signature.login} (#${signature.pull_request})`
  for (let attempt = 1; ; attempt++) {
    const { record, sha, branch } = await readSignatures(api, repo)
    if (findSignature(record.signatures, signature, signature.cla_version)) return
    const content = encode(withSignature(record, signature))
    let result
    if (branch) {
      result = await api('PUT', `/repos/${repo}/contents/${SIGNATURES_FILE}`, {
        message,
        branch: SIGNATURES_BRANCH,
        content: Buffer.from(content).toString('base64'),
        ...(sha ? { sha } : {}),
      })
    } else {
      const tree = expectOk(
        await api('POST', `/repos/${repo}/git/trees`, {
          tree: [{ path: SIGNATURES_FILE, mode: '100644', type: 'blob', content }],
        }),
        'Creating the signatures tree',
      )
      const commit = expectOk(
        await api('POST', `/repos/${repo}/git/commits`, { message, tree: tree.sha, parents: [] }),
        'Creating the signatures commit',
      )
      result = await api('POST', `/repos/${repo}/git/refs`, {
        ref: `refs/heads/${SIGNATURES_BRANCH}`,
        sha: commit.sha,
      })
    }
    if (result.status === 409 || result.status === 422) {
      if (attempt < attempts) continue
    }
    expectOk(result, 'Saving the signature')
    return
  }
}

/** Edits the check's earlier comment, or posts one. Posts nothing when there is nothing to say. */
export async function upsertComment(api, repo, number, text, { onlyIfPresent = false } = {}) {
  const comments = expectOk(
    await api('GET', `/repos/${repo}/issues/${number}/comments?per_page=100`),
    'Listing comments',
  )
  const earlier = comments.find(
    (c) => c.user?.login === 'github-actions[bot]' && c.body?.startsWith(COMMENT_MARKER),
  )
  if (earlier) {
    if (earlier.body !== text) {
      expectOk(
        await api('PATCH', `/repos/${repo}/issues/comments/${earlier.id}`, { body: text }),
        'Editing the comment',
      )
    }
  } else if (!onlyIfPresent) {
    expectOk(
      await api('POST', `/repos/${repo}/issues/${number}/comments`, { body: text }),
      'Posting the comment',
    )
  }
}

/** The whole check. Returns the outcome; the caller turns it into an exit code. */
export async function check({ api, event, claText, now = new Date() }) {
  const pr = event.pull_request
  const repo = event.repository.full_name
  const version = claVersion(claText)
  const claUrl = `https://github.com/${repo}/blob/${event.repository.default_branch}/CLA.md`
  const author = { login: pr.user.login, id: pr.user.id, type: pr.user.type }
  const owner = { id: event.repository.owner.id }
  const sender = { id: event.sender.id }

  let signatures = []
  if (author.id !== owner.id && author.type !== 'Bot') {
    signatures = (await readSignatures(api, repo)).record.signatures
  }
  const decision = decide({
    author,
    owner,
    sender,
    body: pr.body,
    signatures,
    version,
    now,
    pullRequest: pr.number,
  })
  if (decision.outcome === 'record') await saveSignature(api, repo, decision.signature)

  const text = commentFor(decision.outcome, { author, version, claUrl })
  if (text) {
    await upsertComment(api, repo, pr.number, text, {
      onlyIfPresent: decision.outcome === 'signed',
    })
  }
  return { ...decision, version }
}

const SUMMARY = {
  exempt: 'The author is the owner or a bot, so no agreement is needed.',
  signed: 'The author agreed to this version of the CLA earlier.',
  record: 'The author agreed to the CLA in this pull request; the agreement is recorded.',
  missing: "The author has not agreed to the CLA. The pull request's comment says how.",
  'not-author': 'The CLA box was checked by someone other than the author, which does not count.',
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'))
  const result = await check({
    api: githubApi(process.env.GITHUB_TOKEN),
    event,
    claText: await readFile('CLA.md', 'utf8'),
  })
  const line = `CLA ${result.version}: ${SUMMARY[result.outcome]}`
  console.log(line)
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${line}\n`)
  if (result.outcome === 'missing' || result.outcome === 'not-author') {
    console.log(`::error title=Contributor License Agreement::${SUMMARY[result.outcome]}`)
    process.exitCode = 1
  }
}
