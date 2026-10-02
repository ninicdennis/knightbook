# Future feature: releases after merge

Status: implemented on 2026-10-01 as decision D-040 (ticket 356c7683), following
the proposal below with the choices recorded under "How releases work". Researched
2026-09-19. The rest of this document is the original proposal, kept for its
reasoning.

## How releases work

This section is for maintainers. The decision and its reasons are D-040 in the
[specification](../project-workspace-spec.md).

**What causes a release.** A push to `main` that changes the desktop app runs
`.github/workflows/release.yml` (D-041). The app is `apps/desktop`, `packages`,
`skills/projectspace` and the build setup: root `package.json`, `pnpm-lock.yaml`,
`pnpm-workspace.yaml`, `tsconfig.base.json`, and the CI and release workflows. That
list lives in `APP_PATHS` in `apps/desktop/scripts/publishing/app-commits.mjs` and is
repeated as the workflow's `paths` filter; a test fails if they differ. A push that
changes only the website, `docs/`, the README or the board starts no release run.
Its pull request's checks are what cover it.

Pull requests are squash-merged, so the push is one commit whose message is the pull
request's title. semantic-release reads the commits since the last `v*` tag, skips
any that changed none of the app paths, and applies these rules to the rest:

| Commit | Release |
| --- | --- |
| `feat!: …`, or a `BREAKING CHANGE:` footer | major |
| `feat: …` | minor |
| any other Conventional Commit type (`fix`, `docs`, `chore`, `ci`, `refactor`, `test`, `build`, `perf`, `style`, `revert`) | patch |
| anything else | none; CI still runs, nothing is published |

The first release is `0.1.0`. Every release is published as a GitHub prerelease. To
start publishing stable releases, change `--prerelease` in
`apps/desktop/scripts/publishing/publish-release.mjs`. The `Pull request title` workflow
(`pr-title.yml`) runs commitlint on each pull-request title, so a title that would
release nothing fails before merge. GitHub's own settings should allow squash merging
only and use the pull request title as the squash commit's title; those settings are
in the repository, not in this code.

**The three stages.**

1. `version` runs `apps/desktop/scripts/publishing/next-version.mjs`: semantic-release in
   dry-run mode, which chooses the version and writes the release notes. It needs a
   write token only because semantic-release checks that it could push, even in
   dry-run mode; it creates no tag or commit.
2. `ci` calls `ci.yml` with that version. Each platform stamps the version into the
   desktop and MCP `package.json` files on the runner (never committed), runs every
   check, builds the installers with `pnpm pack:installers`, tests the packaged app,
   and keeps the installers as an artifact.
3. `publish` runs `apps/desktop/scripts/publishing/publish-release.mjs` only if every
   platform passed. It refuses to continue unless there is exactly one Windows x64
   installer, one DMG per Mac CPU and one Linux deb, all of this version. It then
   writes `SHA256SUMS.txt`, creates a draft prerelease targeting the tested commit,
   uploads everything, checks the draft holds every file at the right size, and
   publishes it. Publishing is what creates the tag.

**Re-running and recovering.** Re-running a failed release workflow from the Actions
tab is safe:

- A release already published from the same commit with the same files is verified
  and left alone; the run succeeds.
- A draft left by a failed run is deleted and staged again. Drafts are never public.
- A tag already at a different commit, or a published release whose files differ,
  stops the run with an error and changes nothing. Do not delete published releases
  or move tags to get past it; find out why first.
- If a build fails, nothing is published. The next merge picks up its commits, since
  the version is always calculated from the last tag.

Releases run one at a time. GitHub keeps only one waiting run, so a third merge
landing while one release runs and another waits replaces the waiting one; the next
release then includes both merges' changes under one version.

**Credentials.** Only the default `GITHUB_TOKEN` is used: `contents: write` for the
version check and the publishing job, read-only everywhere else, including every
pull-request run. There are no signing secrets yet; builds are unsigned (ticket
a415fdb2).

**Not covered.** The repository is private, so a release's files download only for
signed-in accounts with access. Public downloads come from a separate bucket (ticket
1ef49bc4). The app does not check for or install updates. A GitHub Release is only
where the files are kept.

