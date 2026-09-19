import { isProjectError } from '@projectspace/core'

/** Shared tool-result shaping, so every tool reports failures the same way. */
export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

export function ok(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

export function fail(error: unknown): ToolResult {
  const message = isProjectError(error)
    ? `${error.code}: ${error.message}` +
      (error.currentRevision ? ` (current revision ${error.currentRevision})` : '')
    : `unexpected_error: ${error instanceof Error ? error.message : String(error)}`
  return { content: [{ type: 'text', text: message }], isError: true }
}

export async function guard(run: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await run()
  } catch (error) {
    return fail(error)
  }
}
