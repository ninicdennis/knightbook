import { Button, Text } from '@mantine/core'
import { useMemo, useState, type ReactNode } from 'react'
import type { DocumentSummary, FolderTitleView } from '../../shared/contract.js'
import { buildDocumentTree } from '../document-tree.js'
import { useFolderExpansion } from '../hooks/useFolderExpansion.js'
import { DocumentTree } from './DocumentTree.js'
import { FolderTitleDialog } from './FolderTitleDialog.js'

/**
 * The document list, grouped into the folders the files really sit in, with
 * the manifest's include controls beneath it. The list scrolls on its own so
 * the include controls stay in reach, and those controls sit below a hairline
 * so they read as housekeeping rather than as documents.
 */

interface Props {
  rootPath: string
  documents: DocumentSummary[]
  folderTitles: FolderTitleView[]
  selected: string | null
  onSelect: (path: string) => void
  /** Saves or clears a folder's title. Resolves to a failure message, or null. */
  onSetFolderTitle: (folder: string, title: string | null) => Promise<string | null>
  /** The include and remove controls, rendered below the list. */
  entries: ReactNode
}

export function DocumentNav({
  rootPath,
  documents,
  folderTitles,
  selected,
  onSelect,
  onSetFolderTitle,
  entries,
}: Props) {
  const tree = useMemo(() => buildDocumentTree(documents, folderTitles), [documents, folderTitles])
  const expansion = useFolderExpansion(rootPath, selected)
  const [naming, setNaming] = useState<{ path: string; title: string | null } | null>(null)
  const stale = folderTitles.filter((entry) => entry.missing)

  return (
    <nav className="ps-docs-nav" aria-label="Documents">
      <div className="ps-docs-nav-heading">
        <span>Documents</span>
        <Text span size="xs" c="var(--ps-text-muted)">
          {documents.length}
        </Text>
      </div>

      <DocumentTree
        nodes={tree}
        selected={selected}
        isOpen={expansion.isOpen}
        onToggle={expansion.toggle}
        onSelect={onSelect}
        onNameFolder={(folder) => setNaming({ path: folder.path, title: folder.title })}
      />

      {stale.length > 0 && (
        <section className="ps-docs-stale" aria-label="Titles for missing folders">
          <Text size="xs" c="var(--ps-text-muted)">
            {stale.length === 1
              ? 'This title names a folder that no longer exists. It was kept in case the folder comes back.'
              : 'These titles name folders that no longer exist. They were kept in case the folders come back.'}
          </Text>
          {stale.map((entry) => (
            <div key={entry.path} className="ps-docs-stale-row">
              <Text size="xs" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                “{entry.title}” · {entry.path}
              </Text>
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                style={{ flexShrink: 0 }}
                aria-label={`Clear the title for ${entry.path}`}
                onClick={() => void onSetFolderTitle(entry.path, null)}
              >
                Clear
              </Button>
            </div>
          ))}
        </section>
      )}

      <div className="ps-docs-entries">{entries}</div>

      <FolderTitleDialog
        folder={naming}
        onSave={onSetFolderTitle}
        onClose={() => setNaming(null)}
      />
    </nav>
  )
}