**Building installers without publishing.** On the Actions tab, run CI on a branch
with a version (for example `0.0.1`). It builds and tests the installers on all three
platforms and keeps them as artifacts for seven days, but never publishes.

## Intended outcome

Merging changes into the designated release branch should automatically build,
validate, and publish a downloadable Knightbook release on GitHub. A separate
manual tag or release-publishing step should not be necessary. Implementation can
follow the current product work; the particular tooling remains a proposal.

This is repository release tooling. It does not change the product's exclusion
of automatic Git operations in users' projects. Installing updates automatically
inside the desktop app is a separate future decision.

## Current starting point

- The app already uses Electron Builder. Its configuration lists Windows x64
  NSIS, macOS arm64/x64 DMG, and Linux x64 AppImage/deb targets. These are
  configured candidates, not a verified support matrix.
- `pnpm pack:dir` builds the MCP bundle and an unpacked desktop application.
  It does not produce an installer. `pnpm check` runs typechecks and tests.
- Only Windows unpacked packaging has been validated. See the
  [packaging findings](../experiments/packaging-findings.md) for the limits.
- The staging script copies the build host's Node executable into the app.
  Release builds must supply the runtime matching each target OS and CPU.
- Desktop and workspace package versions currently start at `0.0.0`.
  No GitHub Actions workflow was present at the time of this review. A pull-request
  validation workflow, `.github/workflows/ci.yml`, was added afterwards; there is still
  no release workflow.

## Methods considered

| Method | What causes a release | Fit for Knightbook |
| --- | --- | --- |
| GitHub Actions + Electron Builder + GitHub CLI | Push to the release branch after an ordinary PR merge; version is supplied in that PR | Recommended initial approach: reuse the existing packager and publish installers together. Version selection stays explicit; the workflow needs a small amount of release validation. |
| semantic-release | Release-eligible commits land on the configured branch; commit conventions determine the version | Best alternative if automatic version calculation is important. Requires agreed commit rules and desktop-specific build/version integration; default rules do not release every docs/chore change. |
| Release Please | Maintains a release PR; merging that PR creates the release | Good for batching changes with reviewable versions/changelogs, but normally adds a second merge before release. It does not build desktop installers itself. |
| Changesets | Contributors add change files; a version/release workflow consumes them | Useful for independently published workspace packages. More process than this single desktop product currently needs. |

