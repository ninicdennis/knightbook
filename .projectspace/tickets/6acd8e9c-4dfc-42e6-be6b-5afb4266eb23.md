---
schema_version: 1
id: 6acd8e9c-4dfc-42e6-be6b-5afb4266eb23
title: "Stage the matching Node runtime for each release target"
status: verification
depends_on: []
created_at: 2026-09-19T20:05:15.184Z
updated_at: 2026-09-21T02:34:50.403Z
related_documents: [ "docs/experiments/packaging-findings.md", "docs/release-automation.md" ]
---

# Per-target runtime staging

## Intended outcome
Release builds ship the Node runtime that matches each OS and CPU.

## Acceptance criteria
- Staging selects or downloads the right runtime with a verified checksum.
- Executable permission is preserved; macOS arm64 and x64 are not built from one host copying its own Node.
- Documented in the packaging findings.

## Notes
stage-mcp-runtime.mjs copies the build host's Node, which is only correct for the host platform.

## Handoff

**What changed.** `scripts/stage-mcp-runtime.mjs` staged the Node running the build,
which is only the right binary when the build host is the target. It now stages for a
named target: `--platform` and `--arch` default to this machine, and `--out` names a
staging directory other than the one electron-builder installs from.

The decision and the fetching live in a new `scripts/node-runtime.mjs`, so the part
worth testing is separable from the part that copies files.

**The rule.** The build host's own Node is reused only when the platform, the CPU
**and** the version all match the runtime this project ships, pinned as `NODE_VERSION`
in `node-runtime.mjs`. Pinning is the point: without it the application carries
whichever Node the builder happened to have, so two builds of one commit would not
contain the same thing. Anything else is downloaded from `nodejs.org/dist`, checked
against that release's `SHASUMS256.txt`, and unpacked only if the hash matches — a
mismatch throws and stages nothing. Downloads are cached under
`apps/desktop/node_modules/.cache/projectspace-runtimes`, keyed by version and target,
so a rebuild does not re-fetch.

**What the checksum is worth, stated rather than implied.** It proves the bytes are
what nodejs.org published over TLS. It is not a signature check: Node signs
`SHASUMS256.txt` separately with GPG, and verifying that needs a trusted key shipped
with this repository. Named in the module comment and in the findings document.

**The executable bit — the one part a Windows host cannot do.** A tarball carries it
and a zip does not, so the script sets it explicitly. NTFS has no executable bit to
set, so a Linux or macOS runtime staged on Windows would be packaged without one and
the installed application could not start its own server. The script now warns loudly
in that case. It does not affect releases, because CI builds each target on its own
runner; it is a limit on checking a cross-build by hand, and it is why `--out` exists.

**One thing that had to be found by running it.** Unpacking uses `tar` (which reads
both formats on Windows and macOS; GNU tar on Linux cannot read zip, so a Windows
target built there falls back to `unzip`). The first live run failed with `tar exited
128`: GNU tar reads a leading `C:` as a remote host, and Git ships its own tar ahead of
the system one on Windows. The archive is now named relative to the working directory,
never absolutely.

**How it was checked.** Ten new tests in `apps/desktop/scripts/node-runtime.test.mjs`,
covering archive naming per platform, every target electron-builder is configured for,
an unsupported target, the host-reuse rule, a checksum that is absent, a checksum that
does not match (and that nothing is staged when it does not), and a download that 404s.
The desktop vitest config now includes `scripts/**/*.test.mjs`; those files ask for the
node environment in their own docblock rather than running under jsdom.

Run for real on Windows, not only in unit tests:
- `--platform=linux --arch=x64` fetched, verified and unpacked a runtime, and `file`
  confirms the staged binary is `ELF 64-bit LSB executable, x86-64`. A second run
  served it from the cache with no download, and the cross-build warning appeared.
- The default (host) run reused this machine's own Node, which is exactly the pinned
  version, and said so.
- An unsupported target (`win32-arm64`) exits 1 with the supported list, instead of a
  stack trace.

Whole workspace green: core 145, MCP 20, desktop 213 (1 skipped), editor-preservation
22 (3 skipped), packaging 28. Lint, formatting and all four typechecks clean. The
findings document has a new "Per-target runtime staging" section, and its "does not
establish" list no longer claims the script copies the host's Node.

**Not verified:**
- **A real `pnpm pack:dir`.** electron-builder was not run; the staging step was
  exercised directly. The Windows build also cannot replace a `node.exe` that a
  connected AI client is running, which is the existing in-use guard, not new here.
- **macOS and Linux as build hosts.** Everything was run on Windows. The chmod path in
  particular has only been reasoned about, not watched, on a host that has a real
  executable bit.
- **The `darwin` and `linux-arm64` archives** were never downloaded — only `linux-x64`
  was fetched for real. The naming for the others is covered by tests, not by a fetch.
- **Nothing was staged into `apps/desktop/resources/mcp`.** Its `node.exe` is untouched;
  every trial went to a temporary directory through `--out`.

**A decision for you.** CI pins `node-version: 24`, which floats, so a CI packaging run
will usually not match `NODE_VERSION` and will download a runtime on each of the three
runners. I left it that way deliberately: it means CI exercises the download and the
checksum on every OS every run, which is the mechanism a release depends on. Pinning CI
to the same exact version would skip the download and make the builds slightly faster,
at the cost of never testing that path. Say which you prefer.

**For you to check:** run `node apps/desktop/scripts/stage-mcp-runtime.mjs
--platform=darwin --arch=arm64 --out=<a scratch dir>` and confirm it downloads, says
"checksum verified", and warns about the executable bit; then run it again and confirm
it uses the cache. A normal `pnpm pack:dir` should behave as it always has and print
which runtime it staged and where it came from.
