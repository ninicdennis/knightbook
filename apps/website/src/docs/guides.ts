import { getCollection, type CollectionEntry } from 'astro:content'
import { GUIDE_GROUPS } from '../content.config'
import { isProductionBuild } from '../home/drafts'

export type Guide = CollectionEntry<'docs'>

export function guideHref(guide: Pick<Guide, 'id'>) {
  return `/docs/${guide.id}/`
}

/**
 * The guides this build publishes, in reading order: by group, then by their
 * own order. A production build leaves placeholder (draft) guides out; a private
 * preview keeps them, marked as drafts.
 */
export async function publishedGuides(): Promise<Guide[]> {
  const guides = await getCollection('docs', (guide) => !(isProductionBuild() && guide.data.draft))
  return guides.sort(
    (a, b) =>
      GUIDE_GROUPS.indexOf(a.data.group) - GUIDE_GROUPS.indexOf(b.data.group) ||
      a.data.order - b.data.order,
  )
}

export function groupGuides(guides: Guide[]) {
  return GUIDE_GROUPS.map((group) => ({
    group,
    guides: guides.filter((guide) => guide.data.group === group),
  })).filter(({ guides: inGroup }) => inGroup.length > 0)
}

/**
 * Every link from one guide to another must reach a guide this build publishes.
 * Links are written relative to a guide's own address, such as
 * `[Installation](../installation/)`, or as `/docs/installation/`. Anything else
 * under /docs/ is a broken link, and the build stops and names each one.
 */
export function brokenGuideLinks(guides: Guide[]) {
  const published = new Set(guides.map((guide) => guideHref(guide)))
  published.add('/docs/')
  const broken: string[] = []
  for (const guide of guides) {
    for (const match of (guide.body ?? '').matchAll(/\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)) {
      const href = match[1] ?? ''
      if (/^[a-z]+:/i.test(href) || href.startsWith('#')) continue
      const { pathname } = new URL(href, `https://site.invalid${guideHref(guide)}`)
      if (!pathname.startsWith('/docs/')) continue
      const target = pathname.replace(/\.md$/, '/').replace(/\/?$/, '/')
      if (!published.has(target)) broken.push(`  ${guide.id}: ${href} (${target})`)
    }
  }
  return broken
}

export function refuseBrokenGuideLinks(guides: Guide[]) {
  const broken = brokenGuideLinks(guides)
  if (broken.length > 0) {
    throw new Error(`These guide links lead to no published guide:\n${broken.join('\n')}`)
  }
}
