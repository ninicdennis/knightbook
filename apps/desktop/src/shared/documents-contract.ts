/**
 * What the window is told about the project's documents, and the operations for
 * reading and including them. Part of the renderer contract in contract.ts,
 * which re-exports it.
 */

import type { Result } from './contract.js'
import type { ReviewView } from './review-contract.js'

export interface DocumentSummary {
  path: string
  title: string
  /** The manifest entry this came from: the file itself, or a folder above it. */
  includedVia: string
  review: ReviewView
}

export interface DocumentProblem {
  path: string
  reason: 'missing' | 'not_readable'
}

export interface DocumentListView {
  documents: DocumentSummary[]
  /** Manifest entries that no longer resolve. Reported, never hidden. */
  problems: DocumentProblem[]
}

export interface DocumentReadView {
  path: string
  content: string
  revision: string
  review: ReviewView
}

/**
 * Where an in-project link leads, decided by the host from the files on disk.
 * `unavailable` carries a message for the person who clicked.
 */
export type LinkDestinationView =
  | { kind: 'document'; path: string }
  | { kind: 'ticket'; id: string }
  | {
      kind: 'unavailable'
      reason: 'outside_project' | 'reserved' | 'not_markdown' | 'not_included' | 'not_found'
      message: string
    }

export interface DocumentsApi {
  listDocuments(rootPath: string): Promise<Result<DocumentListView>>
  /**
   * Opens a picker for Markdown files inside the project and includes them
   * where they are (D-011). Nothing is copied or moved. Cancelling returns the
   * list unchanged.
   *
   * Files and folders are separate actions because Windows and Linux cannot show
   * one dialog that selects both.
   */
  includeDocumentFiles(rootPath: string): Promise<Result<DocumentListView>>
  includeDocumentFolder(rootPath: string): Promise<Result<DocumentListView>>
  /** Drops one manifest entry. The file or folder itself is left on disk. */
  removeDocumentEntry(rootPath: string, entry: string): Promise<Result<DocumentListView>>
  readDocument(rootPath: string, path: string): Promise<Result<DocumentReadView>>
  /** The user's own review (D-003); a revision refuses content changed since shown. */
  reviewDocument(
    rootPath: string,
    path: string,
    revision?: string,
  ): Promise<Result<DocumentReadView>>
  /** Hands the file to the user's registered editor. */
  openDocumentExternally(rootPath: string, path: string): Promise<Result<null>>
  /**
   * Resolves a link's project-relative path to an included document or a ticket.
   * Reads only: following a link never includes a document or opens a file.
   */
  resolveLink(rootPath: string, path: string): Promise<Result<LinkDestinationView>>
  /** Opens an http(s) link from a document, on an explicit user click. */
  openExternalLink(url: string): Promise<Result<null>>
}
