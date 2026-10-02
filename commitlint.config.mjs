/**
 * Conventional Commits, checked on pull-request titles (.github/workflows/pr-title.yml).
 * Pull requests are squash-merged, so the title becomes the commit on main that
 * semantic-release reads to choose the next version (D-040).
 */
export default {
  extends: ['@commitlint/config-conventional'],
}
