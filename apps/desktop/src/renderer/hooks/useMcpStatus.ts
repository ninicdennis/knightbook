import { useEffect, useState } from 'react'
import type { McpStatusView } from '../../shared/contract.js'

/**
 * Keeps an MCP observation current for one checkout.
 *
 * It polls rather than watching, because the thing being observed is a heartbeat
 * file written by another process on a timer; there is nothing to subscribe to
 * that would be more truthful than re-reading it. The interval is shorter than
 * the server's heartbeat so a connection that drops is noticed promptly.
 *
 * A reply for a checkout the user has since left is dropped. Showing one
 * project's connection under another project's name is exactly the stale-status
 * failure this feature exists to avoid.
 */

const POLL_MS = 5_000

export function useMcpStatus(checkoutPath: string): McpStatusView | null {
  const [status, setStatus] = useState<McpStatusView | null>(null)

  useEffect(() => {
    // Clear immediately: the previous project's status is not this one's, and a
    // brief "checking" is honest where a carried-over reading would not be.
    setStatus(null)

    let cancelled = false
    const read = async (): Promise<void> => {
      try {
        const next = await window.projectspace.mcpStatus(checkoutPath)
        if (!cancelled && next.checkoutPath === checkoutPath) setStatus(next)
      } catch {
        // The host is unreachable, which is not evidence about MCP. Leave the
        // last reading in place rather than inventing a state for it.
      }
    }

    void read()
    const timer = setInterval(() => void read(), POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [checkoutPath])

  return status
}
