import type { APIRoute } from 'astro'
import { guideHref, publishedGuides } from '../docs/guides'

/**
 * Every public page, for search engines: the site's own pages and each published
 * guide. Draft guides, the 404 page, redirects and previews are never listed.
 * A test compares this list with the pages the build actually wrote.
 */
const PAGES = ['/', '/download/', '/releases/', '/docs/', '/license/', '/privacy/']

export const GET: APIRoute = async ({ site }) => {
  const guides = (await publishedGuides()).filter((guide) => !guide.data.draft)
  const paths = [...PAGES, ...guides.map((guide) => guideHref(guide))]
  const urls = paths.map((path) => `  <url><loc>${new URL(path, site)}</loc></url>`)
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n')
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}
