import { UnstyledButton, VisuallyHidden } from '@mantine/core'
import { IconChevronRight, IconEyeOff, IconFolder, IconPencil } from '@tabler/icons-react'
import type { DocumentSummary } from '../../shared/contract.js'
import type { FolderNode, TreeNode } from '../document-tree.js'

/**
 * The document list as nested, collapsible folders. It follows the disclosure
 * pattern WAI-ARIA recommends for navigation rather than an ARIA tree: each
 * folder is a button carrying `aria-expanded`, each document a button carrying
 * `aria-current`, and Tab moves through them. Mantine's Tree was evaluated first
 * and set aside; the technical design records why.
 */

interface Props {
  nodes: TreeNode[]
  selected: string | null
  isOpen: (folder: string) => boolean
  onToggle: (folder: string) => void
  onSelect: (path: string) => void
  onNameFolder: (folder: FolderNode) => void
}

const REVIEW_HINT = {
  unreviewed: 'Not reviewed',
  changed_since_review: 'Changed since your review',
} as const

export function DocumentTree(props: Props) {
  return (
    <ul className="ps-docs-list">
      <Branch {...props} />
    </ul>
  )
}

function Branch({ nodes, ...rest }: Props) {
  return nodes.map((node) =>
    node.kind === 'folder' ? (
      <Folder key={`folder:${node.path}`} folder={node} {...rest} />
    ) : (
      <Document
        key={node.document.path}
        document={node.document}
        current={node.document.path === rest.selected}
        onSelect={rest.onSelect}
      />
    ),
  )
}

function Folder({ folder, ...rest }: Omit<Props, 'nodes'> & { folder: FolderNode }) {
  const open = rest.isOpen(folder.path)
  const groupId = `docs-folder-${folder.path.replace(/[^A-Za-z0-9_-]/g, '_')}`

  return (
    <li>
      <div className="ps-docs-folder">
        <UnstyledButton
          className="ps-docs-folder-toggle"
          aria-expanded={open}
          aria-controls={groupId}
          title={folder.path}
          onClick={() => rest.onToggle(folder.path)}
        >
          <IconChevronRight size={13} className="ps-docs-chevron" aria-hidden />
          <IconFolder size={14} opacity={0.6} aria-hidden />
          <span className="ps-docs-folder-label">{folder.title ?? folder.name}</span>
          {/* A title never hides where the folder really is. */}
          {folder.title && (
            <>
              {/* Keeps the two words apart for a screen reader; flex gap spaces them visually. */}{' '}
              <span className="ps-docs-folder-name">{folder.name}</span>
            </>
          )}
        </UnstyledButton>
        <UnstyledButton
          className="ps-docs-folder-rename"
          aria-label={`Name the folder ${folder.path}`}
          title="Give this folder a title"
          onClick={() => rest.onNameFolder(folder)}
        >
          <IconPencil size={13} aria-hidden />
        </UnstyledButton>
      </div>
      {open && (
        <ul id={groupId} className="ps-docs-group">
          <Branch nodes={folder.children} {...rest} />
        </ul>
      )}
    </li>
  )
}

function Document({
  document,
  current,
  onSelect,
}: {
  document: DocumentSummary
  current: boolean
  onSelect: (path: string) => void
}) {
  return (
    <li>
      <UnstyledButton
        className="ps-docs-item"
        aria-current={current ? 'true' : undefined}
        data-document-path={document.path}
        title={document.path}
        onClick={() => onSelect(document.path)}
      >
        <span className="ps-docs-item-text">
          <span className="ps-docs-item-title" style={{ display: 'block' }}>
            {document.title}
          </span>
        </span>
        {document.review.state !== 'reviewed' && (
          <span title={REVIEW_HINT[document.review.state]} style={{ flexShrink: 0, marginTop: 3 }}>
            <IconEyeOff size={13} opacity={0.6} aria-hidden />
            <VisuallyHidden>{REVIEW_HINT[document.review.state]}</VisuallyHidden>
          </span>
        )}
      </UnstyledButton>
    </li>
  )
}
