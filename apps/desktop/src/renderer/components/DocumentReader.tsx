import { Alert, Badge, Button, Code, Group, Loader, Stack, Text, Tooltip } from '@mantine/core'
import { IconAlertTriangle, IconArrowLeft, IconExternalLink, IconEye } from '@tabler/icons-react'
import type { ReactNode, Ref } from 'react'
import type { DocumentReadView } from '../../shared/contract.js'
import { renderMarkdown } from '../markdown.js'
import { MarkdownBody } from './MarkdownBody.js'
import { ReviewBadge } from './ReviewBadge.js'

/**
 * One document, read-only. Editing stays in the user's own editor until the
 * formatted-editor question is settled, so this says so rather than offering an
 * edit affordance that does not work.
 *
 * The toolbar stays in place and the body is the one region that scrolls; that
 * region is also where an editor would go.
 */

export type ReaderState =
  | { kind: 'loading'; path: string }
  | { kind: 'failed'; path: string; message: string }
  | { kind: 'ready'; document: DocumentReadView }

interface Props {
  state: ReaderState
  title: string
  /** Set on a narrow window, where the list and the reader take turns. */
  onBack?: () => void
  /** A failure from an action (review, include), shown above the body. */
  notice?: ReactNode
  headingRef?: Ref<HTMLHeadingElement>
  onRetry: () => void
  onReview: () => void
  onOpenExternally: () => void
  onFollowLink: (path: string) => void
}

export function DocumentReader({
  state,
  title,
  onBack,
  notice,
  headingRef,
  onRetry,
  onReview,
  onOpenExternally,
  onFollowLink,
}: Props) {
  const path = state.kind === 'ready' ? state.document.path : state.path

  return (
    <section className="ps-docs-reader" aria-labelledby="document-reader-title">
      <div className="ps-docs-toolbar">
        <div className="ps-docs-toolbar-identity">
          {onBack && (
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              leftSection={<IconArrowLeft size={14} />}
              onClick={onBack}
              style={{ flexShrink: 0 }}
            >
              All documents
            </Button>
          )}
          <Stack gap={4} style={{ minWidth: 0 }}>
            <h2 id="document-reader-title" className="ps-docs-title" ref={headingRef} tabIndex={-1}>
              {title}
            </h2>
            <div className="ps-docs-reader-path">{path}</div>
            {state.kind === 'ready' && (
              <Group gap="xs">
                <ReviewBadge review={state.document.review} />
                <Badge size="xs" variant="default">
                  Read-only
                </Badge>
              </Group>
            )}
          </Stack>
        </div>

        {state.kind === 'ready' && (
          <Group gap="xs" wrap="wrap">
            {state.document.review.state !== 'reviewed' && (
              <Button
                size="xs"
                variant="default"
                leftSection={<IconEye size={14} />}
                onClick={onReview}
              >
                Mark reviewed
              </Button>
            )}
            <Tooltip label="Open in your own editor" withArrow>
              <Button
                size="xs"
                variant="default"
                leftSection={<IconExternalLink size={14} />}
                onClick={onOpenExternally}
              >
                Edit externally
              </Button>
            </Tooltip>
          </Group>
        )}
      </div>

      {notice}

      <ReaderBody state={state} onRetry={onRetry} onFollowLink={onFollowLink} />
    </section>
  )
}

function ReaderBody({
  state,
  onRetry,
  onFollowLink,
}: {
  state: ReaderState
  onRetry: () => void
  onFollowLink: (path: string) => void
}) {
  if (state.kind === 'loading') {
    return (
      <div className="ps-docs-state">
        <Group gap="xs">
          <Loader size="sm" />
          <Text size="sm" c="var(--ps-text-muted)">
            Reading the document…
          </Text>
        </Group>
      </div>
    )
  }

  if (state.kind === 'failed') {
    return (
      <div className="ps-docs-state">
        <Alert
          icon={<IconAlertTriangle size={16} />}
          color="orange"
          variant="light"
          title="This document could not be opened"
          maw={480}
        >
          <Stack gap="sm" align="flex-start">
            <Text size="sm">{state.message}</Text>
            <Button size="xs" variant="default" onClick={onRetry}>
              Try again
            </Button>
          </Stack>
        </Alert>
      </div>
    )
  }

  const rendered = renderMarkdown(state.document.content, state.document.path)
  // No tabIndex: Chromium makes a scrolling region keyboard-focusable by itself.
  return (
    <article className="ps-docs-body">
      {rendered.frontmatter && (
        <Code block mb="sm" style={{ maxHeight: 140, overflow: 'auto', fontSize: 11 }}>
          {rendered.frontmatter.trimEnd()}
        </Code>
      )}
      <MarkdownBody html={rendered.html} onFollowLink={onFollowLink} />
    </article>
  )
}
