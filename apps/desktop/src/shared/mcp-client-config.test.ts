import { describe, expect, it } from 'vitest'
import { mcpClientSnippets, type McpClient } from './mcp-client-config.js'

/**
 * The snippets are pasted into files the clients parse, so each one is parsed
 * back here rather than compared as text. Windows paths with spaces are the
 * case that broke hand-copied configs: JSON needs every backslash escaped, and
 * TOML has its own string rules.
 */

const WINDOWS = {
  command: 'C:\\Program Files\\Knightbook\\resources\\mcp\\node.exe',
  args: [
    'C:\\Program Files\\Knightbook\\resources\\mcp\\server.mjs',
    '--registry',
    'C:\\Users\\Ada Lovelace\\AppData\\Roaming\\Knightbook\\mcp-access.json',
  ],
}

const POSIX = {
  command: '/Applications/Knightbook.app/Contents/Resources/mcp/node',
  args: ['/Applications/Knightbook.app/Contents/Resources/mcp/server.mjs', '--registry', '/x.json'],
}

function snippet(client: McpClient, launch = WINDOWS): string {
  return mcpClientSnippets(launch).find((entry) => entry.client === client)!.text
}

/** Enough of TOML to read back the one table the Codex snippet writes. */
function parseTomlString(raw: string): string {
  return raw.startsWith("'") ? raw.slice(1, -1) : (JSON.parse(raw) as string)
}

function readCodexTable(text: string): { table: string; command: string; args: string[] } {
  const [table, commandLine, argsLine] = text.trim().split('\n')
  const command = parseTomlString(commandLine!.replace(/^command = /, ''))
  const list = argsLine!.replace(/^args = \[/, '').replace(/\]$/, '')
  const args = (list.match(/'[^']*'|"(?:[^"\\]|\\.)*"/g) ?? []).map(parseTomlString)
  return { table: table!, command, args }
}

describe('MCP client snippets', () => {
  it('wraps the launch command for Claude, outer key included', () => {
    expect(JSON.parse(snippet('claude'))).toEqual({
      mcpServers: { knightbook: { type: 'stdio', ...WINDOWS } },
    })
  })

  it('writes one command array for OpenCode, program first', () => {
    expect(JSON.parse(snippet('opencode'))).toEqual({
      mcp: {
        knightbook: { type: 'local', command: [WINDOWS.command, ...WINDOWS.args], enabled: true },
      },
    })
  })

  it('writes a Codex TOML table whose Windows paths need no escaping', () => {
    const text = snippet('codex')
    expect(text).toContain("command = 'C:\\Program Files\\Knightbook\\resources\\mcp\\node.exe'")
    expect(readCodexTable(text)).toEqual({ table: '[mcp_servers.knightbook]', ...WINDOWS })
  })

  it('falls back to an escaped TOML string when a path holds a quote', () => {
    const quoted = { command: "C:\\Users\\O'Brien\\node.exe", args: [] }
    const text = snippet('codex', quoted)
    expect(text).toContain('command = "C:\\\\Users\\\\O\'Brien\\\\node.exe"')
    expect(readCodexTable(text).command).toBe(quoted.command)
  })

  it('keeps the plain command and arguments for any other client', () => {
    expect(JSON.parse(snippet('other'))).toEqual(WINDOWS)
  })

  it('round-trips macOS and Linux paths in every format', () => {
    expect(JSON.parse(snippet('claude', POSIX)).mcpServers.knightbook.args).toEqual(POSIX.args)
    expect(JSON.parse(snippet('opencode', POSIX)).mcp.knightbook.command[0]).toBe(POSIX.command)
    expect(readCodexTable(snippet('codex', POSIX)).args).toEqual(POSIX.args)
  })

  it('says where each snippet goes', () => {
    for (const entry of mcpClientSnippets(WINDOWS)) expect(entry.where.length).toBeGreaterThan(20)
  })
})
