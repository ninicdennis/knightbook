import { ActionIcon, Button, Group, Menu, Tooltip } from '@mantine/core'
import {
  IconArrowsExchange,
  IconCheck,
  IconEye,
  IconRotateClockwise,
  IconTag,
  IconThumbDown,
  IconUserCheck,
} from '@tabler/icons-react'
import { useState, type ReactNode } from 'react'
import type { MovableStatus, TicketType, TicketView } from '../../shared/contract.js'
import { STATUS_LABEL } from '../theme.js'
import { TICKET_TYPES, TICKET_TYPE_EMOJI, TICKET_TYPE_LABEL } from '../ticket-types.js'

/**
 * The ticket's action bar. It sits in its own row at the foot of the dialog,
 * outside the scrolling reading area, so a long ticket never hides its own
 * controls.
 *
 * Two things are kept apart on purpose. Changing a ticket's place or its type is
 * bookkeeping anyone can undo, so those are quiet controls on the left. Review
 * and acceptance are decisions only the user can make (D-003, D-015), so they
 * are grouped on the right, and recording a review is separated from accepting
 * the work: having read something is not the same as accepting it.
 *
 * Only the two decisions keep their words. The dialog is capped at a readable
 * width, so five full labels wrap onto a second row even in a wide window; the
 * bookkeeping controls are shown as their icons, named by tooltip and by
 * accessible name. Words stay where being sure matters more than space.
 */

const MOVABLE: MovableStatus[] = ['backlog', 'in_progress', 'verification']
/** Matches the height of the `sm` buttons beside them. */
const ICON_SIZE = 36

interface Props {
  ticket: TicketView
  onMove: (status: MovableStatus) => void
  /** Null clears the type. Untyped is a real answer, not a missing one. */
  onSetType: (type: TicketType | null) => void
  onComplete: () => void
  onReportIssue: () => void
  onResolveIssue: () => void
  onReview: () => void
  /** False while the content to be reviewed is still loading, so it cannot be approved unseen. */
  canReview?: boolean
}

export function TicketDetailActions({
  ticket,
  onMove,
  onSetType,
  onComplete,
  onReportIssue,
  onResolveIssue,
  onReview,
  canReview = true,
}: Props) {
  const inVerification = ticket.status === 'verification'
  /*
   * Both menus are controlled only so their buttons can say whether they are
   * open. See MenuIconTarget for why that cannot come from Mantine here.
   */
  const [moveOpen, setMoveOpen] = useState(false)
  const [typeOpen, setTypeOpen] = useState(false)

  return (
    /*
     * Every row here wraps. At a small window or at 200% text size the actions
     * stack onto further lines instead of running off the side of the dialog,
     * and the reading area above shrinks to make room.
     */
    <Group justify="space-between" wrap="wrap" gap="sm">
      <Group gap="xs" wrap="wrap">
        <Menu position="top-start" withinPortal opened={moveOpen} onChange={setMoveOpen}>
          <MenuIconTarget
            label="Move to"
            opened={moveOpen}
            icon={<IconArrowsExchange size={18} />}
          />
          <Menu.Dropdown>
            <Menu.Label>Move to</Menu.Label>
            {MOVABLE.filter((status) => status !== ticket.status).map((status) => (
              <Menu.Item key={status} onClick={() => onMove(status)}>
                {STATUS_LABEL[status]}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>

        <Menu position="top-start" withinPortal opened={typeOpen} onChange={setTypeOpen}>
          <MenuIconTarget label="Type" opened={typeOpen} icon={<IconTag size={18} />} />
          <Menu.Dropdown>
            <Menu.Label>Kind of work</Menu.Label>
            {TICKET_TYPES.map((type) => (
              <TypeChoice
                key={type}
                label={`${TICKET_TYPE_EMOJI[type]} ${TICKET_TYPE_LABEL[type]}`}
                current={ticket.type === type}
                onChoose={() => onSetType(type)}
              />
            ))}
            <Menu.Divider />
            {/* Clearing is a choice in the same list, not a hidden gesture. */}
            <TypeChoice
              label="No type"
              current={ticket.type === null}
              onChoose={() => onSetType(null)}
            />
          </Menu.Dropdown>
        </Menu>
      </Group>

      <Group gap="lg" wrap="wrap" justify="flex-end">
        {ticket.review.state !== 'reviewed' && (
          <IconAction
            label={
              ticket.review.state === 'changed_since_review'
                ? 'Mark reviewed again'
                : 'Mark content reviewed'
            }
            icon={<IconEye size={18} />}
            onClick={onReview}
            disabled={!canReview}
          />
        )}

        {(ticket.verificationIssue || inVerification) && (
          <Group gap="xs" wrap="wrap" justify="flex-end">
            {ticket.verificationIssue && (
              <IconAction
                label="Resolve the verification issue"
                icon={<IconRotateClockwise size={18} />}
                onClick={onResolveIssue}
              />
            )}
            {/*
             * These two keep their words. Both record a decision about whether
             * the work is acceptable, and an icon alone is not worth the risk of
             * one being pressed for the other.
             */}
            {inVerification && !ticket.verificationIssue && (
              <Button
                variant="default"
                color="orange"
                size="sm"
                leftSection={<IconThumbDown size={16} />}
                onClick={onReportIssue}
              >
                Did not pass…
              </Button>
            )}
            {inVerification && (
              <Button
                color="teal"
                size="sm"
                leftSection={<IconUserCheck size={16} />}
                onClick={onComplete}
              >
                Accept as done
              </Button>
            )}
          </Group>
        )}
      </Group>
    </Group>
  )
}

/** A bookkeeping control: the icon alone, named by tooltip and accessible name. */
function IconAction({
  label,
  icon,
  onClick,
  disabled = false,
}: {
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <Tooltip label={label} withArrow>
      <ActionIcon
        variant="default"
        size={ICON_SIZE}
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
      >
        {icon}
      </ActionIcon>
    </Tooltip>
  )
}

/**
 * The same control, opening a menu.
 *
 * `aria-haspopup` and `aria-expanded` are set by hand because Mantine's Tooltip
 * passes its child only the event handlers and the ref: the attributes the menu
 * would otherwise add land on the tooltip instead of on the button. That is also
 * the only reason the menus above are controlled.
 */
function MenuIconTarget({
  label,
  icon,
  opened,
}: {
  label: string
  icon: ReactNode
  opened: boolean
}) {
  return (
    <Menu.Target>
      <Tooltip label={label} withArrow>
        <ActionIcon
          variant="default"
          size={ICON_SIZE}
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={opened}
        >
          {icon}
        </ActionIcon>
      </Tooltip>
    </Menu.Target>
  )
}

/**
 * One option in the type list. Exactly one of them is the ticket's type at a
 * time, so the current one is marked with `aria-current` and a tick. The tick
 * means "this is the one selected", not "this work is finished" — which is why
 * no type uses a tick as its own symbol.
 */
function TypeChoice({
  label,
  current,
  onChoose,
}: {
  label: string
  current: boolean
  onChoose: () => void
}) {
  return (
    <Menu.Item
      aria-current={current}
      onClick={onChoose}
      rightSection={current ? <IconCheck size={14} aria-hidden="true" /> : null}
    >
      {label}
    </Menu.Item>
  )
}
