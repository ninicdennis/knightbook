# Research: application updates without manual reinstallation

Researched: 2026-09-25.
Status: research and recommendation only. No updater, release workflow, credentials,
or publishing configuration was implemented or enabled by this work.

## Intended outcome

After installing Knightbook, a user can receive new versions without repeatedly
downloading and running an installer. The recommended experience is a background
download followed by a choice to restart now or later.

Release publishing and application updating are separate capabilities. The
[release automation proposal](../proposals/release-automation.md) covers producing
and publishing releases. This research covers how an installed application would
discover and apply them.

## Recommendation

Use `electron-updater` with the existing Electron Builder packaging. For public
downloads, host releases on GitHub Releases. Start by proving the complete Windows
NSIS upgrade path, then validate the other supported platforms.

This is a project-specific recommendation, not an approved product decision.
It reuses the existing packager and avoids introducing a custom update service
unless restricted distribution requires one.

The Electron Builder v26 documentation supports NSIS on Windows, DMG plus ZIP on
macOS, and AppImage/deb on Linux. It provides update metadata, progress events,
signature validation and staged rollouts. macOS requires signing and a ZIP update
payload alongside the DMG. [Electron Builder v26 updater guide](https://www.electron.build/v26/docs/features/auto-update/)

## Current repository evidence

The following was inspected during this research:

- [Desktop package](../../apps/desktop/package.json): Electron Builder
  `^26.15.3`, application version `0.0.0`, and no `electron-updater` dependency.
- [Packaging configuration](../../apps/desktop/electron-builder.yml): Windows
  x64 NSIS, macOS arm64/x64 DMG, and Linux x64 AppImage/deb targets. No update
  publishing configuration is present.
- [CI](../../.github/workflows/ci.yml): validation and unpacked packaging exist;
  no release-publishing workflow was present.
- [Release proposal](../proposals/release-automation.md): release publishing is
  deferred and explicitly excludes in-app updating.
- [Packaging findings](../experiments/packaging-findings.md) and the
  [packaging lock guard](../../apps/desktop/scripts/release-lock-guard.mjs):
  installed resource paths and separately running MCP processes matter during
  replacement.

The configured targets are candidates, not proof of supported installed upgrades.
`pnpm pack:dir` uses `--dir` and does not create release installers.
This research did not run an installer, sign a build, or exercise an update.

The older release proposal contains historical runtime-staging observations.
The board now records target-specific runtime staging as completed; do not treat
that older observation as a current missing implementation. Installed upgrades
still need their own verification.

## Proposed user experience

1. Check at startup and periodically while the application is open.
2. Download an available stable release in the background.
3. Show the version, a short release summary, and “Restart now” / “Later”.
4. Finish pending saves before restarting and applying the update.
5. Offer “Check for updates” for users who want to check immediately.

Keep ordinary project work available when the network or update service fails.
Display a failed check as a failure, not “up to date”. Avoid forced restarts
during editing or active MCP work. Check frequency, download consent and whether
normal quitting also installs an update remain product decisions.

An application that is fully exited cannot check for updates without a separate
background component. Checking when next opened is the proposed starting point.

Existing installations without updater code need one initial manual upgrade to
an updater-enabled release. Subsequent compatible releases can use that updater.

## Hosting choices

| Choice | Fit for Knightbook |
| --- | --- |
| Public GitHub Releases | Recommended initial route if binaries are public. Publish installers and their generated update metadata together. |
| Separate public release repository | Keeps the source repository private while making downloadable binaries public. Configure the release repository explicitly. |
| Generic HTTPS feed | Appropriate for object storage/CDN hosting or restricted distribution. The release pipeline must upload artifacts and metadata; authentication needs a deliberate design. |

Electron Builder supports GitHub and generic HTTPS providers. Its private GitHub
mode expects a token on the user's machine and is described as suitable only for
special cases. Do not embed a shared repository credential in distributed builds.
[Updater guidance](https://www.electron.build/v26/docs/features/auto-update/)

The publisher must configure the destination and distribute the complete set of
release assets and update information. A GitHub Release alone does not add updater
code to installed applications. [Publishing configuration](https://www.electron.build/v26/docs/publish/)

## Platform considerations

| Platform | Proposed work and verification |
| --- | --- |
| Windows | Keep NSIS. Establish signed releases, verify installer identity, and test upgrades with the actual installation permissions. |
| macOS | Add ZIP targets for both configured architectures. Establish signing and notarization for distribution, then test installed upgrades on each supported architecture. |
| Linux AppImage | Test replacement of the actual AppImage and preserve a persistent MCP launch location outside transient mount paths. |
| Linux deb | Choose whether updates are driven by the app or an apt repository. Verify package-manager permissions and avoid two competing update mechanisms. |

The updater's documented format support does not establish identical permissions,
prompts or recovery behavior across these systems.
[Supported formats](https://www.electron.build/v26/docs/features/auto-update/)

Electron's built-in `autoUpdater` is an alternative, but its Windows installer
integration differs from Knightbook's NSIS route, and it has no built-in Linux
updater. Electron recommends the distribution package manager on Linux.
[Electron autoUpdater reference](https://www.electronjs.org/docs/latest/api/auto-updater)

The Electron-maintained `update.electronjs.org` service is another option for
public GitHub releases on Windows/macOS, with signed macOS applications. It does
not cover the Linux targets, so it is not the recommended route here.
[Electron updating tutorial](https://www.electronjs.org/docs/latest/tutorial/updates)

## Knightbook-specific requirements

### Preserve MCP access

An AI client launches Knightbook's bundled Node/MCP server independently of the
desktop window. Closing the window does not necessarily stop that process.

The existing Windows packaging guard documents resource locks when an executable
inside the package is still running. This is evidence of a replacement risk, not
proof that a future NSIS updater will fail in exactly the same way.

Before shipping updates:

- Test an upgrade while an AI client is connected to the installed MCP server.
- Establish how installation waits or asks for reconnection when resources are
  in use, without terminating unrelated Node processes.
- Preserve the saved MCP executable/server paths.
- Verify reconnection uses the new server and still works with the GUI closed.
- Check old-server/new-desktop compatibility during any permitted overlap.
- Do not persist an AppImage's transient mount path in client configuration.

### Preserve user data and pending writes

Test that projects, Markdown files, settings and the MCP project-access registry
survive the upgrade. Installation should replace application resources without
rewriting project content. Any future data-format migration needs a separate
compatibility and recovery decision.

The desktop already waits for pending app-state saves when quitting. The updater's
shutdown path must be tested with that behavior rather than assuming an immediate
quit is safe.

## Suggested implementation sequence

1. Decide release visibility, supported targets and signing credentials.
2. Complete installer publishing with increasing application versions, tied to
   tested commits and complete release assets.
3. Add the updater in the desktop main process, exposing only named status and
   user-action operations through the existing preload/IPC contract.
4. Add update status and restart controls; handle offline and failed downloads.
5. Resolve the MCP process/path behavior and prove Windows version A to version B.
6. Repeat installed-upgrade validation for every advertised platform.
7. Consider beta channels and staged rollout only when the basic path is proven.

Do not promise automatic rollback initially. Define recovery for a bad release,
including a higher-version corrective release and compatibility with any data
changes.

## Acceptance evidence needed before release

- Install version A, publish a complete version B, and update through the app
  without manually downloading an installer.
- Verify the resulting app and bundled MCP versions.
- Repeat with the MCP server active, then reconnect with the desktop closed.
- Preserve project files, settings, access permissions and saved client commands.
- Test restart deferral, pending saves, offline checks, interrupted downloads and
  rejected or invalid update artifacts.
- Verify the right architecture and stable channel are selected.
- Ensure a failed build or partial upload never advertises an unusable release.
- Record actual installer and upgrade results separately for each supported OS.

## Decisions still open

- Are binaries public, even if the source repository is private?
- Which operating systems, architectures and Linux package formats are supported?
- Should downloads be automatic or requested by the user?
- Should installation happen only after explicit restart, or also on normal quit?
- What should users see when an active MCP client prevents safe replacement?
- Are beta channels needed for the first release?

This document records findings and proposed checks. It does not authorize
implementation, change ticket status, or claim a tested automatic-update path.
