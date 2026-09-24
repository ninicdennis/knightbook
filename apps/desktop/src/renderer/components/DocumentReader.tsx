import { Alert, Badge, Button, Code, Group, Loader, Stack, Text, Tooltip } from '@mantine/core'
import { IconAlertTriangle, IconArrowLeft, IconExternalLink, IconEye } from '@tabler/icons-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react'
import type { DocumentReadView } from '../../shared/contract.js'
import type { LinkRequest, ScrollTarget } from '../hooks/useLinkNavigation.js'
import { useReviewChanges } from '../hooks/useReviewChanges.js'
import { renderMarkdown } from '../markdown.js'
import { BackToSource, type BackTarget } from './BackToSource.js'
import { MarkdownBody } from './MarkdownBody.js'
import { ReviewBadge } from './ReviewBadge.js'
import { ReadingModeSwitch, ReviewChanges, type ReadingMode } from './ReviewChanges.js'

/**
 * One document, read-only: rendered, or as its changes since the user's last
 * review. Editing stays in the user's own editor until the formatted-editor
 * question is settled, so this says so rather than offering an edit affordance
 * that does not work.
 *
 * The toolbar stays in place and the body is the one region that scrolls; that
 * region is also where an editor would go.
 */

export type ReaderState =
  | { kind: 'loading'; path: string }
  | { kind: 'failed'; path: string; message: string }
  | { kind: 'ready'; document: DocumentReadView }

interface Props {
  rootPath: string
  state: ReaderState
  title: string
  /** Set on a narrow window, where the list and the reader take turns. */
  onBack?: () => void
  /** Back to where the link that opened this document was followed from. */
  back: BackTarget | null
  /** A failure from an action (review, include), shown above the body. */
  notice?: ReactNode
  headingRef?: Ref<HTMLHeadingElement>
  onRetry: () => void
  onReview: (revision: string) => void
  onOpenExternally: () => void
  onFollowLink: (request: LinkRequest) => Promise<string | null>
  scrollTo: ScrollTarget | null
}

/*
 * Every state renders through the same frame, in the same place, so the title a
 * narrow window just moved focus to survives the switch from loading to loaded.
 */
export function DocumentReader(props: Props) {
  const { state } = props
  const document = state.kind === 'ready' ? state.document : null
  const body = useRef<HTMLElement>(null)
  const view = useDocumentView(props.rootPath, document, props.scrollTo, body)

  return (
    <ReaderFrame
      {...props}
      path={document ? document.path : state.kind === 'ready' ? '' : state.path}
      badges={
        document && (
          <Group gap="xs">
            <ReviewBadge review={document.review} />
            <Badge size="xs" variant="default">
              Read-only
            </Badge>
          </Group>
        )
      }
      actions={
        document && (
          <DocumentActions
            document={document}
            view={view}
            onReview={props.onReview}
            onOpenExternally={props.onOpenExternally}
          />
        )
      }
    >
      {document ? (
        // No tabIndex: Chromium makes a scrolling region keyboard-focusable by itself.
        <article className="ps-docs-body" ref={body}>
          {view.rendered?.frontmatter && (
            <Code block mb="sm" style={{ maxHeight: 140, overflow: 'auto', fontSize: 11 }}>
              {view.rendered.frontmatter.trimEnd()}
            </Code>
          )}
          {view.rendered ? (
            <MarkdownBody
              html={view.rendered.html}
              onFollowLink={props.onFollowLink}
              scrollTo={props.scrollTo}
            />
          ) : (
            <ReviewChanges
              load={view.changes.load}
              heldRevision={document.revision}
              onReload={view.changes.reload}
            />
          )}
        </article>
      ) : state.kind === 'failed' ? (
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
              <Button size="xs" variant="default" onClick={props.onRetry}>
                Try again
              </Button>
            </Stack>
          </Alert>
        </div>
      ) : (
        <div className="ps-docs-state">
          <Group gap="xs">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">
              Reading the document…
            </Text>
          </Group>
        </div>
      )}
    </ReaderFrame>
  )
}

/** How the document on screen is shown: rendered, or its changes since review. */
function useDocumentView(
  rootPath: string,
  document: DocumentReadView | null,
  scrollTo: ScrollTarget | null,
  body: RefObject<HTMLElement | null>,
) {
  const [chosenMode, setMode] = useState<ReadingMode>('read')

  // Another document starts at its top, unless the link named a heading: then
  // MarkdownBody has already scrolled there (a child's effect runs first).
  const headingRequested = scrollTo !== null
  const path = document?.path
  useEffect(() => {
    if (!headingRequested) body.current?.scrollTo?.({ top: 0 })
  }, [path, headingRequested, body])

  // Never-reviewed content has nothing to compare against, so it only reads.
  const canCompare = document !== null && document.review.state !== 'unreviewed'
  const mode: ReadingMode = canCompare ? chosenMode : 'read'
  const changes = useReviewChanges(
    rootPath,
    document && mode === 'changes' ? { kind: 'document', path: document.path } : null,
    document?.revision ?? '',
  )
  const content = document?.content
  const rendered = useMemo(
    () => (path && content !== undefined && mode === 'read' ? renderMarkdown(content, path) : null),
    [mode, content, path],
  )

  const shownRevision =
    mode === 'read'
      ? (document?.revision ?? null)
      : changes.load.status === 'ready'
        ? changes.load.view.currentRevision
        : null

  return { mode, setMode, canCompare, changes, rendered, shownRevision }
}

/**
 * Marking it reviewed always names the revision on screen: the rendered one in
 * Read, the compared one in Changes. The host refuses a review of anything newer,
 * so an edit that lands while the user is reading cannot be approved unseen.
 */
function DocumentActions({
  document,
  view,
  onReview,
  onOpenExternally,
}: {
  document: DocumentReadView
  view: ReturnType<typeof useDocumentView>
  onReview: (revision: string) => void
  onOpenExternally: () => void
}) {
  const { shownRevision } = view
  return (
    <Group gap="xs" wrap="wrap">
      {view.canCompare && <ReadingModeSwitch mode={view.mode} onChange={view.setMode} />}
      {document.review.state !== 'reviewed' && (
        <Button
          size="xs"
          variant="default"
          leftSection={<IconEye size={14} />}
          disabled={shownRevision === null}
          onClick={() => shownRevision && onReview(shownRevision)}
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
  )
}

/** The toolbar and notice every reader state shares, around its own body. */
function ReaderFrame({
  title,
  path,
  onBack,
  back,
  notice,
  headingRef,
  badges,
  actions,
  children,
}: Pick<Props, 'title' | 'onBack' | 'back' | 'notice' | 'headingRef'> & {
  path: string
  badges?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
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
            <BackToSource back={back} />
            <h2 id="document-reader-title" className="ps-docs-title" ref={headingRef} tabIndex={-1}>
              {title}
            </h2>
            <div className="ps-docs-reader-path">{path}</div>
            {badges}
          </Stack>
        </div>
        {actions}
      </div>

      {notice}

      {children}
    </section>
  )
}
