/**
 * The site's top-level destinations, shared by the header, the mobile menu and
 * the footer so they cannot list different pages. Download is not here: it is
 * the page's main action and is shown on its own, always visible.
 */
export interface NavigationLink {
  label: string
  href: string
}

export const primaryNavigation: NavigationLink[] = [
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Documentation', href: '/docs/' },
  { label: 'Releases', href: '/releases/' },
]

export const downloadLink: NavigationLink = { label: 'Download', href: '/download/' }
