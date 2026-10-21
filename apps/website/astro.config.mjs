import { defineConfig } from 'astro/config'
import { metadataCheck } from './src/layout/metadata-check.ts'
import { REDIRECTS } from './src/layout/redirects.ts'

/**
 * A static site (D-042): every page is HTML at build time, and none ships
 * client-side JavaScript unless a component explicitly opts in. `site` is the
 * production domain (D-046), served by GitHub Pages (D-044).
 */
export default defineConfig({
  site: 'https://knightbook.xyz',
  redirects: REDIRECTS,
  integrations: [metadataCheck()],
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  telemetry: false,
})
