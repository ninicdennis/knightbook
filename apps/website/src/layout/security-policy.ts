import { UMAMI } from './analytics'

/**
 * What a page may load, sent as <meta> tags because GitHub Pages sets no custom
 * headers (D-053). Everything the site serves is its own, so the policy allows
 * only this origin, plus Umami's script and the visit it posts in a production
 * build (D-052). Styles allow 'unsafe-inline' because Astro inlines small
 * stylesheets and the code blocks colour their text with `style` attributes;
 * scripts allow no inline code at all.
 *
 * A meta tag cannot carry `frame-ancestors`, `report-uri` or `sandbox`, and
 * covers only what loads after it, so BaseLayout puts it first in the head.
 */
export function contentSecurityPolicy({ analytics }: { analytics: boolean }): string {
  const umami = analytics ? [new URL(UMAMI.src).origin] : []
  const directives: [string, ...string[]][] = [
    ['default-src', "'self'"],
    ['script-src', "'self'", ...umami],
    ['connect-src', "'self'", ...umami],
    ['style-src', "'self'", "'unsafe-inline'"],
    ['img-src', "'self'"],
    ['font-src', "'self'"],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
  ]
  return directives.map((directive) => directive.join(' ')).join('; ')
}

/** Other sites learn which site a visitor came from, never which page (D-053). */
export const REFERRER_POLICY = 'strict-origin-when-cross-origin'
