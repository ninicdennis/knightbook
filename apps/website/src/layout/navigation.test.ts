import { describe, expect, it } from 'vitest'
import {
  destinations,
  downloadLink,
  footerGroups,
  isCurrentPage,
  primaryNavigation,
} from './navigation'

describe('the shared destinations', () => {
  it('are the only links the header and footer use, so no two places disagree on a URL', () => {
    const shared = new Set(Object.values(destinations))
    for (const link of [
      ...primaryNavigation,
      downloadLink,
      ...footerGroups.flatMap((g) => g.links),
    ]) {
      expect(shared.has(link), link.label).toBe(true)
    }
  })
})

describe('which link is the current page', () => {
  it('matches the page being shown, with or without a trailing slash', () => {
    expect(isCurrentPage(destinations.documentation, '/docs/')).toBe(true)
    expect(isCurrentPage(destinations.documentation, '/docs')).toBe(true)
    expect(isCurrentPage(destinations.releases, '/docs/')).toBe(false)
  })

  it('never treats an in-page anchor as a page of its own', () => {
    expect(isCurrentPage(destinations.howItWorks, '/')).toBe(false)
  })
})
