import {
  ActionIcon,
  Alert,
  Drawer,
  Group,
  SegmentedControl,
  Stack,
  Text,
  Tooltip,
  useMantineColorScheme,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconAlertTriangle, IconInfoCircle, IconSettings } from '@tabler/icons-react'
import { useState } from 'react'
import type { ColorSchemeChoice } from '../../shared/contract.js'

/**
 * Settings for this installation, not for the project. It is laid out as a list
 * of named sections so a second setting is a new section rather than a redesign.
 *
 * The choice is applied to the interface first and saved afterwards. If saving
 * fails, what the user sees is still what they asked for, and the screen says the
 * choice will not survive a restart rather than pretending it was stored.
 */

const SCHEMES: { value: ColorSchemeChoice; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'auto', label: 'Follow system' },
]

export function SettingsDrawer() {
  const [opened, drawer] = useDisclosure(false)
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  const [saveError, setSaveError] = useState<string | null>(null)

  const choose = (next: string) => {
    const choice = next as ColorSchemeChoice
    setColorScheme(choice)
    setSaveError(null)

    void window.projectspace.saveSettings({ colorScheme: choice }).then(
      (result) => {
        if (!result.ok) setSaveError(result.message)
      },
      () => setSaveError('The settings file could not be written.'),
    )
  }

  return (
    <>
      <Tooltip label="Settings" withArrow>
        <ActionIcon variant="default" size="lg" onClick={drawer.open} aria-label="Open settings">
          <IconSettings size={18} />
        </ActionIcon>
      </Tooltip>

      <Drawer
        opened={opened}
        onClose={drawer.close}
        title="Settings"
        position="right"
        size="sm"
        padding="md"
      >
        <Stack gap="xl">
          <Stack gap="xs">
            <Text size="sm" fw={600}>
              Appearance
            </Text>
            <Text size="xs" c="dimmed">
              Colour scheme
            </Text>
            <SegmentedControl
              fullWidth
              size="xs"
              value={colorScheme}
              onChange={choose}
              data={SCHEMES}
              aria-label="Colour scheme"
            />
            {saveError && (
              <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />}>
                This is applied now, but the choice could not be saved, so the app will start in the
                previous scheme. {saveError}
              </Alert>
            )}
          </Stack>

          <Group gap={6} align="flex-start" wrap="nowrap">
            <IconInfoCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} opacity={0.6} />
            <Text size="xs" c="dimmed">
              Settings are stored on this machine only. Nothing here is written into a project, so
              opening the same project elsewhere keeps that machine&apos;s own choices.
            </Text>
          </Group>
        </Stack>
      </Drawer>
    </>
  )
}
