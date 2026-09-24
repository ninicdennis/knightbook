import type { DocumentsApi } from '../src/shared/contract.js'
import type { ReviewChangesApi } from '../src/shared/review-contract.js'
import { record } from './record.js'
import { stubReviewChanges } from './review-changes-stub.js'
import { SAMPLE_DOCUMENT } from './sample-document.js'

/**
 * The documents half of the preview host: the included list, reading,
 * reviewing, changes since review, and where a link leads.
 */
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
  listDocuments: async () => ({
    ok: true,
    value: {
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
    },
  }),
  // architecture.md reads as changed since review, so its Changes view can be
  // looked at; the README stays unreviewed and offers no comparison.
  readDocument: async (_root, path) => ({
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
  }),
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
