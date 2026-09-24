import type { DocumentListView, DocumentsApi, Result } from '../src/shared/contract.js'
import type { ReviewChangesApi } from '../src/shared/review-contract.js'
import { record } from './record.js'
import { stubReviewChanges } from './review-changes-stub.js'
import { SAMPLE_DOCUMENT } from './sample-document.js'

/**
 * The documents half of the preview host: the included list, reading,
 * reviewing, changes since review, and where a link leads.
 *
 * Add ?docs=many|none|list-error|read-error to review a long list with deep
 * paths, the empty workspace, and both failures.
 */

const want = new URLSearchParams(window.location.search).get('docs') ?? 'default'

function defaultListing(): DocumentListView {
  return {
    documents: [
      {
        path: 'README.md',
        title: 'README',
        includedVia: 'README.md',
        review: { state: 'unreviewed', lastReviewedAt: null, changeSummary: null },
      },
      {
        path: 'docs/architecture.md',
        title: 'architecture',
        includedVia: 'docs',
        review: {
          state: 'reviewed',
          lastReviewedAt: '2026-09-18T09:00:00Z',
          changeSummary: null,
        },
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
      review:
        n % 3 === 0
          ? { state: 'reviewed', lastReviewedAt: '2026-09-18T09:00:00Z', changeSummary: null }
          : { state: 'unreviewed', lastReviewedAt: null, changeSummary: null },
    })
  }
  return listing
}

async function listDocuments(): Promise<Result<DocumentListView>> {
  if (want === 'list-error') {
    return { ok: false, code: 'io_error', message: 'The manifest could not be read.' }
  }
  if (want === 'none') return { ok: true, value: { documents: [], problems: [] } }
  return { ok: true, value: want === 'many' ? manyListing() : defaultListing() }
}

export const documentsStub: DocumentsApi & Pick<ReviewChangesApi, 'documentChanges'> = {
  includeDocumentFiles: async (root) => {
    record('includeDocumentFiles', root)
    return await documentsStub.listDocuments(root)
  },
  includeDocumentFolder: async (root) => {
    record('includeDocumentFolder', root)
    return await documentsStub.listDocuments(root)
  },
  removeDocumentEntry: async (root, entry) => {
    record('removeDocumentEntry', entry)
    return await documentsStub.listDocuments(root)
  },
  listDocuments,
  // architecture.md reads as changed since review, so its Changes view can be
  // looked at; the README stays unreviewed and offers no comparison.
  readDocument: async (_root, path) =>
    want === 'read-error' && path !== 'README.md'
      ? { ok: false, code: 'not_found', message: `${path} could not be read from disk.` }
      : {
          ok: true,
          value: {
            path,
            content: SAMPLE_DOCUMENT,
            revision: 'rev-doc',
            review:
              path === 'docs/architecture.md'
                ? {
                    state: 'changed_since_review',
                    lastReviewedAt: '2026-09-18T09:00:00Z',
                    changeSummary: 'The content changed.',
                  }
                : { state: 'unreviewed', lastReviewedAt: null, changeSummary: null },
          },
        },
  reviewDocument: async (_root, path) => ({
    ok: true,
    value: {
      path,
      content: SAMPLE_DOCUMENT,
      revision: 'rev-doc',
      review: { state: 'reviewed', lastReviewedAt: '2026-09-19T12:00:00Z', changeSummary: null },
    },
  }),
  documentChanges: async (_root, path) => {
    record('documentChanges', path)
    return stubReviewChanges('rev-doc')
  },
  openDocumentExternally: async () => ({ ok: true, value: null }),
  resolveLink: async (_root, path) => {
    record('resolveLink', path)
    const ticket = /^\.projectspace\/tickets\/(.+)\.md$/.exec(path)
    return {
      ok: true,
      value: ticket ? { kind: 'ticket', id: ticket[1]! } : { kind: 'document', path },
    }
  },
  openExternalLink: async () => ({ ok: true, value: null }),
}
