# Packaging smoke test — findings

Status: validated on Windows, 2026-09-19. Answers the "Independent packaging" row
of [Technical Design v0.3](../project-workspace-technical-design.md) section 11,
and supports decision **D-008** (MCP without an open window).

Reproduce with `pnpm --filter @knightbook/experiment-packaging test`. The
packaged-build checks need `pnpm --filter @knightbook/desktop pack:dir` first
and skip themselves when it is absent.

## Result

The recommended simple path works, including against a real
`electron-builder --dir` build. An AI client starts the shipped Node runtime
directly, by its installed path, with **no Node on PATH and no Electron process
in existence**, and drives a complete ticket lifecycle against real files.

15 checks pass. 12 against a staged resource layout, 3 against the actual
packaged application.

| Check | Evidence |
| --- | --- |
| Runtime installs outside the ASAR | `resources/app.asar` beside `resources/mcp/node.exe` and `server.mjs` |
| Starts with no system Node | Launched with every Node, fnm, nvm, pnpm and volta entry stripped from `PATH` |
| Starts with no GUI | No Electron process is started at any point in either test file |
| Serves the MCP surface | `listTools` returns the section 9 operations over stdio |
| Initializes a project | `.projectspace/project.md` written with `schema_version: 1` |
| Full lifecycle | create → in progress → verification → completion, all through MCP |
| Cannot reach Done generically | `ticket_update` with `status: done` is refused |
| Cannot self-certify | Completion without `user_instructed_completion` is refused from Verification |
| Records honest provenance | `decision_source: reported_user_instruction`, `recorded_by: agent` in the file |
| Detects a stale write | A write on a pre-completion revision returns `revision_conflict` |
| Survives reconnection | A fresh connection reads what the previous one wrote |
| Survives an app update | Replacing the installed resources leaves the saved client command working |
| Does not create projects implicitly | An uninitialized folder reports `initialized: false` |

## What the design got right

The `extraResources` approach needs no background service, no network listener,
and no system Node. Because the client owns the process lifetime, "the app window
is closed" is not a state the server has to handle — the desktop app is simply
not involved. That is a stronger guarantee than the specification asked for.

Binding the root to `--root` at launch, rather than accepting it per call, also
held up: the uninitialized-folder case reports `initialized: false` instead of
implicitly creating a project somewhere the user did not choose.

## Two configuration defects this caught

Both would have shipped a broken application, and neither is visible without
actually packaging.

**The workspace library was left as a bare import.** electron-vite externalizes
anything listed in `dependencies` for the main and preload builds, so
`@knightbook/core` resolved at build time and would have thrown at runtime
inside the ASAR, where no `node_modules` exists. Neither `ssr.noExternal` nor
`resolve.noExternal` overrode it; moving the package to `devDependencies` is what
works, which is accurate anyway since it is bundled rather than installed. The
main bundle went from 4.6 kB to 436 kB once it was actually included.

**pnpm's strict linking hides Electron from its own build tools.** electron-vite
and electron-builder call `require.resolve('electron/package.json')` from their
own install directory. The workspace needs `publicHoistPattern: [electron]` for
either to run at all.

## The size cost

| Part | Size |
| --- | --- |
| Packaged application total | 458 MB |
| Shipped Node runtime | 90 MB (20%) |
| Bundled MCP server | 1.6 MB |
| Application code (`app.asar`) | 0.4 MB |

The design called the extra runtime "the small cost of the simple route." On
Windows it is 90 MB against a 458 MB total, so it is a fifth of the download
rather than a rounding error. It is still the right trade for a first version —
the alternatives couple MCP launch to Electron's executable and fuses, or depend
on a Node feature its own documentation still labels active development — but the
number is worth knowing before committing to it for every release.

## Per-target runtime staging (2026-09-20)

`scripts/stage-mcp-runtime.mjs` used to copy the Node running the build, which is
only the right binary when the build host is the target. It now stages for a named
target — `--platform` and `--arch`, defaulting to this machine, and `--out` for a
directory other than the one electron-builder installs from.

The build host's own Node is reused only when the platform, the CPU **and** the
version all match the one the project ships, pinned as `NODE_VERSION` in
`scripts/node-runtime.mjs`. Pinning it is the point: without it the application
carries whichever Node the person who ran the build happened to have, so two builds
of the same commit do not contain the same thing. Anything else is downloaded from
`nodejs.org/dist`, checked against that release's `SHASUMS256.txt`, and unpacked
only if the hash matches; a mismatch throws and stages nothing. Downloads are
cached under `apps/desktop/node_modules/.cache/knightbook-runtimes`, keyed by
version and target.

What that check is worth: it proves the bytes are what nodejs.org published over
TLS. It is **not** a signature check. Node signs `SHASUMS256.txt` separately with
GPG, and verifying that needs a trusted key shipped with this repository. That is a
real gap, and it is named here rather than implied away.

Unpacking uses `tar`, which reads both formats on Windows and macOS; GNU tar on
Linux does not read zip, so a Windows target built there falls back to `unzip`. The
archive is named relative to the working directory rather than absolutely, because
GNU tar reads a leading `C:` as a remote host — which is how this first broke on
Windows, where Git ships its own tar ahead of the system one.

