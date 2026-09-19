import { ActionIcon, Button, CopyButton, Tooltip } from '@mantine/core'
import { IconCheck, IconPlugConnected } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { McpLaunchCommand } from '../../shared/contract.js'

/**
 * Copies the MCP configuration for one project folder. It is the one piece of
 * setup the user has to move into their AI client by hand, so it appears both in
 * the header of an open project and beside the setup of a new one.
 */

interface Props {
  rootPath: string
  /** Shows a labelled button instead of the compact icon. */
  label?: string
}

export function CopyMcpConfig({ rootPath, label }: Props) {
  const [launch, setLaunch] = useState<McpLaunchCommand | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.projectspace.mcpLaunchCommand(rootPath).then((command) => {
      if (!cancelled) setLaunch(command)
    })
    return () => {
      cancelled = true
    }
  }, [rootPath])

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
                : 'Copy this project’s MCP configuration for your AI client.'
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
