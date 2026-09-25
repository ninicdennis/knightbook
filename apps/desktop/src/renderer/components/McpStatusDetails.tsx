import { Button, Divider, Group, List, Stack, Text } from '@mantine/core'
import { IconSettingsAutomation } from '@tabler/icons-react'
import type { McpAccessView, McpStatusView } from '../../shared/contract.js'
import { describeActivity, describeAge, type McpDisplay } from '../mcp-status.js'
import { CopyMcpConfig } from './CopyMcpConfig.js'
import { McpAccessSwitch } from './McpAccessSwitch.js'

/**
 * What the indicator is actually based on, and the one action the user can take
 * about it.
 *
 * The observations are listed separately rather than summarized, because they
 * answer different questions and can disagree. A user debugging a client
 * that will not connect needs to know which of the three failed.
 *
 * There are no Start and Stop buttons here, and the panel says why. The AI
 * client launches the server over stdio and owns the pipes; a process this app
 * started would have no client on the other end, and stopping the client's own
 * process would break its connection from outside its knowledge. See
 * docs/project-workspace-technical-design.md.
 */

interface Props {
  status: McpStatusView
  display: McpDisplay
  checkoutPath: string
  onAccessChange: (access: McpAccessView) => void
  /** Opens the guided connection and skill setup. */
  onSetUp: () => void
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Text size="xs">
      <Text span c="dimmed">
        {label}:{' '}
      </Text>
      {value}
    </Text>
  )
}

function describeRuntime(status: McpStatusView): string {
  return status.runtimeAvailable
    ? 'Present — the copied configuration points at a server that exists.'
    : 'Not found where it should be installed.'
}

function describeAccess(status: McpStatusView): string {
  if (status.access.problem !== null)
    return 'Unknown — the list of allowed projects could not be read.'
  return status.access.enabled
    ? 'Allowed through the shared connection.'
    : 'Not allowed. The shared connection cannot reach this project.'
}

/** A shared client can reach every allowed project, so this never says it is using this one. */
function describeShared(status: McpStatusView): string {
  const connected = status.shared.filter((session) => session.connectedAt !== null).length
  if (connected > 0) {
    const clients = connected === 1 ? '1 client connected' : `${connected} clients connected`
    return `${clients}. It reaches every allowed project. ${describeActivity(status)}`
  }
  return status.shared.length > 0
    ? 'A server is running, but no client has connected yet.'
    : 'None observed.'
}

function describeProcess(status: McpStatusView): string {
  if (status.unobservable !== null) return 'Could not be checked.'
  if (status.live.length === 0) {
    return status.stale.length === 0
      ? 'None observed for this project.'
      : `None running. The last one was seen ${describeAge(status.stale[0]!.lastSeenAt)}.`
  }
  const count = status.live.length
  return `${count} running (process ${status.live.map((s) => s.pid).join(', ')}).`
}

function describeConnection(status: McpStatusView): string {
  if (status.unobservable !== null) return 'Could not be checked.'
  const connected = status.live.filter((session) => session.connectedAt !== null)
  if (connected.length === 0) {
    return status.live.length === 0
      ? 'No client connection observed.'
      : 'A server is running, but no client has opened a connection to it.'
  }
  return `Opened ${describeAge(connected[0]!.connectedAt!)}.`
}

export function McpStatusDetails({
  status,
  display,
  checkoutPath,
  onAccessChange,
  onSetUp,
}: Props) {
  return (
    <Stack gap="xs">
      <Text size="sm" fw={600}>
        {display.label}
      </Text>
      <Text size="xs" c="dimmed">
        {display.summary}
      </Text>

      <Divider />

      <Stack gap={4}>
        <Fact label="Bundled runtime" value={describeRuntime(status)} />
        <Fact label="AI access" value={describeAccess(status)} />
        <Fact label="Shared connection" value={describeShared(status)} />
        <Fact label="Server process (this project only)" value={describeProcess(status)} />
        <Fact label="Client connection (this project only)" value={describeConnection(status)} />
        <Text size="xs" c="dimmed" mt={2} style={{ wordBreak: 'break-all' }}>
          Observed {describeAge(status.observedAt)} for {checkoutPath}
        </Text>
      </Stack>

      {display.guidance.length > 0 && (
        <>
          <Divider />
          <List size="xs" spacing={4}>
            {display.guidance.map((line) => (
              <List.Item key={line}>{line}</List.Item>
            ))}
          </List>
        </>
      )}

      <Divider />

      <McpAccessSwitch
        checkoutPath={checkoutPath}
        access={status.access}
        onChange={onAccessChange}
      />

      <Divider />

      <Group gap="xs">
        <Button size="xs" leftSection={<IconSettingsAutomation size={14} />} onClick={onSetUp}>
          Set up your AI tool
        </Button>
        <CopyMcpConfig label="Copy MCP configuration" />
      </Group>

      <Text size="xs" c="dimmed">
        Your AI client starts and stops this server itself, so the app has no Start or Stop to
        offer. Closing this window leaves any client connection running.
      </Text>
    </Stack>
  )
}
