import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  Select,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core'
import {
  IconArrowDown,
  IconArrowUp,
  IconDots,
  IconPencil,
  IconTrash,
  IconX,
} from '@tabler/icons-react'
import { useState } from 'react'
import type { PlanPhaseView, PlanTicketView } from '../../shared/plans-contract.js'
import { STATUS_COLOR, STATUS_LABEL } from '../theme/theme.js'
import { PlanProgress } from './PlanProgress.js'
import { TitleDialog } from './TitleDialog.js'

/**
 * One phase of a plan and the tickets it holds, with the controls that change
 * it. Every control names its phase or ticket, so each is distinct to a screen
 * reader, and every one is a button or a native field Tab reaches.
 */

export interface PhaseEditing {
  busy: boolean
  /** The board's active tickets, which are what can be attached. */
  tickets: readonly { id: string; title: string }[]
  isFirst: boolean
  isLast: boolean
  onRename: (title: string) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
  onAttach: (ticketId: string) => void
  onDetach: (ticketId: string) => void
}

function ticketName(ticket: PlanTicketView): string {
  return ticket.title ?? `ticket ${ticket.id}`
}

function TicketRow({
  ticket,
  phaseTitle,
  onOpen,
  edit,
}: {
  ticket: PlanTicketView
  phaseTitle: string
  onOpen: (id: string) => void
  edit: PhaseEditing
}) {
  const detach = (
    <ActionIcon
      variant="subtle"
      color="gray"
      size="sm"
      disabled={edit.busy}
      aria-label={`Detach ${ticketName(ticket)} from ${phaseTitle}`}
      onClick={() => edit.onDetach(ticket.id)}
    >
      <IconX size={14} />
    </ActionIcon>
  )

  if (ticket.problem || ticket.status === null) {
    return (
      <li className="ps-plan-ticket" data-problem>
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Text size="sm" c="red">
              {ticket.problem === 'unreadable'
                ? 'A ticket file here could not be read'
                : 'No ticket with this id in the project'}
            </Text>
            <Text size="xs" ff="monospace" c="var(--ps-text-muted)">
              {ticket.id}
            </Text>
          </Stack>
          {detach}
        </Group>
      </li>
    )
  }
  return (
    <li className="ps-plan-ticket ps-plan-ticket-row">
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
      {detach}
    </li>
  )
}

function PhaseMenu({ phase, edit }: { phase: PlanPhaseView; edit: PhaseEditing }) {
  const [renaming, setRenaming] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const count = phase.tickets.length

  return (
    <>
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            disabled={edit.busy}
            aria-label={`Actions for phase ${phase.title}`}
          >
            <IconDots size={14} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setRenaming(true)}>
            Rename…
          </Menu.Item>
          {!edit.isFirst && (
            <Menu.Item leftSection={<IconArrowUp size={14} />} onClick={() => edit.onMove(-1)}>
              Move up
            </Menu.Item>
          )}
          {!edit.isLast && (
            <Menu.Item leftSection={<IconArrowDown size={14} />} onClick={() => edit.onMove(1)}>
              Move down
            </Menu.Item>
          )}
          <Menu.Divider />
          <Menu.Item
            color="red"
            leftSection={<IconTrash size={14} />}
            // An empty phase holds nothing to lose, so it goes without asking.
            onClick={() => (count === 0 ? edit.onRemove() : setConfirmingRemove(true))}
          >
            Remove phase…
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      {renaming && (
        <TitleDialog
          heading="Rename phase"
          label="Phase title"
          action="Rename"
          initial={phase.title}
          onClose={() => setRenaming(false)}
          onSubmit={(title) => {
            setRenaming(false)
            edit.onRename(title)
          }}
        />
      )}

      <Modal
        opened={confirmingRemove}
        onClose={() => setConfirmingRemove(false)}
        title={`Remove phase ${phase.title}?`}
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            {count === 1 ? 'Its 1 ticket is' : `Its ${count} tickets are`} detached from this plan.
            The tickets themselves are not changed: status, dependencies and backlog order stay as
            they are.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={() => setConfirmingRemove(false)}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={() => {
                setConfirmingRemove(false)
                edit.onRemove()
              }}
            >
              Remove phase
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}

export function PlanPhase({
  phase,
  onOpen,
  edit,
}: {
  phase: PlanPhaseView
  onOpen: (id: string) => void
  edit: PhaseEditing
}) {
  const attached = new Set(phase.tickets.map((ticket) => ticket.id))
  const attachable = edit.tickets
    .filter((ticket) => !attached.has(ticket.id))
    .map((ticket) => ({ value: ticket.id, label: ticket.title }))

  return (
    <section className="ps-plan-phase" aria-labelledby={`phase-${phase.id}`}>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Title order={3} id={`phase-${phase.id}`} size="h5">
          {phase.title}
        </Title>
        <PhaseMenu phase={phase} edit={edit} />
      </Group>
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
            <TicketRow
              key={ticket.id}
              ticket={ticket}
              phaseTitle={phase.title}
              onOpen={onOpen}
              edit={edit}
            />
          ))}
        </ul>
      )}
      <Select
        size="xs"
        placeholder={
          attachable.length === 0 ? 'Every board ticket is attached' : 'Attach a ticket…'
        }
        aria-label={`Attach a ticket to ${phase.title}`}
        data={attachable}
        value={null}
        onChange={(ticketId) => ticketId && edit.onAttach(ticketId)}
        searchable
        disabled={edit.busy || attachable.length === 0}
        nothingFoundMessage="No board ticket matches"
        comboboxProps={{ withinPortal: true }}
        maw={360}
      />
    </section>
  )
}
