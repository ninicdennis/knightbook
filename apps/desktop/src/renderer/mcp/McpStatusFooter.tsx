import { Group, Loader, Popover, Text, UnstyledButton } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useState } from 'react'
import { useMcpStatus } from './useMcpStatus.js'
import { describeMcpStatus } from './mcp-status.js'
import { AiSetupDialog } from './AiSetupDialog.js'
import { McpStatusDetails } from './McpStatusDetails.js'
import { McpStatusDot } from './McpStatusDot.js'

/**
 * The status bar along the bottom of an open project. It answers one question at
 * a glance — can an AI client reach this project right now — and opens the
 * details and connection actions behind it.
 *
 * It lives in the footer rather than the header so the header stays free for
 * project identity and navigation, and so every view gets the same answer in the
 * same place.
 */

export function McpStatusFooter({ checkoutPath }: { checkoutPath: string }) {
  const status = useMcpStatus(checkoutPath)
  const [open, panel] = useDisclosure(false)
  // Held here, not in the panel: the popover closes when the dialog opens.
  const [setupOpen, setup] = useDisclosure(false)
  // Frozen while the panel is open so wording does not shift under the reader's
  // eyes mid-sentence. Polling continues; the next close picks it up.
  const [frozen, setFrozen] = useState<typeof status>(null)

  const shown = open ? (frozen ?? status) : status

  if (!shown) {
    return (
      <Group gap="xs" h="100%" px="xs" wrap="nowrap">
        <Loader size={12} />
        <Text size="xs" c="var(--ps-text-muted)">
          Checking MCP status…
        </Text>
      </Group>
    )
  }

  const display = describeMcpStatus(shown)

  return (
    <Group h="100%" px="xs" wrap="nowrap" gap="xs">
      <Popover
        opened={open}
        onChange={(next) => {
          if (next) setFrozen(status)
          panel.toggle()
        }}
        position="top-start"
        withArrow
        shadow="md"
        width={380}
        // The fixed width is wider than a narrow window, so it has to give way.
        styles={{ dropdown: { maxWidth: 'calc(100vw - 16px)' } }}
      >
        <Popover.Target>
          <UnstyledButton
            onClick={() => {
              if (!open) setFrozen(status)
              panel.toggle()
            }}
            aria-label={`${display.label}. ${display.summary}`}
            aria-expanded={open}
            style={{ minWidth: 0, borderRadius: 4, padding: '2px 4px' }}
          >
            <Group gap={6} wrap="nowrap">
              <McpStatusDot state={display.state} />
              <Text size="xs" fw={500} style={{ whiteSpace: 'nowrap' }}>
                {display.label}
              </Text>
              <Text size="xs" c="var(--ps-text-muted)" visibleFrom="sm">
                Details
              </Text>
            </Group>
          </UnstyledButton>
        </Popover.Target>

        <Popover.Dropdown>
          <McpStatusDetails
            status={shown}
            display={display}
            checkoutPath={checkoutPath}
            // The panel holds a frozen reading; the user's own change is a fact
            // it should show at once rather than after the panel is reopened.
            onAccessChange={(access) => setFrozen((reading) => reading && { ...reading, access })}
            onSetUp={() => {
              panel.close()
              setup.open()
            }}
          />
        </Popover.Dropdown>
      </Popover>
      <AiSetupDialog opened={setupOpen} onClose={setup.close} checkoutPath={checkoutPath} />
    </Group>
  )
}
