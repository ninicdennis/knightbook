# Packaging smoke test — findings

Status: validated on Windows, 2026-09-19. Answers the "Independent packaging" row
of [Technical Design v0.3](../project-workspace-technical-design.md) section 11,
and supports decision **D-008** (MCP without an open window).

Reproduce with `pnpm --filter @projectspace/experiment-packaging test`. The
packaged-build checks need `pnpm --filter @projectspace/desktop pack:dir` first
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
`@projectspace/core` resolved at build time and would have thrown at runtime
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

## What this does not establish

- **macOS and Linux.** This ran on Windows only. The layout and launch command
  are platform-independent, but each platform needs its own runtime binary,
  executable permissions, and signing, and the row is not complete until the same
  test runs there. On Linux the design's warning about portable formats with a
  transient mount path still applies: the saved client command must point at a
  persistent install location.
- **Cross-platform runtime staging.** `scripts/stage-mcp-runtime.mjs` copies the
  Node running the build, which is only correct for the host platform. A real
  release has to download the matching runtime per target. The script says so
  rather than hiding it.
- **An installer.** This used `--dir`, which skips NSIS, DMG, AppImage and deb.
- **Code signing and notarization**, which affect whether the shipped runtime is
  allowed to execute at all on macOS.
- **Clean shutdown under a client that kills rather than closes the transport.**
  Every connection here closed normally.
