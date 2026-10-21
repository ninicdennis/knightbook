/**
 * Every redirect the site serves, in one place (ticket 0f142dd8). GitHub Pages
 * has no server redirects (D-044), so Astro builds each old address as a small
 * page with a meta refresh and a canonical link to the new one. When a page
 * moves, add its old address here; a test checks every target is a real page.
 */
export const REDIRECTS: Record<string, string> = {
  '/downloads/': '/download/',
}
