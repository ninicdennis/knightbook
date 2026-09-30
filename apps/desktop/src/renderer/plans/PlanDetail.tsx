import { Button, Group, Stack, Text } from '@mantine/core'
import { IconArrowLeft, IconExternalLink, IconLayoutKanban, IconPlus } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import type { PhaseEdit, PlanView } from '../../shared/plans-contract.js'
import type { LinkRequest } from '../markdown/useLinkNavigation.js'
import { renderMarkdown } from '../markdown/markdown.js'
import { MarkdownBody } from '../markdown/MarkdownBody.js'
import {
  addPhase,
  attachTicket,
  detachTicket,
  movePhase,
  removePhase,
  renamePhase,
} from './phase-edits.js'
import { PlanPhase } from './PlanPhase.js'
import { PlanProgress } from './PlanProgress.js'
import { TitleDialog } from './TitleDialog.js'

/**
 * One plan: its prose, then its phases in order with the tickets each holds.
 * Tickets open in the usual dialog. Phases and their tickets are edited here
 * (ticket c17fc047); the plan's Markdown body is edited externally.
 */

interface Props {
  rootPath: string
  plan: PlanView
  onOpenTicket: (id: string) => void
  onFollowLink: (request: LinkRequest) => Promise<string | null>
  /** Opens the board narrowed to this plan (D-035). */
  onViewOnBoard: (planId: string) => void
  /** Shown on a narrow window, where the list and the plan take turns. */
  onBack?: () => void
  /** The board's active tickets, which are what a phase can attach. */
  tickets: readonly { id: string; title: string }[]
  busy: boolean
  /** Writes the plan's whole phase list at the revision this plan was read at. */
  onSavePhases: (phases: PhaseEdit[]) => void
}

export function PlanDetail({
  rootPath,
  plan,
  onOpenTicket,
  onFollowLink,
  onViewOnBoard,
  onBack,
  tickets,
  busy,
  onSavePhases,
}: Props) {
  const [failure, setFailure] = useState<string | null>(null)
  const [addingPhase, setAddingPhase] = useState(false)
  const { phases } = plan
  const rendered = useMemo(() => renderMarkdown(plan.body, plan.file), [plan.body, plan.file])

  async function openFile() {
    setFailure(null)
    const result = await window.knightbook.openPlanExternally(rootPath, plan.id)
    if (!result.ok) setFailure(result.message)
  }

  return (
    <section className="ps-docs-reader" aria-labelledby="plan-title">
      <div className="ps-docs-toolbar">
        <div className="ps-docs-toolbar-identity">
          {onBack && (
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              leftSection={<IconArrowLeft size={14} />}
              onClick={onBack}
            >
              All plans
            </Button>
          )}
          <Stack gap={2} style={{ minWidth: 0 }}>
            <h2 id="plan-title" className="ps-docs-title">
              {plan.title}
            </h2>
            <span className="ps-docs-reader-path">{plan.file}</span>
          </Stack>
        </div>
        <Group gap="xs" wrap="nowrap">
          <Button
            size="xs"
            variant="default"
            leftSection={<IconLayoutKanban size={14} />}
            onClick={() => onViewOnBoard(plan.id)}
          >
            View on board
          </Button>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconExternalLink size={14} />}
            onClick={() => void openFile()}
          >
            Edit externally
          </Button>
        </Group>
      </div>

      <div className="ps-docs-body">
        <Stack gap="lg">
          {failure && (
            <Text size="sm" c="red" role="alert">
              {failure}
            </Text>
          )}
          <PlanProgress progress={plan.progress} label={`Plan ${plan.title}`} />
          <MarkdownBody html={rendered.html} rootPath={rootPath} onFollowLink={onFollowLink} />
          {phases.length === 0 && (
            <Text size="sm" c="var(--ps-text-muted)">
              No phases yet. Add one below, or ask your AI tool to break this plan into phases.
            </Text>
          )}
          {phases.map((phase, index) => (
            <PlanPhase
              key={phase.id}
              phase={phase}
              onOpen={onOpenTicket}
              edit={{
                busy,
                tickets,
                isFirst: index === 0,
                isLast: index === phases.length - 1,
                onRename: (title) => onSavePhases(renamePhase(phases, phase.id, title)),
                onMove: (direction) => {
                  const moved = movePhase(phases, phase.id, direction)
                  if (moved) onSavePhases(moved)
                },
                onRemove: () => onSavePhases(removePhase(phases, phase.id)),
                onAttach: (ticketId) => onSavePhases(attachTicket(phases, phase.id, ticketId)),
                onDetach: (ticketId) => onSavePhases(detachTicket(phases, phase.id, ticketId)),
              }}
            />
          ))}
          <Button
            size="xs"
            variant="default"
            leftSection={<IconPlus size={14} />}
            disabled={busy}
            onClick={() => setAddingPhase(true)}
            style={{ alignSelf: 'flex-start' }}
          >
            Add phase
          </Button>
        </Stack>
        {addingPhase && (
          <TitleDialog
            heading="Add a phase"
            label="Phase title"
            action="Add phase"
            onClose={() => setAddingPhase(false)}
            onSubmit={(title) => {
              setAddingPhase(false)
              onSavePhases(addPhase(phases, title))
            }}
          />
        )}
      </div>
    </section>
  )
}
