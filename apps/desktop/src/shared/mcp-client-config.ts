import type { McpLaunchCommand } from './mcp-contract.js'

/**
 * The MCP configuration, wrapped the way each AI client expects it, so the
 * user pastes a complete entry instead of reshaping one by hand (D-026).
 *
 * The launch command is the same for every client; only the wrapping differs.
 * These formats belong to the clients and can change without notice, so the
 * list stays at three plus a plain fallback, each checked against the client's
 * own documentation on the date recorded in D-026.
 */

export type McpClient = 'claude' | 'codex' | 'opencode' | 'other'

export interface McpClientSnippet {
  client: McpClient
  /** Who the snippet is for, as shown in the menu. */
  label: string
  /** Where it goes, and whether to merge it into what is already there. */
  where: string
  text: string
}

const SERVER_NAME = 'knightbook'

/** A TOML string: literal when that needs no escaping, otherwise a basic string. */
function tomlString(value: string): string {
  if (!/['\n\r]/.test(value)) return `'${value}'`
  // JSON string escapes are all valid in a TOML basic string.
  return JSON.stringify(value)
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function mcpClientSnippets(launch: McpLaunchCommand): McpClientSnippet[] {
  const { command, args } = launch
  return [
    {
      client: 'claude',
      label: 'Claude Code or Claude Desktop',
      where:
        'Claude Code: a .mcp.json file in the project, or ~/.claude.json for every project. ' +
        'Claude Desktop: claude_desktop_config.json. If the file already has an "mcpServers" ' +
        'object, add the "knightbook" entry to it rather than a second "mcpServers".',
      text: json({ mcpServers: { [SERVER_NAME]: { type: 'stdio', command, args } } }),
    },
    {
      client: 'codex',
      label: 'Codex',
      where:
        '~/.codex/config.toml, or .codex/config.toml in a project. Paste it as a new table; ' +
        'replace any existing [mcp_servers.knightbook] table rather than adding a second one.',
      text: [
        `[mcp_servers.${SERVER_NAME}]`,
        `command = ${tomlString(command)}`,
        `args = [${args.map(tomlString).join(', ')}]`,
        '',
      ].join('\n'),
    },
    {
      client: 'opencode',
      label: 'OpenCode',
      where:
        '~/.config/opencode/opencode.json, or opencode.json in a project. If the file already ' +
        'has an "mcp" object, add the "knightbook" entry to it rather than a second "mcp".',
      text: json({
        mcp: { [SERVER_NAME]: { type: 'local', command: [command, ...args], enabled: true } },
      }),
    },
    {
      client: 'other',
      label: 'Another client',
      where:
        'Only the program and its arguments. Put them in the MCP server entry your client ' +
        'describes, named knightbook.',
      text: json({ command, args }),
    },
  ]
}
