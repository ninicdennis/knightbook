import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { environmentWithoutNode, type StagedResources } from './stage.js'

/**
 * Connects the way an AI client would: by running the saved command, with no
 * knowledge of this repository and no Node on PATH. Nothing here starts Electron,
 * which is the point — the GUI is not merely closed, it never exists.
 */
export interface Connection {
  readonly client: Client
  readonly stderr: () => string
  close(): Promise<void>
}

export async function connect(
  resources: StagedResources,
  projectRoot: string,
  cwd: string,
): Promise<Connection> {
  const transport = new StdioClientTransport({
    command: resources.nodePath,
    args: [resources.serverPath, '--root', projectRoot],
    env: environmentWithoutNode() as Record<string, string>,
    cwd,
    stderr: 'pipe',
  })

  let collected = ''
  const client = new Client({ name: 'packaging-smoke-test', version: '0.0.0' })
  await client.connect(transport)
  transport.stderr?.on('data', (chunk: Buffer) => {
    collected += chunk.toString('utf8')
  })

  return {
    client,
    stderr: () => collected,
    close: async () => {
      await client.close()
    },
  }
}

/** Calls a tool and returns its parsed JSON payload, failing loudly on a tool error. */
export async function call(
  connection: Connection,
  name: string,
  args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const result = await connection.client.callTool({ name, arguments: args })
  const text = textOf(result)
  if (result.isError) throw new Error(`${name} failed: ${text}`)
  return JSON.parse(text) as Record<string, unknown>
}

/** Calls a tool expecting it to be refused, and returns the refusal message. */
export async function callExpectingError(
  connection: Connection,
  name: string,
  args: Record<string, unknown> = {},
): Promise<string> {
  const result = await connection.client.callTool({ name, arguments: args })
  if (!result.isError) {
    throw new Error(`${name} was expected to fail but succeeded: ${textOf(result)}`)
  }
  return textOf(result)
}

function textOf(result: { content?: unknown }): string {
  const blocks = (result.content ?? []) as Array<{ type: string; text?: string }>
  return blocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('\n')
}
