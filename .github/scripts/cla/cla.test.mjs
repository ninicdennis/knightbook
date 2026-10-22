import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { boxChecked, claVersion, decide, COMMENT_MARKER } from './cla.mjs'
import { check, saveSignature } from './run.mjs'

const root = new URL('../../../', import.meta.url)
const owner = { login: 'owner', id: 1, type: 'User' }
const outsider = { login: 'outsider', id: 42, type: 'User' }
const now = new Date('2026-10-21T12:00:00Z')
const checked =
  '## Contributor License Agreement\n\n- [x] I have read the [Contributor License Agreement](https://example.test/CLA.md) and agree to it for this and my future contributions.\n'
const unchecked = checked.replace('[x]', '[ ]')

const base = { owner, sender: outsider, signatures: [], version: '1.0', now, pullRequest: 7 }

test('the owner and bots pass without agreeing', () => {
  assert.equal(decide({ ...base, author: owner, sender: owner, body: '' }).outcome, 'exempt')
  const bot = { login: 'dependabot[bot]', id: 99, type: 'Bot' }
  assert.equal(decide({ ...base, author: bot, sender: bot, body: '' }).outcome, 'exempt')
})

test('an outside author who has not checked the box fails', () => {
  assert.equal(decide({ ...base, author: outsider, body: unchecked }).outcome, 'missing')
  assert.equal(decide({ ...base, author: outsider, body: null }).outcome, 'missing')
  // The sentence without a box is not agreement.
  const noBox = 'I have read the [Contributor License Agreement](x) and agree to it.'
  assert.equal(decide({ ...base, author: outsider, body: noBox }).outcome, 'missing')
})

test("the author's own checked box is recorded with account, version and date", () => {
  const decision = decide({ ...base, author: outsider, body: checked })
  assert.equal(decision.outcome, 'record')
  assert.deepEqual(decision.signature, {
    login: 'outsider',
    id: 42,
    cla_version: '1.0',
    agreed_at: '2026-10-21T12:00:00.000Z',
    pull_request: 7,
  })
  assert.equal(boxChecked(checked.replace('[x]', '[X]')), true)
})

test('a box checked by someone else, the owner included, does not count', () => {
  const decision = decide({ ...base, author: outsider, sender: owner, body: checked })
  assert.equal(decision.outcome, 'not-author')
})

test('an earlier agreement to the same version passes; to an older version it does not', () => {
  const signature = { id: 42, login: 'renamed', cla_version: '1.0' }
  const signed = { ...base, author: outsider, body: '', signatures: [signature] }
  assert.equal(decide(signed).outcome, 'signed')
  const older = { ...signed, signatures: [{ ...signature, cla_version: '0.9' }] }
  assert.equal(decide(older).outcome, 'missing')
  // 1.10 is not 1.1.
  assert.equal(decide({ ...signed, version: '1.10' }).outcome, 'missing')
})

