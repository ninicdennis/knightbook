/**
 * Every destination the shared shell links to, defined once. The header, the
 * mobile menu, the footer and the 404 page pick from these, grouped differently,
 * so no two places can disagree about a URL.
 *
 * Only destinations that exist or are planned as top-level routes are here.
 * Privacy and Support join `utilityLinks` once their page and destination exist
 * (tickets 1aefd5aa, c125336d); until then the footer links neither rather than
 * pointing at an undecided page.
 */
export interface NavigationLink {
  label: string
  href: string
}

export const destinations = {
  home: { label: 'Home', href: '/' },
  download: { label: 'Download', href: '/download/' },
  howItWorks: { label: 'How it works', href: '/#how-it-works' },
  documentation: { label: 'Documentation', href: '/docs/' },
  releases: { label: 'Releases', href: '/releases/' },
  license: { label: 'License', href: '/license/' },
  source: { label: 'Source code', href: 'https://github.com/ninicdennis/knightbook' },
} satisfies Record<string, NavigationLink>

/** The header's links. Download is shown on its own, as the page's main action. */
export const primaryNavigation: NavigationLink[] = [
  destinations.howItWorks,
  destinations.documentation,
  destinations.releases,
]

export const downloadLink = destinations.download

export interface FooterGroup {
  title: string
  links: NavigationLink[]
}

export const footerGroups: FooterGroup[] = [
  {
    title: 'Product',
    links: [destinations.download, destinations.howItWorks, destinations.releases],
  },
  { title: 'Guides', links: [destinations.documentation] },
]

/** The footer's bottom row: the license and the public source (D-043). Privacy and Support join it once each exists. */
export const utilityLinks: NavigationLink[] = [destinations.license, destinations.source]

/**
 * Whether `link` is the page being shown, for `aria-current`. An in-page anchor
 * such as How it works is never "current": it is part of a page, not a page.
 */
export function isCurrentPage(link: NavigationLink, pathname: string) {
  if (link.href.includes('#')) return false
  const normalise = (path: string) => (path.endsWith('/') ? path : `${path}/`)
  return normalise(pathname) === normalise(link.href)
}
