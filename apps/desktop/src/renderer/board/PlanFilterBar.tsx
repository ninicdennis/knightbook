import { Button, Group, Select, Text } from '@mantine/core'
import type { BoardPlanView } from '../../shared/contract.js'
import { decodePlanFilter, encodePlanFilter, type PlanFilter } from './usePlanFilter.js'

/**
 * The board's plan selector and, while it narrows the board, what it hides.
 *
 * A filtered board must never look like a board with fewer tickets, so the
 * summary says how many of the active tickets are showing and offers the way
 * back in one click.
 */

interface Props {
  plans: readonly BoardPlanView[]
  filter: PlanFilter
  onChange: (filter: PlanFilter) => void
  matching: number
  total: number
}

export function PlanFilterBar({ plans, filter, onChange, matching, total }: Props) {
  const data = [
    { value: 'all', label: 'All tickets' },
    ...plans.map((plan) => ({
      value: encodePlanFilter({ kind: 'plan', id: plan.id }),
      label: plan.title,
    })),
    { value: 'none', label: 'No plan' },
  ]
  const selectedTitle =
    filter.kind === 'plan' ? (plans.find((plan) => plan.id === filter.id)?.title ?? '') : ''

  return (
    <Group gap="sm" wrap="wrap" align="center">
      <Select
        label="Plan"
        size="xs"
        data={data}
        value={encodePlanFilter(filter)}
        onChange={(value) => onChange(decodePlanFilter(value))}
        allowDeselect={false}
        comboboxProps={{ withinPortal: true }}
        w={220}
        styles={{ root: { display: 'flex', alignItems: 'center', gap: 8 }, label: { margin: 0 } }}
      />
      {filter.kind !== 'all' && (
        <Group gap="xs" wrap="nowrap" aria-live="polite">
          <Text size="sm" c="var(--ps-text-muted)">
            {matching === 0
              ? filter.kind === 'plan'
                ? `No active tickets in ${selectedTitle}.`
                : 'Every active ticket is in a plan.'
              : `Showing ${matching} of ${total} active tickets${
                  filter.kind === 'plan' ? ` in ${selectedTitle}` : ' with no plan'
                }.`}
          </Text>
          <Button size="compact-xs" variant="subtle" onClick={() => onChange({ kind: 'all' })}>
            Show all tickets
          </Button>
        </Group>
      )}
    </Group>
  )
}
