import type { APIRoute } from 'astro'
import { isProductionBuild } from '../home/drafts'

/**
 * Production lets search engines in and names the sitemap. A preview build
 * (D-044) asks them to stay out, as its pages' `noindex` does.
 */
export const GET: APIRoute = ({ site }) => {
  const body = isProductionBuild()
    ? `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap.xml', site)}\n`
    : 'User-agent: *\nDisallow: /\n'
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