**The executable bit is the one thing a Windows host cannot give.** The tarball
carries it and a zip does not, so the script sets it explicitly — but NTFS has no
executable bit to set, so a Linux or macOS runtime staged on Windows is packaged
without one and the installed application could not start its own server. The script
warns loudly in that case. It is not a problem for releases, because CI builds each
target on its own runner; it is a limit on checking a cross-build by hand.

Verified on Windows: a `linux-x64` runtime downloaded, checksum-verified, unpacked
and staged as a real ELF x86-64 binary, and a second run served it from the cache
without downloading. The host path still reuses the build machine's own Node when
it matches the pin. Ten tests cover the target and archive naming, the supported
target list, the host-reuse rule, a checksum that is absent, a checksum that does
not match, and a download that 404s; the one that really fetches from nodejs.org is
off unless `STAGE_RUNTIME_NETWORK=1`.

## One runtime per architecture (2026-09-29)

The mac target packages arm64 and x64 in one electron-builder run, and staging used
to fill one `resources/mcp/` folder that both packages copied. On the Apple silicon
runner both DMGs would have carried the arm64 Node, so the Intel app could not start
its MCP server (ticket `41d9ba34`, option 1 in `docs/proposals/platform-support.md`).

Staging now writes each architecture to its own folder, `resources/mcp-<arch>/`,
and `extraResources` reads `resources/mcp-${arch}`, which electron-builder expands
for each architecture it packages. The installed folder is still `mcp`, so the
command a user saved in their client does not change. A macOS stage fills both
folders unless `--arch` names one (`--arch` now takes a comma-separated list), and
`--out` now names the resources folder the `mcp-<arch>` folders go in. The mac
architecture list lives in `MAC_ARCHES` in `scripts/node-runtime.mjs`, and a test
fails if it and the mac target in `electron-builder.yml` disagree. The unpackaged
app reads `resources/mcp-<its own arch>`. An old `resources/mcp/` folder from
earlier builds is left where it is, since an AI client may be running from it; it
is ignored by Git and no longer packaged.

The CPU is read from the executable header (`scripts/binary-architecture.mjs`:
Mach-O, ELF and PE), because the file is called `node` either way. Staging refuses
a runtime whose header names another CPU. `packaged-architecture.test.ts` compares
each packaged app's Node with the app's own executable, which Electron builds per
architecture, and `architecture.test.ts` runs the same rule on fake Mach-O packages
so that a shared runtime and a swapped pair are shown to fail on any machine.

Verified on Windows 10 x64 (2026-09-29): the staging script run with
`--platform=darwin` into a scratch folder downloaded and checksum-verified both
macOS runtimes and staged `mcp-arm64/node` as an arm64 Mach-O and `mcp-x64/node` as
an x86-64 Mach-O, read from their headers. The live download test does the same for
both when `STAGE_RUNTIME_NETWORK=1`. A Windows `electron-builder --dir` packaged from
`resources/mcp-x64` into `resources/mcp`, and the packaged Node and `Knightbook.exe`
are both x64 PE.

Not verified on Windows: a macOS package. electron-builder does not build macOS
apps on Windows, so neither DMG was produced here.

On the macOS CI runner (manual run 36585090697, 2026-09-29, Apple silicon
`macos-latest`), staging filled both `mcp-arm64` and `mcp-x64`, but
`electron-builder --dir` packaged only `mac-arm64`: `--dir` without an
architecture builds the runner's own CPU. The Intel app was never packaged, so the
packaged test passed on half the release. The user chose on 2026-09-29 to package both in CI rather
than leave the Intel app to a release build; the macOS package job was about a
minute in total, and Mac jobs run only on merges and manual runs. CI's macOS job now runs
`pnpm pack:dir:mac` (`--dir --mac --arm64 --x64`), and under
`REQUIRE_PACKAGED_APP` on macOS `packaged-architecture.test.ts` fails unless both
CPUs were packaged. The suites that start the server or the window pick the package
for the runner's own CPU, so none of them depends on Rosetta. A separate CI step
starts the Intel Node with `arch -x86_64` and is allowed to fail: it records
whether Rosetta was there, and is not a gate (ticket `eca73450`).

Checked in manual run 36589398153 (attempt 2, 2026-09-29): the macOS job packaged
`arch=x64` into `release/mac` and `arch=arm64` into `release/mac-arm64`, both
tests in `packaged-architecture.test.ts` ran and passed, and the Intel Node read as
a Mach-O x86_64 binary and printed `v24.19.0` under `arch -x86_64`, so Rosetta was
available on that runner. Only `--version` was run under Rosetta; the Intel app's
MCP server and window were not started.

## What this does not establish

- **macOS and Linux.** This ran on Windows only. The layout and launch command
  are platform-independent, and each platform's runtime binary is now staged for
  it, but executable permissions and signing still need the same test to run
  there, and the row is not complete until it does. On Linux the design's warning about portable formats with a
  transient mount path still applies: the saved client command must point at a
  persistent install location.
