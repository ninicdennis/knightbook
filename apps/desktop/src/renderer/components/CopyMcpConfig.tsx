import { ActionIcon, Button, CopyButton, Tooltip } from '@mantine/core'
import { IconCheck, IconPlugConnected } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { McpLaunchCommand } from '../../shared/contract.js'

/**
 * Copies the shared MCP configuration. It is the one piece of setup the user
 * moves into their AI client by hand, and they do it once: it names the list of
 * allowed projects rather than any project, so it is the same whichever project
 * it is copied from.
 */

interface Props {
  /** Shows a labelled button instead of the compact icon. */
  label?: string
}

export function CopyMcpConfig({ label }: Props) {
  const [launch, setLaunch] = useState<McpLaunchCommand | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.knightbook.mcpLaunchCommand().then((command) => {
      if (!cancelled) setLaunch(command)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!launch) return null
  const configJson = JSON.stringify({ command: launch.command, args: launch.args }, null, 2)

  return (
    <CopyButton value={configJson} timeout={2000}>
      {({ copied, copy }) =>
        label ? (
          <Button
            variant="default"
            size="xs"
            leftSection={copied ? <IconCheck size={14} /> : <IconPlugConnected size={14} />}
            onClick={copy}
          >
            {copied ? 'Copied' : label}
          </Button>
        ) : (
          <Tooltip
            multiline
            w={320}
            withArrow
            label={
              copied
                ? 'Copied. Paste it into your AI client config.'
                : 'Copy the MCP configuration for your AI client. It covers every project you allow.'
            }
          >
            <ActionIcon
              variant="default"
              size="lg"
              onClick={copy}
              aria-label="Copy MCP configuration"
            >
              {copied ? <IconCheck size={18} /> : <IconPlugConnected size={18} />}
            </ActionIcon>
          </Tooltip>
        )
      }
    </CopyButton>
  )
}
