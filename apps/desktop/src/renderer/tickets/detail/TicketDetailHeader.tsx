import { Badge, Group, Modal, Stack } from '@mantine/core'
import type { TicketView } from '../../../shared/contract.js'
import { STATUS_COLOR, STATUS_LABEL } from '../../theme/theme.js'
import { BackToSource, type BackTarget } from '../../markdown/BackToSource.js'
import { ReviewBadge } from '../../review/ReviewBadge.js'
import { TicketRecordRow } from './TicketRecordRow.js'
import { TicketTypeBadge } from '../TicketTypeBadge.js'

/** The ticket dialog's fixed header: the way back, the title, and its badges. */
export function TicketDetailHeader({
  ticket,
  isNext,
  back,
  rootPath,
}: {
  ticket: TicketView
  isNext: boolean
  back: BackTarget | null
  rootPath: string
}) {
  return (
    <Modal.Header
      style={{
        alignItems: 'flex-start',
        borderBottom: '1px solid var(--ps-hairline)',
      }}
    >
      <Stack gap={8} style={{ flex: 1, minWidth: 0 }}>
        <BackToSource back={back} />
        <Modal.Title
          style={{ fontSize: 'var(--mantine-font-size-xl)', fontWeight: 600, lineHeight: 1.3 }}
        >
          {ticket.title}
        </Modal.Title>
        {/* Secondary to the title, and never allowed to push Close aside. */}
        <Group gap="xs" wrap="wrap">
          <Badge size="sm" variant="light" color={STATUS_COLOR[ticket.status]}>
            {STATUS_LABEL[ticket.status]}
          </Badge>
          <TicketTypeBadge type={ticket.type} />
          {isNext && (
            <Badge size="sm" variant="light" color="accent">
              Next up
            </Badge>
          )}
          <ReviewBadge review={ticket.review} />
        </Group>
        <TicketRecordRow rootPath={rootPath} ticketId={ticket.id} />
      </Stack>
      <Modal.CloseButton aria-label="Close" style={{ flexShrink: 0 }} />
    </Modal.Header>
  )
}
