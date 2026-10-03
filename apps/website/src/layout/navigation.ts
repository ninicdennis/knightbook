/**
 * Every destination the shared shell links to, defined once. The header, the
 * mobile menu, the footer and the 404 page pick from these, grouped differently,
 * so no two places can disagree about a URL.
 *
 * Only destinations that exist or are planned as top-level routes are here.
 * Privacy, License and Support join `utilityLinks` once their pages, terms and
 * destinations exist (tickets 1aefd5aa, a677c856, c125336d); until then the
 * footer leaves that row out rather than linking to an undecided page.
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

/** Privacy, License and Support, once each exists. Empty, so the row is not drawn. */
export const utilityLinks: NavigationLink[] = []

/**
 * Whether `link` is the page being shown, for `aria-current`. An in-page anchor
 * such as How it works is never "current": it is part of a page, not a page.
 */
export function isCurrentPage(link: NavigationLink, pathname: string) {
  if (link.href.includes('#')) return false
  const normalise = (path: string) => (path.endsWith('/') ? path : `${path}/`)
  return normalise(pathname) === normalise(link.href)
}
