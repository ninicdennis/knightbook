import type { DocumentListView, DocumentReadView, Result } from '../src/shared/contract.js'
import { SAMPLE_DOCUMENT } from './sample-document.js'

/**
 * Documents for the design preview. Add ?docs=many|none|list-error|read-error to
 * review a long list with deep paths, the empty workspace, and both failures.
 */

const want = new URLSearchParams(window.location.search).get('docs') ?? 'default'

const UNREVIEWED = { state: 'unreviewed', lastReviewedAt: null, changeSummary: null } as const
const REVIEWED = {
  state: 'reviewed',
  lastReviewedAt: '2026-09-18T09:00:00Z',
  changeSummary: null,
} as const

function defaultListing(): DocumentListView {
  return {
    documents: [
      { path: 'README.md', title: 'README', includedVia: 'README.md', review: UNREVIEWED },
      {
        path: 'docs/architecture.md',
        title: 'architecture',
        includedVia: 'docs',
        review: REVIEWED,
      },
    ],
    problems: [{ path: 'docs/moved-away.md', reason: 'missing' }],
  }
}

function manyListing(): DocumentListView {
  const listing = defaultListing()
  for (let n = 1; n <= 24; n += 1) {
    listing.documents.push({
      path: `docs/research/2026/september/very-long-folder-name-for-testing/finding-${n}.md`,
      title: `A research finding with a long descriptive title, number ${n}`,
      includedVia: 'docs',
      review: n % 3 === 0 ? REVIEWED : UNREVIEWED,
    })
  }
  return listing
}

export async function stubListDocuments(): Promise<Result<DocumentListView>> {
  if (want === 'list-error') {
    return { ok: false, code: 'io_error', message: 'The manifest could not be read.' }
  }
  if (want === 'none') return { ok: true, value: { documents: [], problems: [] } }
  return { ok: true, value: want === 'many' ? manyListing() : defaultListing() }
}

export async function stubReadDocument(path: string): Promise<Result<DocumentReadView>> {
  if (want === 'read-error' && path !== 'README.md') {
    return { ok: false, code: 'not_found', message: `${path} could not be read from disk.` }
  }
  return {
    ok: true,
    value: { path, content: SAMPLE_DOCUMENT, revision: 'rev-doc', review: UNREVIEWED },
  }
}
