import { Divider, List, Stack, Text } from '@mantine/core'
import type { McpStatusView } from '../../shared/contract.js'
import { describeAge, type McpDisplay } from '../mcp-status.js'
import { CopyMcpConfig } from './CopyMcpConfig.js'

/**
 * What the indicator is actually based on, and the one action the user can take
 * about it.
 *
 * The three observations are listed separately rather than summarized, because
 * they answer different questions and can disagree. A user debugging a client
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

export function McpStatusDetails({ status, display, checkoutPath }: Props) {
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
        <Fact label="Server process" value={describeProcess(status)} />
        <Fact label="Client connection" value={describeConnection(status)} />
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

      <CopyMcpConfig rootPath={checkoutPath} label="Copy MCP configuration" />

      <Text size="xs" c="dimmed">
        Your AI client starts and stops this server itself, so the app has no Start or Stop to
        offer. Closing this window leaves any client connection running.
      </Text>
    </Stack>
  )
}
