import { useEffect } from 'react'
import type { Screen } from './screen.js'

/**
 * Keeps the window title on the project that is actually open. Only an open
 * project is named: welcome, loading and failure screens have not shown one,
 * so the title claims none. Depending on the name and path, not the whole
 * record, means a refresh that changed neither does not ask the host again.
 */
export function useWindowTitle(screen: Screen): void {
  const name = screen.kind === 'open' ? screen.project.name : null
  const checkoutPath = screen.kind === 'open' ? screen.project.checkoutPath : null

  useEffect(() => {
    const project = name !== null && checkoutPath !== null ? { name, checkoutPath } : null
    void window.knightbook.showProjectInWindowTitle(project)
  }, [name, checkoutPath])
}
