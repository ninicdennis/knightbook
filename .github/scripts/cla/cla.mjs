/**
 * The contributor agreement check (D-049). This file decides; run.mjs reads the
 * event and talks to GitHub. Nothing here runs code from a pull request: the pull
 * request's body is only ever matched as text.
 */

/** The branch that holds the record of agreements, kept apart from main. */
export const SIGNATURES_BRANCH = 'cla-signatures'
export const SIGNATURES_FILE = 'signatures.json'

/** Marks the check's own comment, so it is edited rather than posted again. */
export const COMMENT_MARKER = '<!-- knightbook-cla-check -->'

/** The CLA's version, from the "Version 1.0, 2026-10-21." line at its top. */
export function claVersion(claText) {
  const match = /^Version (\d+(?:\.\d+)*), \d{4}-\d{2}-\d{2}\./m.exec(claText)
  if (!match) throw new Error('CLA.md has no "Version <number>, <date>." line')
  return match[1]
}

/**
 * Whether the body has the pull-request form's CLA box checked. An unchecked box,
 * or the sentence without a box, is not agreement.
 */
export function boxChecked(body) {
  return /^[ \t]*[-*][ \t]+\[[xX]\][ \t]+I have read the \[Contributor License Agreement\]/m.test(
    body ?? '',
  )
}

/** The owner and bots need no agreement. Accounts are compared by id, not name. */
export function isExempt(author, owner) {
  return author.id === owner.id || author.type === 'Bot'
}

/** The author's agreement to this version of the CLA, if one is recorded. */
export function findSignature(signatures, author, version) {
  return signatures.find((s) => s.id === author.id && s.cla_version === version)
}

/**
 * What to do about one pull request. `sender` is whoever caused the event: only
 * the author's own checked box counts, so nobody can agree on their behalf, the
 * owner included.
 *
 * Returns { outcome, signature? }, where outcome is one of `exempt`, `signed`,
 * `record` (record `signature`, then pass), `missing` or `not-author` (fail).
 */
export function decide({ author, owner, sender, body, signatures, version, now, pullRequest }) {
  if (isExempt(author, owner)) return { outcome: 'exempt' }
  if (findSignature(signatures, author, version)) return { outcome: 'signed' }
  if (!boxChecked(body)) return { outcome: 'missing' }
  if (sender.id !== author.id) return { outcome: 'not-author' }
  return {
    outcome: 'record',
    signature: {
      login: author.login,
      id: author.id,
      cla_version: version,
      agreed_at: now.toISOString(),
      pull_request: pullRequest,
    },
  }
}

/** The comment shown on the pull request for each outcome that needs one. */
export function commentFor(outcome, { author, version, claUrl }) {
  const cla = `[Contributor License Agreement](${claUrl}) (version ${version})`
  switch (outcome) {
    case 'record':
    case 'signed':
      return `${COMMENT_MARKER}\nThanks, @${author.login}. Your agreement to the ${cla} is recorded, and it covers your later pull requests too.`
    case 'missing':
      return [
        COMMENT_MARKER,
        `Thanks for the pull request, @${author.login}. Before it can be merged, please read the ${cla} and agree to it by checking this box in the pull request's description (edit the description to add it if it is missing):`,
        '',
        '```markdown',
        `- [x] I have read the [Contributor License Agreement](${claUrl}) and agree to it for this and my future contributions.`,
        '```',
        '',
        'The check runs again when the description is saved. You only need to do this once.',
      ].join('\n')
    case 'not-author':
      return `${COMMENT_MARKER}\nThe CLA box was checked by someone other than @${author.login}. Only the author of a pull request can agree to the ${cla}: @${author.login}, please uncheck and check the box yourself.`
    default:
      return undefined
  }
}

/** Adds a signature to the stored record, which is { signatures: [...] }. */
export function withSignature(record, signature) {
  const signatures = record?.signatures ?? []
  return { signatures: [...signatures, signature] }
}
