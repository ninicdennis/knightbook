import { Badge, Button, Group, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import type {
  InstalledSkillState,
  SkillTargetId,
  SkillTargetView,
} from '../../shared/skill-setup-contract.js'

/**
 * One place a client reads skills from, what is there now, and the one action
 * that is safe for that state. A folder that differs and is not provably an old
 * Knightbook install gets no button at all: the app never overwrites it.
 */

const BADGES: Record<InstalledSkillState, { label: string; color: string }> = {
  absent: { label: 'Not installed', color: 'gray' },
  matching: { label: 'Up to date', color: 'teal' },
  outdated: { label: 'Older version', color: 'yellow' },
  modified: { label: 'Changed here', color: 'orange' },
}

const SCOPE = {
  personal: 'Personal — every project on this computer',
  project: 'This project — written into the checkout, so Git will see it',
}

interface Props {
  target: SkillTargetView
  busy: boolean
  onInstall: (target: SkillTargetId, expected: 'absent' | 'outdated') => void
}

export function SkillTargetRow({ target, busy, onInstall }: Props) {
  const [confirmingUpdate, setConfirmingUpdate] = useState(false)
  const badge = BADGES[target.state]

  return (
    <Stack gap={4} py={6} style={{ borderTop: '1px solid var(--ps-hairline)' }}>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <div style={{ minWidth: 0 }}>
          <Text size="sm" fw={600}>
            {target.client}
          </Text>
          <Text size="xs" c="var(--ps-text-muted)">
            {SCOPE[target.scope]}
          </Text>
        </div>
        <Badge size="sm" variant="light" color={badge.color} style={{ flexShrink: 0 }}>
          {badge.label}
        </Badge>
      </Group>

      <Text size="xs" ff="monospace" style={{ wordBreak: 'break-all' }}>
        {target.path}
      </Text>

      {target.state === 'absent' && (
        <Group>
          <Button
            size="xs"
            variant="default"
            loading={busy}
            onClick={() => onInstall(target.id, 'absent')}
            aria-label={`Install for ${target.client}, ${target.scope}`}
          >
            Install
          </Button>
        </Group>
      )}

      {target.state === 'outdated' &&
        (confirmingUpdate ? (
          <Stack gap={4}>
            <Text size="xs">
              This copy is unchanged since Knightbook installed it, so replacing it loses nothing of
              yours.
            </Text>
            <Group gap="xs">
              <Button
                size="xs"
                loading={busy}
                onClick={() => {
                  setConfirmingUpdate(false)
                  onInstall(target.id, 'outdated')
                }}
              >
                Replace with this version
              </Button>
              <Button size="xs" variant="subtle" onClick={() => setConfirmingUpdate(false)}>
                Keep the older one
              </Button>
            </Group>
          </Stack>
        ) : (
          <Group>
            <Button
              size="xs"
              variant="default"
              onClick={() => setConfirmingUpdate(true)}
              aria-label={`Update for ${target.client}, ${target.scope}`}
            >
              Update
            </Button>
          </Group>
        ))}

      {target.state === 'modified' && (
        <Text size="xs" c="var(--ps-text-muted)">
          This differs from the version that ships with the app, and Knightbook cannot tell whether
          it holds your own edits, so it will not overwrite it. Export a copy to compare, or move
          this folder aside to install fresh.
        </Text>
      )}
    </Stack>
  )
}
