import { Badge, Button, Group, Stack, Text, Title, UnstyledButton } from '@mantine/core'
import { IconArrowLeft, IconExternalLink } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import type { PlanPhaseView, PlanTicketView, PlanView } from '../../shared/plans-contract.js'
import type { LinkRequest } from '../hooks/useLinkNavigation.js'
import { renderMarkdown } from '../markdown.js'
import { STATUS_COLOR, STATUS_LABEL } from '../theme.js'
import { MarkdownBody } from './MarkdownBody.js'
import { PlanProgress } from './PlanProgress.js'

/**
 * One plan: its prose, then its phases in order with the tickets each holds.
 * Tickets open in the usual dialog. The plan is read-only here; changes are
 * made through an AI client or in the plan's own file.
 */

interface Props {
  rootPath: string
  plan: PlanView
  onOpenTicket: (id: string) => void
  onFollowLink: (request: LinkRequest) => Promise<string | null>
  /** Shown on a narrow window, where the list and the plan take turns. */
  onBack?: () => void
}

function TicketRow({ ticket, onOpen }: { ticket: PlanTicketView; onOpen: (id: string) => void }) {
  if (ticket.problem || ticket.status === null) {
    return (
      <li className="ps-plan-ticket" data-problem>
        <Text size="sm" c="red">
          {ticket.problem === 'unreadable'
            ? 'A ticket file here could not be read'
            : 'No ticket with this id in the project'}
        </Text>
        <Text size="xs" ff="monospace" c="var(--ps-text-muted)">
          {ticket.id}
        </Text>
      </li>
    )
  }
  return (
    <li className="ps-plan-ticket">
      <UnstyledButton className="ps-plan-ticket-button" onClick={() => onOpen(ticket.id)}>
        <Text size="sm" style={{ minWidth: 0 }}>
          {ticket.title}
        </Text>
        <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
          {ticket.archived && (
            <Badge size="xs" variant="outline" color="gray">
              Archived
            </Badge>
          )}
          <Badge size="xs" variant="light" color={STATUS_COLOR[ticket.status]}>
            {STATUS_LABEL[ticket.status]}
          </Badge>
        </Group>
      </UnstyledButton>
    </li>
  )
}

function Phase({ phase, onOpen }: { phase: PlanPhaseView; onOpen: (id: string) => void }) {
  return (
    <section className="ps-plan-phase" aria-labelledby={`phase-${phase.id}`}>
      <Title order={3} id={`phase-${phase.id}`} size="h5">
        {phase.title}
      </Title>
      {phase.scope && <Text size="sm">{phase.scope}</Text>}
      {phase.value && (
        <Text size="sm" c="var(--ps-text-muted)">
          Why: {phase.value}
        </Text>
      )}
      <PlanProgress progress={phase.progress} label={`Phase ${phase.title}`} />
      {phase.tickets.length > 0 && (
        <ul className="ps-plan-tickets">
          {phase.tickets.map((ticket) => (
            <TicketRow key={ticket.id} ticket={ticket} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </section>
  )
}

export function PlanDetail({ rootPath, plan, onOpenTicket, onFollowLink, onBack }: Props) {
  const [failure, setFailure] = useState<string | null>(null)
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
        <Button
          size="xs"
          variant="default"
          leftSection={<IconExternalLink size={14} />}
          onClick={() => void openFile()}
        >
          Edit externally
        </Button>
      </div>

      <div className="ps-docs-body">
        <Stack gap="lg">
          {failure && (
            <Text size="sm" c="red" role="alert">
              {failure}
            </Text>
          )}
          <PlanProgress progress={plan.progress} label={`Plan ${plan.title}`} />
          <MarkdownBody html={rendered.html} onFollowLink={onFollowLink} />
          {plan.phases.length === 0 ? (
            <Text size="sm" c="var(--ps-text-muted)">
              No phases yet. Ask your AI tool to break this plan into phases, or add them to the
              plan file.
            </Text>
          ) : (
            plan.phases.map((phase) => <Phase key={phase.id} phase={phase} onOpen={onOpenTicket} />)
          )}
        </Stack>
      </div>
    </section>
  )
}
