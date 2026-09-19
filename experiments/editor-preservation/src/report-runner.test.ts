import { it } from 'vitest'

/**
 * The report needs a DOM, so it runs through Vitest's jsdom environment rather
 * than as a bare Node script. It asserts nothing; it prints evidence.
 */
it('prints preservation evidence', async () => {
  await import('./report.js')
}, 60_000)
