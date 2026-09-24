import {
  Alert,
  Badge,
  Button,
  Code,
  Group,
  List,
  Loader,
  SegmentedControl,
  Stack,
  Text,
  Tooltip,
  VisuallyHidden,
} from '@mantine/core'
import {
  IconAlertTriangle,
  IconFileDiff,
  IconFileText,
  IconInfoCircle,
  IconRefresh,
} from '@tabler/icons-react'
import type { ReactNode } from 'react'
import type { ChangeSectionView, ReviewChangesView } from '../../shared/contract.js'
import type { ChangesLoad } from '../hooks/useReviewChanges.js'
import { DiffTable } from './DiffTable.js'
import { formatWhen } from './TicketDetailSections.js'

/**
 * The read-only "changes since your review" view, shared by documents and
 * tickets. Every outcome of the comparison says what it is: no review to
 * compare against is never drawn as an empty document, and an unreadable
 * snapshot is never quietly treated as no history.
 *
 * Opening this records nothing. The review action stays where it always was,
 * and the caller passes it the revision this view compared.
 */

interface Props {
  load: ChangesLoad
  /** The revision the surrounding view holds, to notice a comparison of older content. */
  heldRevision: string
  onReload: () => void
}

export type ReadingMode = 'read' | 'changes'

/**
 * An icon with its name kept for assistive technology and shown on hover, so the
 * control stays small without becoming a pair of unlabelled pictures.
 */
function ModeLabel({ name, icon }: { name: string; icon: ReactNode }) {
  return (
    <Tooltip label={name} withArrow>
      <span style={{ display: 'flex', alignItems: 'center' }}>
        {icon}
        <VisuallyHidden>{name}</VisuallyHidden>
      </span>
    </Tooltip>
  )
}

/**
 * Switches between the rendered content and its changes since review. Callers
 * leave it out for content that was never reviewed: there is nothing to compare.
 */
export function ReadingModeSwitch({
  mode,
  onChange,
}: {
  mode: ReadingMode
  onChange: (mode: ReadingMode) => void
}) {
  return (
    <SegmentedControl
      size="xs"
      aria-label="How to show this"
      value={mode}
      onChange={(value) => onChange(value === 'changes' ? 'changes' : 'read')}
      data={[
        { value: 'read', label: <ModeLabel name="Read" icon={<IconFileText size={16} />} /> },
        {
          value: 'changes',
          label: <ModeLabel name="Changes since review" icon={<IconFileDiff size={16} />} />,
        },
      ]}
    />
  )
}

const PART_TITLE: Record<ChangeSectionView['part'], string> = {
  metadata: 'Frontmatter',
  body: 'Body',
}

export function ReviewChanges({ load, heldRevision, onReload }: Props) {
  if (load.status === 'idle') return null

  if (load.status === 'loading') {
    return (
      <Group gap="xs">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">
          Comparing with your last review…
        </Text>
      </Group>
    )
  }

  if (load.status === 'error') {
    return (
      <Alert
        icon={<IconAlertTriangle size={16} />}
        color="orange"
        variant="light"
        title="Could not compare"
      >
        {load.message} Nothing was changed.
      </Alert>
    )
  }

  const view = load.view
  return (
    <Stack gap="md">
      {view.currentRevision !== heldRevision && (
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
          <Group justify="space-between" gap="xs">
            <Text size="sm">The file changed after this comparison was made.</Text>
            <Button
              size="xs"
              variant="default"
              leftSection={<IconRefresh size={14} />}
              onClick={onReload}
            >
              Compare again
            </Button>
          </Group>
        </Alert>
      )}

      {view.unreadableSnapshots > 0 && <UnreadableSnapshots view={view} />}
      <Outcome view={view} />
      <Text size="xs" c="dimmed">
        Current revision <Code>{view.currentRevision.slice(0, 12)}</Code>
      </Text>

      {view.notes.length > 0 && (
        <List size="sm" spacing={4} aria-label="Changes not shown as lines">
          {view.notes.map((note) => (
            <List.Item key={note}>{note}</List.Item>
          ))}
        </List>
      )}

      {view.sections.map((section) => (
        <Stack key={`${view.currentRevision}-${section.part}`} gap={6}>
          <Group gap="xs">
            <Text size="sm" fw={600}>
              {PART_TITLE[section.part]}
            </Text>
            <SectionCounts section={section} />
          </Group>
          {section.lines.some((line) => line.bookkeeping) && (
            <Text size="xs" c="dimmed">
              Dimmed lines are bookkeeping, such as status and timestamps. Review does not count
              them.
            </Text>
          )}
          <DiffTable
            section={section}
            caption={`${PART_TITLE[section.part]}: your last review compared with now`}
          />
        </Stack>
      ))}
    </Stack>
  )
}

function UnreadableSnapshots({ view }: { view: ReviewChangesView }) {
  const count = view.unreadableSnapshots
  const files = `${count} review snapshot file${count === 1 ? '' : 's'}`
  return (
    <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />}>
      {files} for this could not be read and {count === 1 ? 'was' : 'were'} left as{' '}
      {count === 1 ? 'it is' : 'they are'}.{' '}
      {view.reviewedAt
        ? 'The comparison uses the most recent review that could be read.'
        : 'None of the review history could be read, so there is nothing to compare against.'}
    </Alert>
  )
}

function Outcome({ view }: { view: ReviewChangesView }) {
  const since = view.reviewedAt ? formatWhen(view.reviewedAt) : null

  switch (view.state) {
    case 'no_baseline':
      return (
        <Alert
          color="gray"
          variant="light"
          icon={<IconInfoCircle size={16} />}
          title="No review to compare against"
        >
          {view.unreadableSnapshots > 0
            ? 'Changes can only be shown from a review that can be read.'
            : 'This has not been marked reviewed yet, so there is no earlier version to show changes from. Read view shows all of it.'}
        </Alert>
      )
    case 'identical':
      return (
        <Text size="sm">
          No changes since your review on {since}. The file is exactly what you reviewed.
        </Text>
      )
    case 'too_large':
      return (
        <Alert
          color="yellow"
          variant="light"
          icon={<IconAlertTriangle size={16} />}
          title="Not compared line by line"
        >
          {view.tooLarge} Open the file in your own editor, or compare it with Git, to see the
          differences from your review on {since}.
        </Alert>
      )
    case 'changed':
      return (
        <Stack gap={4}>
          <Text size="sm">Your review on {since}, compared with the file as it is now.</Text>
          <Text size="sm" c="dimmed">
            {view.substantive === false
              ? 'Only formatting or bookkeeping such as status changed, so your review still stands.'
              : view.substantive === null
                ? 'Whether these edits count against your review could not be worked out: the frontmatter does not parse.'
                : 'These edits count against your review. Mark it reviewed again once you have read them.'}
          </Text>
        </Stack>
      )
  }
}

function SectionCounts({ section }: { section: ChangeSectionView }) {
  if (section.added === 0 && section.removed === 0) {
    return (
      <Badge size="xs" variant="default">
        Unchanged
      </Badge>
    )
  }
  return (
    <>
      <Badge size="xs" variant="light" color="teal">
        +{section.added} added
      </Badge>
      <Badge size="xs" variant="light" color="red">
        −{section.removed} removed
      </Badge>
    </>
  )
}
