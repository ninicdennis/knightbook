import type { DocumentSummary, FolderTitleView } from '../../shared/contract.js'

/**
 * The Documents sidebar as nested folders, derived from the real paths of the
 * included files. Nothing here is stored: folders exist in the tree only
 * because a document sits in them, and a user's title only relabels one.
 */

export interface FolderNode {
  kind: 'folder'
  /** Project-relative folder path, the key a title and expansion are stored under. */
  path: string
  /** The folder's own name on disk. */
  name: string
  /** The user's title for it, or null to show the name. */
  title: string | null
  children: TreeNode[]
}

export interface DocumentNode {
  kind: 'document'
  document: DocumentSummary
}

export type TreeNode = FolderNode | DocumentNode

/** Folders first, then documents, each in name order, at every level. */
export function buildDocumentTree(
  documents: DocumentSummary[],
  folderTitles: FolderTitleView[],
): TreeNode[] {
  const titles = new Map(folderTitles.map((entry) => [entry.path, entry.title]))
  const root: FolderNode = { kind: 'folder', path: '', name: '', title: null, children: [] }
  const folders = new Map<string, FolderNode>([['', root]])

  const folderAt = (path: string): FolderNode => {
    const existing = folders.get(path)
    if (existing) return existing
    const slash = path.lastIndexOf('/')
    const parent = folderAt(slash === -1 ? '' : path.slice(0, slash))
    const node: FolderNode = {
      kind: 'folder',
      path,
      name: path.slice(slash + 1),
      title: titles.get(path) ?? null,
      children: [],
    }
    parent.children.push(node)
    folders.set(path, node)
    return node
  }

  for (const document of documents) {
    const slash = document.path.lastIndexOf('/')
    folderAt(slash === -1 ? '' : document.path.slice(0, slash)).children.push({
      kind: 'document',
      document,
    })
  }

  for (const folder of folders.values()) folder.children.sort(compareNodes)
  return root.children
}

function compareNodes(a: TreeNode, b: TreeNode): number {
  if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
  const left = a.kind === 'folder' ? a.name : a.document.path
  const right = b.kind === 'folder' ? b.name : b.document.path
  return left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true })
}

/** Every folder above a document, outermost first, so revealing it can expand each one. */
export function ancestorFolders(documentPath: string): string[] {
  const parts = documentPath.split('/').slice(0, -1)
  return parts.map((_part, index) => parts.slice(0, index + 1).join('/'))
}
