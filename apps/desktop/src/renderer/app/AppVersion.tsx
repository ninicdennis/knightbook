import { Stack, Text } from '@mantine/core'
import { useEffect, useState } from 'react'

/**
 * The version of the running app, for someone reporting a problem. The host reads
 * it from the packaged app; release builds are stamped with their version, so
 * 0.0.0 means a build that was never released and is labelled as one rather than
 * passed off as a real version. A version that could not be read says so instead
 * of leaving the line blank.
 */

const UNRELEASED = '0.0.0'

type VersionState = { kind: 'loading' } | { kind: 'read'; version: string } | { kind: 'unread' }

export function AppVersion() {
  const [state, setState] = useState<VersionState>({ kind: 'loading' })

  useEffect(() => {
    let current = true
    window.knightbook.appVersion().then(
      (version) => {
        if (current) setState({ kind: 'read', version })
      },
      () => {
        if (current) setState({ kind: 'unread' })
      },
    )
    return () => {
      current = false
    }
  }, [])

  return (
    <Stack gap="xs">
      <Text size="sm" fw={600}>
        About
      </Text>
      <Text size="xs" c="dimmed">
        Version
      </Text>
      <VersionLine state={state} />
    </Stack>
  )
}

function VersionLine({ state }: { state: VersionState }) {
  if (state.kind === 'loading') {
    return (
      <Text size="sm" c="dimmed">
        Reading the version…
      </Text>
    )
  }
  if (state.kind === 'unread') {
    return (
      <Text size="sm" c="orange">
        The version could not be read.
      </Text>
    )
  }
  return (
    <Text size="sm" data-testid="app-version">
      Knightbook {state.version}
      {state.version === UNRELEASED && (
        <Text span size="xs" c="dimmed">
          {' '}
          (a development build, not a release)
        </Text>
      )}
    </Text>
  )
}
