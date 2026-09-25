import {
  Accordion,
  Alert,
  Button,
  Code,
  CopyButton,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { IconCheck, IconCopy, IconFolderDown } from '@tabler/icons-react'
import { useSkillSetup } from './useSkillSetup.js'
import { CopyMcpConfig } from './CopyMcpConfig.js'
import { SkillTargetRow } from './SkillTargetRow.js'

/**
 * Setting up an AI tool from the installed app alone: connecting it, then
 * giving it the workflow skill. They are separate steps because they are
 * separate facts — a client can be connected without the skill, and a skill on
 * disk says nothing about whether a client loaded it.
 */

interface Props {
  opened: boolean
  onClose: () => void
  checkoutPath: string
}

function ConnectStep() {
  return (
    <Stack gap="xs">
      <Title order={4}>1. Connect your AI client</Title>
      <Text size="sm">
        Your client starts Knightbook's MCP server from this configuration. It is the same for every
        project, so you add it once. Then allow each project with the switch in the MCP panel.
      </Text>
      <Text size="xs" c="var(--ps-text-muted)">
        Choose your client when you copy: Claude, Codex and OpenCode each get a complete entry in
        their own format, and the app says which file it goes in.
      </Text>
      <CopyMcpConfig label="Copy MCP configuration" />
    </Stack>
  )
}

export function AiSetupDialog({ opened, onClose, checkoutPath }: Props) {
  const { loaded, busy, outcome, install, exportFolder } = useSkillSetup(checkoutPath, opened)

  return (
    <Modal opened={opened} onClose={onClose} title="Set up your AI tool" size="lg">
      <Stack gap="lg">
        <ConnectStep />

        <Stack gap="xs">
          <Title order={4}>2. Give it the workflow skill</Title>
          <Text size="sm">
            The skill teaches the AI how to work on this board: when to start a ticket, how to hand
            off in Verification, and that only you decide Done. Install it where your client looks
            for skills. Knightbook never replaces a copy you may have changed.
          </Text>

          {loaded.kind === 'loading' && (
            <Group gap="xs">
              <Loader size="xs" />
              <Text size="sm">Checking what is installed…</Text>
            </Group>
          )}
          {loaded.kind === 'failed' && (
            <Alert color="red" title="The skill could not be read">
              {loaded.message}
            </Alert>
          )}

          {loaded.kind === 'ready' && (
            <>
              <div>
                {loaded.setup.targets.map((target) => (
                  <SkillTargetRow
                    key={target.id}
                    target={target}
                    busy={busy === target.id}
                    onInstall={(id, expected) => void install(id, expected)}
                  />
                ))}
              </div>

              {outcome && <Alert color={outcome.ok ? 'teal' : 'red'}>{outcome.message}</Alert>}

              <Text size="sm" fw={600} mt="xs">
                Another client, or somewhere else
              </Text>
              <Text size="xs" c="var(--ps-text-muted)">
                Export the whole skill folder and copy it where your client reads skills. For a
                client without skills, copy the text into its project instructions, such as{' '}
                <Code>AGENTS.md</Code>.
              </Text>
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<IconFolderDown size={14} />}
                  loading={busy === 'export'}
                  onClick={() => void exportFolder()}
                >
                  Export skill folder…
                </Button>
                <CopyButton value={loaded.setup.skillText} timeout={2000}>
                  {({ copied, copy }) => (
                    <Button
                      size="xs"
                      variant="default"
                      leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                      onClick={copy}
                    >
                      {copied ? 'Copied' : 'Copy skill text'}
                    </Button>
                  )}
                </CopyButton>
              </Group>

              <Accordion variant="contained">
                <Accordion.Item value="preview">
                  <Accordion.Control>
                    Preview the skill ({loaded.setup.files.join(', ')})
                  </Accordion.Control>
                  <Accordion.Panel>
                    <ScrollArea.Autosize mah={280}>
                      <Code block style={{ whiteSpace: 'pre-wrap' }}>
                        {loaded.setup.skillText}
                      </Code>
                    </ScrollArea.Autosize>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            </>
          )}
        </Stack>

        <Text size="xs" c="var(--ps-text-muted)">
          What this can confirm: that the files are where each client documents looking. It cannot
          see whether your client loaded the skill or follows it. Ask the client which skills it
          has, and watch the MCP panel for its connection.
        </Text>
      </Stack>
    </Modal>
  )
}
