import { defineConfig } from 'astro/config'

/**
 * A static site (D-042): every page is HTML at build time, and none ships
 * client-side JavaScript unless a component explicitly opts in. The canonical
 * `site` URL is set once the domain is chosen (ticket 577513c8).
 */
export default defineConfig({
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  telemetry: false,
})
