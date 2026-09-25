import { Button, Menu, Stack, Text } from '@mantine/core'
import { IconCheck, IconChevronDown, IconPlugConnected } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { mcpClientSnippets, type McpClientSnippet } from '../../shared/mcp-client-config.js'
import type { McpLaunchCommand } from '../../shared/contract.js'

/**
 * Copies the shared MCP configuration, wrapped for the AI client the user
 * picks. It is the one piece of setup they move into their client by hand, and
 * they do it once: it names the list of allowed projects rather than any
 * project, so it is the same whichever project it is copied from.
 *
 * After copying, the line below the button says where that snippet goes, and
 * stays there: the user reads it while switching to their client's config file.
 */

interface Props {
  label: string
}

type CopyOutcome =
  { kind: 'copied'; snippet: McpClientSnippet } | { kind: 'failed'; snippet: McpClientSnippet }

export function CopyMcpConfig({ label }: Props) {
  const [launch, setLaunch] = useState<McpLaunchCommand | null>(null)
  const [outcome, setOutcome] = useState<CopyOutcome | null>(null)

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

  const copy = (snippet: McpClientSnippet): void => {
    navigator.clipboard.writeText(snippet.text).then(
      () => setOutcome({ kind: 'copied', snippet }),
      () => setOutcome({ kind: 'failed', snippet }),
    )
  }

  return (
    <Stack gap={6} align="flex-start">
      <Menu position="bottom-start" withinPortal width={340}>
        <Menu.Target>
          <Button
            variant="default"
            size="xs"
            leftSection={
              outcome?.kind === 'copied' ? <IconCheck size={14} /> : <IconPlugConnected size={14} />
            }
            rightSection={<IconChevronDown size={14} />}
          >
            {label}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Copy it for</Menu.Label>
          {mcpClientSnippets(launch).map((snippet) => (
            <Menu.Item key={snippet.client} onClick={() => copy(snippet)}>
              {snippet.label}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>

      <div aria-live="polite">
        {outcome?.kind === 'copied' && (
          <Text size="xs" c="var(--ps-text-muted)" maw={460}>
            Copied for {outcome.snippet.label}. Paste it into {outcome.snippet.where}
          </Text>
        )}
        {outcome?.kind === 'failed' && (
          <Text size="xs" c="var(--mantine-color-red-text)" maw={460}>
            Could not copy to the clipboard, so nothing was copied for {outcome.snippet.label}. Try
            again.
          </Text>
        )}
      </div>
    </Stack>
  )
}