Sources: [GitHub CLI release creation](https://cli.github.com/manual/gh_release_create),
[Electron Builder publishing](https://www.electron.build/publish/),
[semantic-release](https://semantic-release.gitbook.io/semantic-release/),
[Release Please Action](https://github.com/googleapis/release-please-action),
[Changesets](https://github.com/changesets/changesets).

These fit assessments are project-specific recommendations, not claims that one
tool is universally better. GitHub Actions runs the jobs; Electron Builder makes
the installers; version tooling chooses a version; GitHub Releases distributes
the resulting assets. They solve different parts of the process.

## Proposed first implementation

Use one Actions workflow with build jobs and a final publishing job. Initially,
keep the desktop version explicit in the ordinary PR. Validate before merging
that a release-producing PR provides a version newer than the last release.
Use one product version for the installers and bundled MCP server; this does not
require separately publishing the private workspace packages to npm.

1. **Trigger on the release branch.** Use `push` filtered to the selected branch
   (for example, `main`). Protect that branch so normal pushes arrive through
   merged PRs. A push trigger also accepts direct pushes unless repository rules
   prevent them. Run PR validation separately without release credentials.
2. **Fix the release identity.** Check out the triggering commit SHA, read the
   desktop version, and use that exact SHA and version in every build. Fetch the
   needed tags/history. Fail on a tag pointing at another commit. Never package
   a later branch head accidentally.
3. **Build and test.** Install the pinned pnpm version and a pinned compatible
   Node runtime with a frozen lockfile. Run `pnpm check`, build the MCP bundle,
   package with publishing disabled, and run packaged checks after the package
   exists. Release checks must fail if the required packaged tests are skipped.
4. **Produce platform installers.** Use jobs for each supported OS/architecture,
   with matching Node runtimes. Sign Windows/macOS artifacts and notarize macOS
   distribution as required by the chosen delivery policy. Validate installation
   and the bundled MCP executable on each supported target.
5. **Collect every required asset.** Upload uniquely named artifacts and checksums
   from the build jobs. Only proceed when the entire required matrix succeeds.
   Individual matrix jobs must not publish releases independently.
6. **Publish once.** A dependent job creates a version tag at the tested SHA and
   a draft GitHub Release, attaches the complete expected asset set, verifies it,
   then automatically publishes the release with notes. Draft status is a staging
   mechanism, not an extra human approval step. GitHub CLI supports draft releases,
   target commits, attached assets, and generated notes.

The GitHub CLI behavior is documented in its
[release creation reference](https://cli.github.com/manual/gh_release_create).
For Electron Builder, explicitly control
[publishing](https://www.electron.build/publish/) rather than depending on CI or
tag detection defaults.

### Failure, permissions, and repeat runs

Keep build jobs read-only for repository contents. Give only the publishing job
`contents: write`; restrict signing secrets to trusted release jobs. Pin external
actions to reviewed commit SHAs when implementing the workflow.
See GitHub's [token permissions guidance](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token)
and [secure-use reference](https://docs.github.com/en/actions/reference/security/secure-use).

Keep tag creation and publishing in this workflow or explicitly call reusable
workflows. Events created with `GITHUB_TOKEN` generally do not start another
workflow, with documented exceptions such as explicit dispatch events. A design
that creates a tag and waits for a separate tag-triggered workflow can therefore
stall. See [GitHub workflow triggering](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

Serialize publication and recheck the version/tag immediately before writing.
Do not silently cancel older releases if the selected policy promises a release
for every merge. Choose and test queue behavior explicitly during implementation.
A repeat run for an already published SHA/version should verify the existing
release and exit successfully; it must not overwrite released binaries or move
tags. A failed draft may be resumed only after matching its SHA/version and
checking asset integrity. A failed build must leave no published partial release.

## Packaging prerequisites

- Define the supported OS versions, architectures, installer formats, and signing
  credentials. The existing config alone does not establish support.
- Split macOS arm64 and x64 builds or stage a verified runtime per target. Building
  both from one host while copying its Node binary ships the wrong runtime for
  one architecture. Verify downloaded runtime checksums when downloads are used.
- Preserve executable permissions and include the bundled Node helper in signing
  and execution validation. Exercise MCP with the app fully closed and without
  system Node.
- Confirm saved MCP commands survive an actual installed update. Linux AppImage
  mount paths are transient; choose a persistent helper location or supported
  installed layout before promising that format works with saved MCP settings.
- Add installer creation and clean-install checks; current `--dir` evidence is
  insufficient for public distribution.

## Decisions to settle when implementing

1. Release branch and cadence: every merge, or only release-eligible changes?
   The proposed literal every-merge policy requires a new version even for a
   docs-only merge. Skipping such merges must be an explicit alternative.
2. Versioning: explicit version in the ordinary PR initially, or semantic-release
   with agreed commit rules and version injection before packaging?
3. Channel: stable releases or development prereleases initially? Define which
   releases may become GitHub's latest release.
4. Final platform matrix, signing/notarization setup, and repository visibility.
   Release asset access follows repository access; private distribution needs
   deliberate handling if an in-app updater is added later.

In-app update discovery, download, installation, and rollback are outside this
feature. Publishing a GitHub Release alone does not implement them. Revisit
[Electron Builder auto-update](https://www.electron.build/auto-update/) separately.

## Acceptance criteria for the later feature

- A merged, release-eligible PR produces versioned installers and release notes
  automatically, tied to the exact merged commit.
- All required platform checks pass before a release becomes available; a failed
  platform build or missing asset prevents publication.
- A clean install launches the app and MCP independently on every supported target;
  an installed upgrade preserves the saved MCP launch command.
- Re-running a completed release creates neither a duplicate nor changed assets.
  Test recovery from partial draft uploads and two closely spaced merges.
- PRs from forks cannot publish or access signing secrets.
- Version/cadence rules, credentials, failure recovery, and the distinction between
  release publishing and in-app updates are documented for maintainers.
