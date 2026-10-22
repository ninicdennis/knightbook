/**
 * Places on the site that wait on something real: a screenshot, a decision, or
 * a page that is not built yet. Each is listed here with what it waits on.
 *
 * A private-preview build shows them, visibly marked as drafts. A production
 * build (KNIGHTBOOK_SITE_STAGE=production, set by the deployment) refuses to
 * build while any remain, and names every one, so a placeholder can never be
 * published as if it were the product. Remove an entry once its place is real.
 */
export const DRAFTS = {} as const

export type DraftId = keyof typeof DRAFTS

export function isProductionBuild() {
  return process.env.KNIGHTBOOK_SITE_STAGE === 'production'
}

/** Called once per page that uses drafts: in a production build, refuse them all at once. */
export function refuseDraftsInProduction(used: readonly DraftId[]) {
  if (!isProductionBuild() || used.length === 0) return
  const lines = used.map((id) => `  ${id}: ${DRAFTS[id]}`)
  throw new Error(
    `This page still has drafts, which a production build does not publish:\n${lines.join('\n')}`,
  )
}