- **An installer.** This used `--dir`, which skips NSIS, DMG, AppImage and deb.
- **Code signing and notarization**, which affect whether the shipped runtime is
  allowed to execute at all on macOS.
- **Clean shutdown under a client that kills rather than closes the transport.**
  Every connection here closed normally.

## The rename to Knightbook (2026-09-20)

Two things about packaging changed with the product name, and one of them was only
found by looking at a running process.

**The state directory was not where the name suggested.** The app never called
`app.setName`, so Electron fell back to the `name` in package.json and the installed
app kept its settings and recent projects in `%APPDATA%/@projectspace/desktop` —
scope included — rather than in `%APPDATA%/Projectspace`. A migration written
against the obvious path would have found an older, staler file there and adopted
it over the real one. The app now names itself explicitly, so the directory is
`Knightbook` on every platform in both development and packaged runs, and the
migration checks the scoped path first and the older one second.

**The installed path changed, so saved MCP client configurations break.** The
folder is named after the product. A command saved while this was Projectspace
points somewhere the new install does not use; the client fails to start the server
rather than reaching a wrong one. Re-copy the configuration from the status bar
after upgrading. The server reports itself as `knightbook` now.

`.projectspace/` inside each project is deliberately unchanged. It is written into
every project anyone has already made, and renaming it would be a migration of the
user's own files rather than of this product.

## One shared connection for enabled projects (2026-09-22)

`experiments/packaging/src/shared-connection.test.ts` launches the staged runtime and
bundled server with `--registry <file>` the way a client would — no system Node, no
Electron — and writes the access list the way the app does. It covers: two projects
plus a clone with the same project id and name, listed separately by path; two
concurrent client processes each writing to their own checkout; a missing, unknown, or
path-shaped `checkout_id` refused rather than resolved to a project; a project enabled
and then revoked while a client stays connected, with no reconnect or configuration
change; a stale revision still refused after targeting; a fresh process reaching the
same checkout by the same id; the shared heartbeat recorded beside the registry and
activity recorded in the project used, with no per-project session record; a moved
folder reported as unavailable and not rebound to its clone; a corrupt registry
reaching nothing and left untouched; and a `--root` connection next to it staying
bound to its own folder and ignoring a `checkout_id`.

What this does not cover: a packaged installer build with the app's own user-data
path (the test stages the runtime and writes the registry itself), and a real AI
client driving the new configuration.

## The Linux deb in a test container (2026-10-21)

Written for the installation guide (ticket `6281905f`). This is not the Linux
validation (ticket `b2a51f35`): the package was a local build, not the published
release asset, and the machine was a container with no desktop.

Built with `pnpm pack:installers --linux deb` (version 0.0.0; the run then stopped at
electron-builder's update metadata, which needs a repository it could not detect, after
the deb was written) and again with `-c.extraMetadata.version=0.0.1`. Installed on
Ubuntu 24.04.5 LTS in a cloud container, x64, with Xvfb and no desktop environment,
no AppArmor and no system D-Bus.

| Check | What was seen |
| --- | --- |
| Package | `knightbook`, `Architecture: amd64`, file `Knightbook-0.0.0-linux-amd64.deb`, 134 MB, 418 MB installed |
| Install | `apt install ./…deb` pulled the libraries it depends on; `dpkg -i` alone left it unconfigured because `libsecret-1-0` was missing. No publisher or signature warning |
| Where it goes | `/opt/Knightbook`, a launcher at `/usr/share/applications/@knightbookdesktop.desktop` (Name Knightbook, Categories Development) and the command `/usr/bin/@knightbookdesktop` |
| First launch | Started as an ordinary user under `xvfb-run` and kept running until stopped; the window was not looked at. Settings appeared in `~/.config/Knightbook` (`app-state.json` and Chromium's caches) |
| MCP command | The app logged `/opt/Knightbook/resources/mcp/node` with `server.mjs` and `--registry ~/.config/Knightbook/mcp-access.json` |
| MCP with the app closed | With no app process and only `/usr/bin:/bin` on `PATH` (no Node there), the installed runtime with `--root` initialized a project, created a ticket and listed tickets |
| Upgrade | 0.0.1 unpacked over 0.0.0 in place; `app-state.json` unchanged, and the same MCP command still served the project |
| Remove | `apt remove` deleted `/opt/Knightbook`, the launcher and the command. `~/.config/Knightbook` and the project's `.projectspace/` stayed |
| Purge | `apt purge` removed nothing more; `~/.config/Knightbook` stayed |

Two names come from the package name `@knightbook/desktop` rather than the product
name: the executable and launcher are `@knightbookdesktop`. The same rule makes
electron-builder's per-user Windows install folder `%LOCALAPPDATA%\Programs\@knightbookdesktop`
(read from the NSIS template and electron-builder 26.15.3's `getWindowsInstallationDirName`;
not seen on Windows). Both are saved in users' MCP configurations, so changing them
after the first public release breaks those configurations.

Not covered: a real desktop and its menu, the window itself, a real AI client, the
AppArmor profile the package installs on Ubuntu 24 and later, and the published release
asset.
