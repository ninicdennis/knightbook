import type { MantineColorSchemeManager } from '@mantine/core'
import type { ColorSchemeChoice } from '../../shared/contract.js'

/**
 * Mantine keeps the current scheme in a manager of its own. Its default one uses
 * the browser's local storage, but the durable copy of this choice belongs to the
 * host: the window's own background is painted from it before the renderer runs,
 * so the host has to know it too.
 *
 * This manager therefore only holds the value in memory, seeded with what the
 * host read at startup. Writing it back is the settings screen's job, because
 * that is the only place that can tell the user when saving fails. Mantine's
 * `set` is synchronous and returns nothing, so a failure reported from here
 * would have nowhere to go.
 */
export function hostColorSchemeManager(initial: ColorSchemeChoice): MantineColorSchemeManager {
  let current: ColorSchemeChoice = initial

  return {
    get: () => current,
    set: (value) => {
      current = value
    },
    subscribe: () => {},
    unsubscribe: () => {},
    clear: () => {
      current = 'auto'
    },
  }
}
