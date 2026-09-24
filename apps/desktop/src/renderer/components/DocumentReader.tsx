import { Badge, Button, Code, Group, ScrollArea, Stack, Text, Tooltip } from '@mantine/core'
import { IconExternalLink, IconEye } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DocumentReadView } from '../../shared/contract.js'
import type { LinkRequest, ScrollTarget } from '../hooks/useLinkNavigation.js'
import { useReviewChanges } from '../hooks/useReviewChanges.js'
import { renderMarkdown } from '../markdown.js'
import { BackToSource, type BackTarget } from './BackToSource.js'
import { MarkdownBody } from './MarkdownBody.js'
import { ReviewBadge } from './ReviewBadge.js'
import { ReadingModeSwitch, ReviewChanges, type ReadingMode } from './ReviewChanges.js'

/**
 * One document, either rendered or as its changes since the user's last review.
 *
 * Marking it reviewed always names the revision on screen: the rendered one in
 * Read, the compared one in Changes. The host refuses a review of anything newer,
 * so an edit that lands while the user is reading cannot be approved unseen.
 */

interface Props {
  rootPath: string
  document: DocumentReadView
  onReview: (revision: string) => void
  onOpenExternally: () => void
  onFollowLink: (request: LinkRequest) => Promise<string | null>
  scrollTo: ScrollTarget | null
  /** Back to where the link that opened this document was followed from. */
  back: BackTarget | null
}

export function DocumentReader({
  rootPath,
  document,
  onReview,
  onOpenExternally,
  onFollowLink,
  scrollTo,
  back,
}: Props) {
  const [chosenMode, setMode] = useState<ReadingMode>('read')
  const viewport = useRef<HTMLDivElement>(null)

  // Another document starts at its top, unless the link named a heading: then
  // MarkdownBody has already scrolled there (a child's effect runs first).
  const headingRequested = scrollTo !== null
  useEffect(() => {
    if (!headingRequested) viewport.current?.scrollTo?.({ top: 0 })
  }, [document.path, headingRequested])
  // Never-reviewed content has nothing to compare against, so it only reads.
  const canCompare = document.review.state !== 'unreviewed'
  const mode: ReadingMode = canCompare ? chosenMode : 'read'
  const changes = useReviewChanges(
    rootPath,
    mode === 'changes' ? { kind: 'document', path: document.path } : null,
    document.revision,
  )
  const rendered = useMemo(
    () => (mode === 'read' ? renderMarkdown(document.content, document.path) : null),
    [mode, document.content, document.path],
  )

  const shownRevision =
    mode === 'read'
      ? document.revision
      : changes.load.status === 'ready'
        ? changes.load.view.currentRevision
        : null

  return (
    <Stack gap="sm" style={{ height: '100%' }}>
      <Group justify="space-between" wrap="wrap" align="flex-start" gap="xs">
        <Stack gap={4} style={{ minWidth: 0 }}>
          <BackToSource back={back} />
          <Text size="sm" c="dimmed" style={{ wordBreak: 'break-all' }}>
            {document.path}
          </Text>
          <Group gap="xs">
            <ReviewBadge review={document.review} />
            <Badge size="xs" variant="default">
              Read-only
            </Badge>
          </Group>
        </Stack>

        <Group gap="xs" wrap="wrap">
          {canCompare && <ReadingModeSwitch mode={mode} onChange={setMode} />}
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
      </Group>

      {rendered?.frontmatter && (
        <Code block style={{ maxHeight: 140, overflow: 'auto', fontSize: 11 }}>
          {rendered.frontmatter.trimEnd()}
        </Code>
      )}

      <ScrollArea.Autosize mah="calc(100vh - 260px)" type="auto" viewportRef={viewport}>
        {rendered ? (
          <MarkdownBody html={rendered.html} onFollowLink={onFollowLink} scrollTo={scrollTo} />
        ) : (
          <ReviewChanges
            load={changes.load}
            heldRevision={document.revision}
            onReload={changes.reload}
          />
        )}
      </ScrollArea.Autosize>
    </Stack>
  )
}
