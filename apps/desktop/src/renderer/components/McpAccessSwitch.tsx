import { Stack, Switch, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import type { McpAccessView } from '../../shared/contract.js'

/**
 * The per-project "Allow AI access through MCP" setting.
 *
 * The description says plainly what turning it on means, because the shared
 * connection's reach is easy to underestimate: an AI client using it can read
 * and change every project allowed here, not only the one on screen. Nothing
 * else — opening the project, or its being in recent projects — turns it on.
 */

interface Props {
  checkoutPath: string
  access: McpAccessView
  /** Told the stored result, so the panel around it can stop describing the old one. */
  onChange: (access: McpAccessView) => void
}

export function McpAccessSwitch({ checkoutPath, access, onChange }: Props) {
  const [enabled, setEnabled] = useState(access.enabled)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setEnabled(access.enabled), [access.enabled])

  const change = async (next: boolean): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      const result = await window.knightbook.setMcpAccess(checkoutPath, next)
      if (result.ok) {
        setEnabled(result.value.enabled)
        onChange(result.value)
      } else {
        setError(result.message)
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack gap={4}>
      <Switch
        size="sm"
        checked={enabled}
        disabled={saving}
        onChange={(event) => void change(event.currentTarget.checked)}
        label="Allow AI access through MCP"
        description={
          'Any AI client using the shared Knightbook connection can read and change every ' +
          'project with this on, not only this one.'
        }
      />
      {access.problem !== null && (
        <Text size="xs" c="orange">
          The list of allowed projects could not be read, so no project is reachable right now.
        </Text>
      )}
      {error !== null && (
        <Text size="xs" c="red" role="alert">
          Not changed: {error}
        </Text>
      )}
    </Stack>
  )
}
