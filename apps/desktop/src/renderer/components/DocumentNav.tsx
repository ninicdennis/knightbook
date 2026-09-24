import { Text, UnstyledButton, VisuallyHidden } from '@mantine/core'
import { IconEyeOff } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import type { DocumentSummary } from '../../shared/contract.js'

/**
 * The document list, with the manifest's include controls beneath it. The list
 * scrolls on its own so the include controls stay in reach, and those controls
 * sit below a hairline so they read as housekeeping rather than as documents.
 */

interface Props {
  documents: DocumentSummary[]
  selected: string | null
  onSelect: (path: string) => void
  /** The include and remove controls, rendered below the list. */
  entries: ReactNode
}

const REVIEW_HINT = {
  unreviewed: 'Not reviewed',
  changed_since_review: 'Changed since your review',
} as const

export function DocumentNav({ documents, selected, onSelect, entries }: Props) {
  return (
    <nav className="ps-docs-nav" aria-label="Documents">
      <div className="ps-docs-nav-heading">
        <span>Documents</span>
        <Text span size="xs" c="var(--ps-text-muted)">
          {documents.length}
        </Text>
      </div>

      <ul className="ps-docs-list">
        {documents.map((item) => (
          <li key={item.path}>
            <UnstyledButton
              className="ps-docs-item"
              aria-current={item.path === selected ? 'true' : undefined}
              data-document-path={item.path}
              onClick={() => onSelect(item.path)}
            >
              <span className="ps-docs-item-text">
                <span className="ps-docs-item-title" style={{ display: 'block' }}>
                  {item.title}
                </span>
                <span className="ps-docs-path" style={{ display: 'block' }} title={item.path}>
                  <span>{item.path}</span>
                </span>
              </span>
              {item.review.state !== 'reviewed' && (
                <span
                  title={REVIEW_HINT[item.review.state]}
                  style={{ flexShrink: 0, marginTop: 3 }}
                >
                  <IconEyeOff size={13} opacity={0.6} aria-hidden />
                  <VisuallyHidden>{REVIEW_HINT[item.review.state]}</VisuallyHidden>
                </span>
              )}
            </UnstyledButton>
          </li>
        ))}
      </ul>

      <div className="ps-docs-entries">{entries}</div>
    </nav>
  )
}
