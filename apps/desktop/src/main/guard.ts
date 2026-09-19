import { isProjectError } from '@projectspace/core'
import type { Result } from '../shared/contract.js'

/**
 * Shared failure shaping for every IPC handler, so the renderer sees one result
 * shape and a known error code rather than an opaque filesystem message.
 */
export async function guard<T>(run: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await run() }
  } catch (error) {
    if (isProjectError(error)) {
      return {
        ok: false,
        code: error.code,
        message: error.message,
        ...(error.currentRevision ? { currentRevision: error.currentRevision } : {}),
      }
    }
    return {
      ok: false,
      code: 'unexpected_error',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
