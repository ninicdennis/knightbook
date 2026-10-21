# Platform support: OS versions, architectures, Linux formats

Status: decided. The user accepted the recommendation below on 2026-09-25; it is
recorded as D-028 in the specification (ticket `6b200e68`). The follow-up work is
tickets `41d9ba34` (macOS runtime per architecture) and `68f54f52` (AppImage MCP
helper). MCP process setup and lifecycle, the other half of open decision 6, is not
covered here.

## Where things stand

- `apps/desktop/electron-builder.yml` lists Windows x64 NSIS, macOS arm64 and x64
  DMG, and Linux x64 AppImage and deb. These are configured, not validated.
- Only the unpacked Windows build (`--dir`) has been exercised. No installer has
  been built, and the app window has not been opened on macOS or Linux.
- The app is on Electron 44.4.2. `scripts/node-runtime.mjs` pins Node 24.19.0 as
  the MCP runtime and can fetch it for `win32-x64`, `darwin-x64`, `darwin-arm64`,
  `linux-x64` and `linux-arm64`.
- CI runs on `windows-latest`, `ubuntu-latest` and `macos-latest`. The last is an
  Apple silicon runner. Since D-031 (2026-09-26), pull requests run on Linux only;
  all three run on merge to `main` and on a manual run.

## Minimum OS versions

Electron 44's README states its own floor: macOS Ventura (13) and up, Windows 10
and up, and on Linux "major Linux distributions … in versions that are still
supported by both Chromium and the distro maker". Node 24's floors are no higher.

| Option | Cost |
| --- | --- |
| **Follow Electron's floor** | Nothing extra. The floor moves when Electron is upgraded, so an upgrade can drop an OS; the release notes must say so. |
| Set a stricter floor | Less to test, but it would turn away machines the app runs on, for no technical reason. |
| Promise an older floor | Not possible without pinning an old Electron and losing security updates. |

Linux has no version number to promise. The honest statement is Electron's: current,
maintained releases of Ubuntu, Debian and Fedora, tested on the CI runner's Ubuntu.

## Architectures

| Target | Cost |
| --- | --- |
| Windows x64 | Built and tested on `windows-latest` today. Runs on Windows arm64 through emulation, unsupported. |
| macOS arm64 | Native on the `macos-latest` runner. |
| macOS x64 | Needs the right Node binary (below), and an Intel machine or Rosetta to run it. |
| Linux x64 | Built and tested on `ubuntu-latest` today. |
| Windows, Linux arm64 | An extra build per platform, and an arm64 runner to test on. Not asked for. |

### Why macOS would ship the wrong Node binary

`pnpm build` stages one Node binary into `resources/mcp/`, for one target (the
build machine unless `--platform` and `--arch` say otherwise). `electron-builder`
then copies that one folder into every architecture it builds in the same run. The
mac section asks for `arm64` and `x64` together, so on the Apple silicon runner both
DMGs would carry the arm64 Node. The Intel app would open, because Electron itself
is built per architecture, but its MCP server could not start: an arm64 binary does
not run on an Intel Mac.

Ways to fix it, cheapest first:

1. **Stage per architecture.** Stage each runtime into `resources/mcp-<arch>/` and
   point `extraResources` at `resources/mcp-${arch}`; electron-builder expands the
   `${arch}` macro per architecture. One build job still produces both DMGs, and a
   test can check each package carries the binary for its own CPU.
2. **Build each architecture separately.** Run `electron-builder --mac --arm64` and
   `--mac --x64` one after the other, staging the matching runtime before each.
   No config change, but two builds and more script.
3. **Universal binary.** Merge both Node binaries with `lipo` and ship one universal
   app. Twice the download for everyone, and more signing surface.

## Linux package formats

| Format | Cost |
| --- | --- |
| **deb** | Installs to a fixed path, so the saved MCP command stays valid across updates. Covers Debian and Ubuntu. |
| **AppImage** | Runs from a temporary mount (`/tmp/.mount_…`) that changes every launch. Until 2026-10-06 `mcpLaunchCommand` built the saved command from `process.resourcesPath`, inside that mount, so the copied configuration broke after the app closed. It now names a persistent copy (below). |
| rpm | A third package to build and test on Fedora. Not asked for. |

### Making AppImage work

The technical design already names the way out: put the helper at a persistent
location. When the app is running as an AppImage (Electron sets `APPIMAGE`), it
copies `node` and `server.mjs` from the mount into the app's user data folder,
replacing them only when they differ, and `mcpLaunchCommand` names that copy. The
server then runs with the app closed, and an updated AppImage refreshes the copy on
its next launch. The cost is a small main-process change with tests, and one known
limit: after an AppImage update, a client keeps the old server until the new
AppImage has been opened once.

The copy was built on 2026-10-06 (ticket `68f54f52`); how it behaves is in
technical design section 2, "The AppImage copy as built". It has not yet been run
from a real AppImage on Linux.

## Recommendation

- Follow Electron's floor: Windows 10+, macOS 13 Ventura+, maintained Linux
  distributions.
- Ship Windows x64, macOS arm64 and x64, Linux x64. Other arm64 builds stay out
  until someone asks.
- Fix the macOS runtime with per-architecture staging (option 1).
- Ship deb first. Add AppImage once the persistent-copy change exists and has been
  checked on Linux; until then it is not offered.
- Drop rpm for now.