test("the version comes from CLA.md's own version line", async () => {
  assert.equal(claVersion(await readFile(new URL('CLA.md', root), 'utf8')), '1.0')
  assert.equal(claVersion('# CLA\n\nVersion 1.10, 2027-01-02. Adapted.'), '1.10')
  assert.throws(() => claVersion('# CLA without a version'), /no "Version/)
})

/** A fake GitHub holding one repository's signatures branch and comments. */
function fakeGitHub({ branch = false, file, conflicts = 0 } = {}) {
  const calls = []
  const state = { branch, file, comments: [] }
  const api = async (method, path, body) => {
    calls.push({ method, path, body })
    const ok = (data, status = 200) => ({ status, data })
    if (path.endsWith('/git/ref/heads/cla-signatures')) {
      return state.branch ? ok({}) : { status: 404, data: { message: 'Not Found' } }
    }
    if (method === 'GET' && path.includes('/contents/signatures.json')) {
      if (!state.file) return { status: 404, data: {} }
      const content = Buffer.from(JSON.stringify(state.file)).toString('base64')
      return ok({ content, sha: 'file-sha' })
    }
    if (method === 'PUT') {
      if (conflicts-- > 0) return { status: 409, data: { message: 'sha mismatch' } }
      state.file = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'))
      return ok({}, 201)
    }
    if (path.endsWith('/git/trees')) return ok({ sha: 'tree-sha' }, 201)
    if (path.endsWith('/git/commits')) return ok({ sha: 'commit-sha' }, 201)
    if (path.endsWith('/git/refs')) {
      state.branch = true
      return ok({}, 201)
    }
    if (method === 'GET' && path.includes('/comments')) return ok(state.comments)
    if (method === 'POST' && path.includes('/comments')) {
      state.comments.push({ id: 5, body: body.body, user: { login: 'github-actions[bot]' } })
      return ok({}, 201)
    }
    if (method === 'PATCH') {
      state.comments[0].body = body.body
      return ok({})
    }
    throw new Error(`unexpected ${method} ${path}`)
  }
  return { api, calls, state }
}

const signature = { login: 'outsider', id: 42, cla_version: '1.0', pull_request: 7 }

test('the first agreement creates the signatures branch with no history', async () => {
  const github = fakeGitHub()
  await saveSignature(github.api, 'o/r', signature)
  const commit = github.calls.find((c) => c.path.endsWith('/git/commits'))
  assert.deepEqual(commit.body.parents, [])
  const tree = github.calls.find((c) => c.path.endsWith('/git/trees'))
  assert.deepEqual(JSON.parse(tree.body.tree[0].content), { signatures: [signature] })
  const ref = github.calls.find((c) => c.path.endsWith('/git/refs'))
  assert.equal(ref.body.ref, 'refs/heads/cla-signatures')
})

test('a later agreement is added to the file, retrying after a conflicting write', async () => {
  const earlier = { login: 'first', id: 3, cla_version: '1.0', pull_request: 2 }
  const github = fakeGitHub({ branch: true, file: { signatures: [earlier] }, conflicts: 1 })
  await saveSignature(github.api, 'o/r', signature)
  assert.deepEqual(github.state.file, { signatures: [earlier, signature] })
  const puts = github.calls.filter((c) => c.method === 'PUT')
  assert.equal(puts.length, 2)
  assert.equal(puts[1].body.sha, 'file-sha')
  assert.equal(puts[1].body.branch, 'cla-signatures')
})

function event({ author, sender = author, body }) {
  return {
    pull_request: { number: 7, body, user: author },
    repository: { full_name: 'o/r', default_branch: 'main', owner: { id: owner.id } },
    sender: { id: sender.id },
  }
}
const claText = 'Version 1.0, 2026-10-21. Adapted.'

test('a missing agreement fails with one comment, edited when the author agrees', async () => {
  const github = fakeGitHub()
  const first = await check({
    api: github.api,
    event: event({ author: outsider, body: '' }),
    claText,
    now,
  })
  assert.equal(first.outcome, 'missing')
  await check({ api: github.api, event: event({ author: outsider, body: '' }), claText, now })
  assert.equal(github.state.comments.length, 1)
  assert.ok(github.state.comments[0].body.startsWith(COMMENT_MARKER))
  assert.match(
    github.state.comments[0].body,
    /- \[x\] I have read the \[Contributor License Agreement\]/,
  )

  const agreed = await check({
    api: github.api,
    event: event({ author: outsider, body: checked }),
    claText,
    now,
  })
  assert.equal(agreed.outcome, 'record')
  assert.equal(github.state.comments.length, 1)
  assert.match(github.state.comments[0].body, /is recorded/)
  assert.equal(github.state.branch, true)
})

test("the owner's pull request reads no signatures and posts no comment", async () => {
  const github = fakeGitHub()
  const result = await check({
    api: github.api,
    event: event({ author: owner, body: '' }),
    claText,
    now,
  })
  assert.equal(result.outcome, 'exempt')
  assert.deepEqual(github.calls, [])
})

test('the workflow runs nothing from the pull request', async () => {
  const workflow = await readFile(new URL('.github/workflows/cla.yml', root), 'utf8')
  assert.match(workflow, /^\s+pull_request_target:/m)
  // Checking out the pull request's head would run its code with a write token.
  assert.doesNotMatch(workflow, /pull_request\.head|github\.head_ref|refs\/pull/)
  assert.doesNotMatch(workflow, /^\s+ref:/m)
  assert.match(workflow, /persist-credentials: false/)
  assert.doesNotMatch(workflow, /pnpm|npm (ci|install)|secrets\./)
})
