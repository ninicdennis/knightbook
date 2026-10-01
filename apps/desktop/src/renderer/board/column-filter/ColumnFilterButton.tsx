import { ActionIcon, Button, Checkbox, Popover, Stack, Tooltip } from '@mantine/core'
import { IconFilter } from '@tabler/icons-react'
import type { ReviewState, TicketStatus } from '../../../shared/contract.js'
import { STATUS_LABEL } from '../../theme/theme.js'
import { TICKET_TYPE_LABEL } from '../../tickets/ticket-types.js'
import {
  CONDITION_LABEL,
  conditionOptions,
  isFiltered,
  REVIEW_LABEL,
  REVIEW_OPTIONS,
  TYPE_OPTIONS,
  type ColumnFilter,
  type ConditionOption,
  type TypeOption,
} from './column-filter.js'

/**
 * The filter control in a column's heading. Checkbox groups rather than a custom
 * menu, so every option is a native checkbox that Tab and Space reach, and each
 * group is announced with its name.
 */

interface Props {
  status: TicketStatus
  filter: ColumnFilter
  onChange: (filter: ColumnFilter) => void
}

const typeLabel = (option: TypeOption) =>
  option === 'untyped' ? 'Untyped' : TICKET_TYPE_LABEL[option]

export function ColumnFilterButton({ status, filter, onChange }: Props) {
  const active = isFiltered(filter)
  const column = STATUS_LABEL[status]

  return (
    <Popover position="bottom-end" withinPortal trapFocus shadow="md" width={250}>
      <Popover.Target>
        <Tooltip label={active ? 'Filtered' : 'Filter'} withinPortal>
          <ActionIcon
            variant={active ? 'light' : 'subtle'}
            color={active ? 'accent' : 'gray'}
            size="sm"
            aria-label={`Filter the ${column} column${active ? ' (filtered)' : ''}`}
          >
            <IconFilter size={14} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm">
          <Checkbox.Group
            label="Type"
            value={filter.types}
            onChange={(types) => onChange({ ...filter, types: types as TypeOption[] })}
          >
            <Stack gap={6} mt={6}>
              {TYPE_OPTIONS.map((option) => (
                <Checkbox key={option} size="xs" value={option} label={typeLabel(option)} />
              ))}
            </Stack>
          </Checkbox.Group>
          <Checkbox.Group
            label="Condition"
            value={filter.conditions}
            onChange={(conditions) =>
              onChange({ ...filter, conditions: conditions as ConditionOption[] })
            }
          >
            <Stack gap={6} mt={6}>
              {conditionOptions(status).map((option) => (
                <Checkbox key={option} size="xs" value={option} label={CONDITION_LABEL[option]} />
              ))}
            </Stack>
          </Checkbox.Group>
          <Checkbox.Group
            label="Review"
            value={filter.review}
            onChange={(review) => onChange({ ...filter, review: review as ReviewState[] })}
          >
            <Stack gap={6} mt={6}>
              {REVIEW_OPTIONS.map((option) => (
                <Checkbox key={option} size="xs" value={option} label={REVIEW_LABEL[option]} />
              ))}
            </Stack>
          </Checkbox.Group>
          <Button
            size="compact-xs"
            variant="subtle"
            disabled={!active}
            onClick={() => onChange({ types: [], conditions: [], review: [] })}
          >
            Clear filter
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
