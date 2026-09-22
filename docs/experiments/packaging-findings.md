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
