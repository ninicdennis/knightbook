import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Code,
  Group,
  Loader,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core'
import {
  IconAlertTriangle,
  IconExternalLink,
  IconEye,
  IconEyeOff,
  IconFileText,
} from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import type { DocumentListView, DocumentReadView } from '../../shared/contract.js'
import { renderMarkdown } from '../markdown.js'
import { MarkdownBody } from './MarkdownBody.js'
import { ReviewBadge } from './ReviewBadge.js'

/**
 * Reading project documentation. Editing stays in the user's own editor until
 * the formatted-editor question is settled, so this is deliberately read-only
 * and says so, rather than offering an edit affordance that does not work.
 */

interface Props {
  rootPath: string
  /** Asks the view to show one document. The nonce lets the same path be asked for twice. */
  openTarget?: { path: string; nonce: number } | null
  /** Changes whenever the project is refreshed, so the view re-reads from disk. */
  refreshToken?: number
}

export function DocumentsView({ rootPath, openTarget = null, refreshToken = 0 }: Props) {
  const [listing, setListing] = useState<DocumentListView | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [document, setDocument] = useState<DocumentReadView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void window.projectspace.listDocuments(rootPath).then((result) => {
      if (cancelled) return
      setLoading(false)
      if (result.ok) {
        setListing(result.value)
        setSelected((current) => current ?? result.value.documents[0]?.path ?? null)
      } else {
        setError(result.message)
      }
    })
    return () => {
      cancelled = true
    }
  }, [rootPath, refreshToken])

  useEffect(() => {
    if (openTarget) setSelected(openTarget.path)
  }, [openTarget])

  const open = useCallback(
    async (path: string) => {
      setSelected(path)
      setError(null)
      const result = await window.projectspace.readDocument(rootPath, path)
      if (result.ok) setDocument(result.value)
      else {
        setDocument(null)
        setError(result.message)
      }
    },
    [rootPath],
  )

  useEffect(() => {
    if (selected) void open(selected)
  }, [selected, open, refreshToken])

  const review = useCallback(async () => {
    if (!document) return
    const result = await window.projectspace.reviewDocument(rootPath, document.path)
    if (result.ok) {
      setDocument(result.value)
      const refreshed = await window.projectspace.listDocuments(rootPath)
      if (refreshed.ok) setListing(refreshed.value)
    } else setError(result.message)
  }, [rootPath, document])

  if (loading) {
    return (
      <Center style={{ height: '100%' }}>
        <Stack align="center" gap="xs">
          <Loader />
          <Text size="sm" c="dimmed">
            Reading project files…
          </Text>
        </Stack>
      </Center>
    )
  }

  if (!listing || listing.documents.length === 0) {
    return (
      <Center style={{ height: '100%' }}>
        <Alert
          icon={<IconFileText size={18} />}
          color="blue"
          variant="light"
          title="No documents included yet"
          w={520}
          maw="100%"
        >
          <Stack gap={6}>
            <Text size="sm">
              Existing Markdown stays where it already lives. Nothing is copied or moved when it is
              included here.
            </Text>
            <Text size="sm" c="dimmed">
              An AI tool connected to this project can include files and folders through MCP.
            </Text>
            {listing?.problems.map((problem) => (
              <Text key={problem.path} size="xs" c="orange">
                {problem.path} — {problem.reason === 'missing' ? 'no longer exists' : 'unreadable'}
              </Text>
            ))}
          </Stack>
        </Alert>
      </Center>
    )
  }

  return (
    <Group align="stretch" gap="md" wrap="nowrap" style={{ height: '100%' }}>
      <Card withBorder padding="xs" radius="md" w={280} style={{ flexShrink: 0 }}>
        <ScrollArea.Autosize mah="calc(100vh - 140px)" type="hover">
          <Stack gap={2}>
            {listing.documents.map((item) => (
              <NavLink
                key={item.path}
                active={item.path === selected}
                label={item.title}
                description={item.path}
                onClick={() => setSelected(item.path)}
                rightSection={
                  item.review.state !== 'reviewed' ? (
                    <IconEyeOff size={13} opacity={0.5} />
                  ) : undefined
                }
              />
            ))}
          </Stack>
        </ScrollArea.Autosize>

        {listing.problems.length > 0 && (
          <Alert color="orange" variant="light" mt="xs" p="xs">
            <Text size="xs" fw={600}>
              Included but missing
            </Text>
            {listing.problems.map((problem) => (
              <Text key={problem.path} size="xs">
                {problem.path}
              </Text>
            ))}
          </Alert>
        )}
      </Card>

      <Card withBorder padding="md" radius="md" style={{ flex: 1, minWidth: 0 }}>
        {error && (
          <Alert
            icon={<IconAlertTriangle size={16} />}
            color="orange"
            variant="light"
            mb="sm"
            withCloseButton
            onClose={() => setError(null)}
          >
            {error}
          </Alert>
        )}
        {document && (
          <DocumentReader
            document={document}
            onReview={() => void review()}
            onOpenExternally={() =>
              void window.projectspace.openDocumentExternally(rootPath, document.path)
            }
            onFollowLink={(path) => setSelected(path)}
          />
        )}
      </Card>
    </Group>
  )
}

function DocumentReader({
  document,
  onReview,
  onOpenExternally,
  onFollowLink,
}: {
  document: DocumentReadView
  onReview: () => void
  onOpenExternally: () => void
  onFollowLink: (path: string) => void
}) {
  const rendered = renderMarkdown(document.content, document.path)

  return (
    <Stack gap="sm" style={{ height: '100%' }}>
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Stack gap={4} style={{ minWidth: 0 }}>
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

        <Group gap="xs" wrap="nowrap">
          {document.review.state !== 'reviewed' && (
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
      </Group>

      {rendered.frontmatter && (
        <Code block style={{ maxHeight: 140, overflow: 'auto', fontSize: 11 }}>
          {rendered.frontmatter.trimEnd()}
        </Code>
      )}

      <ScrollArea.Autosize mah="calc(100vh - 260px)" type="auto">
        <MarkdownBody html={rendered.html} onFollowLink={onFollowLink} />
      </ScrollArea.Autosize>
    </Stack>
  )
}
