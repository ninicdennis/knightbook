# Working on the Knightbook repository

Instructions for AI tools changing this repository's code. The
[README](README.md) describes what exists; the
[specification](docs/project-workspace-spec.md) and
[technical design](docs/project-workspace-technical-design.md) are authoritative for
behaviour and decisions. Read the relevant section before changing behaviour, and
record new decisions there (numbered, dated, with reasoning), not only in a ticket.

## This project's own board

This repository tracks its work in Knightbook itself: `.projectspace/` holds the
board, and `docs/` plus `README.md` are its documents. Work tickets through the
`knightbook` MCP tools following [`skills/projectspace/SKILL.md`](skills/projectspace/SKILL.md):
start only when asked, hand off in Verification with a handoff note, and never
decide Done or claim a review.

- Never hand-edit files in `.projectspace/`. The app and the MCP server write them
  byte for byte under a shared lock and revision check; go through the tools. In
  Claude Code a hook in `.claude/settings.json` blocks such edits, and another flags
  code files past 300 and 400 lines.
- Before handing off, follow the `handoff` skill (`.claude/skills/handoff/`). It runs
  the `verifier` agent (`.claude/agents/verifier.md`), which checks each acceptance
  criterion against a test whose data actually triggers it.
- `.projectspace/runtime/` and `.projectspace/.write-lock` are coordination state,
  ignored by Git. Everything else in `.projectspace/` is project content and is
  committed.
- If something outside the current ticket needs doing, create a ticket for it rather
  than growing the change.

### One ticket, one branch, one commit

Several tickets in one session and one working tree end as an uncommitted pile that
has to be split by hand, and one rejected ticket holds up the rest.

- **One ticket per session.** When asked to take several, offer to start a separate
  session per ticket, each in its own Git worktree (a new worktree needs
  `pnpm install --frozen-lockfile` first). If the user wants them here instead, work
  them one after another, each on its own branch.
- **One branch per ticket:** `feature/<short-name>`, cut from `main`, or from the
  prerequisite's branch when the ticket builds on work not yet merged. Say which.
- **Write the test plan before the code.** List each acceptance criterion with the
  test that will fail without it, and the data that makes the case happen (two
  releases with different dates, a 0.10.0 beside a 0.9.0, a closed `<details>`). A
  criterion about what prose says is settled by reading; a check only a person or
  another OS can do is manual. Mark those instead of writing a test that only finds
  a heading.
- **Commit at handoff**, as the `handoff` skill's last step: one Conventional
  Commit for the ticket on its branch, including its `.projectspace/` record. Never
  push, open a pull request, merge, or commit to `main` unless asked.

## Commands

Node 24 and pnpm (the version pinned in `package.json`, via corepack).

| Command | What it does |
| --- | --- |
| `pnpm install --frozen-lockfile` | Install exactly what the lockfile says |
| `pnpm check` | Lint (Oxlint), format check (Prettier), typecheck, every test suite. Run before handing off |
| `pnpm build:mcp` | Bundle the MCP server to `packages/mcp/dist/server.mjs` |
| `pnpm pack:dir` | Build and produce the unpacked app under `apps/desktop/release/` |
| `pnpm pack:dir:mac` | The same on macOS for both CPUs (arm64 and x64); CI's macOS job uses it |
| `pnpm pack:installers --win` | Build the installers (`--mac`, `--linux deb` on those hosts) under `apps/desktop/release/`; the release build uses it |
| `printf '%s\n' "<title>" \| pnpm exec commitlint` | Check a commit message or PR title is a Conventional Commit |
| `pnpm start:packaged` | Open the last packaged app; rebuilds nothing |
| `pnpm preview:board` | Board against stub data at `http://localhost:5199`, for layout review |
| `pnpm dev:website` / `pnpm preview:website` | The Astro website at `http://localhost:4321`, live or as built |
| `pnpm --filter <package> test` | One package's tests, e.g. `@knightbook/core` |

CI (`.github/workflows/ci.yml`) has two jobs. `check` runs install, `build:mcp` and
`check`; only if it passes, `package` runs `pack:dir` (`pack:dir:mac` on macOS) and then the packaged-app tests
(`test:packaged` in `experiments/packaging`) with `REQUIRE_PACKAGED_APP=1`, keeping a
screenshot and the app's output when the window test fails. Pull requests run on
Linux only. Windows and macOS are checked on merge to `main` and on a manual run
("Run workflow" on the Actions tab), not on every pull request, to stay inside the
free Actions allowance. Windows is where the app is used, so start a manual run on
the branch before merging anything platform-sensitive (window chrome, paths,
packaging). Locally the packaged-app tests skip when no package exists; say so if
you did not package.

On a merge to `main` that changes the desktop app (D-041: `apps/desktop`, `packages`,
`skills/projectspace` or the build setup, listed in
`apps/desktop/scripts/publishing/app-commits.mjs`), the release workflow
(`.github/workflows/release.yml`) calls CI for all three platforms. Website, docs and
board merges start no release, and their commits never count toward the version. When the merged commit is a Conventional Commit it first
chooses the next version with semantic-release, has CI build the installers stamped
with it (`pack:installers`), and then publishes a GitHub prerelease with every
installer and a `SHA256SUMS.txt`. A manual CI run given a version builds the
installers on a branch without publishing them. A separate workflow,
`pr-title.yml`, checks pull-request titles with commitlint. How a release is chosen,
retried and recovered is in [release automation](docs/proposals/release-automation.md).

## Layout

```text
packages/core      Records, safe writes, dependencies, completion, documents, search, review
packages/mcp       The stdio MCP server; bundles packages/core
apps/desktop       Electron: src/main (host), src/preload, src/renderer (Mantine board), src/shared (contract)
apps/website       The public website: static Astro, src/layout (frame, tokens) and src/pages
skills/projectspace  The workflow skill shipped to AI tools
experiments/       Editor-preservation and packaging experiments, kept as regression tests
docs/              Specification, technical design, research, experiment findings
```

## Rules the architecture depends on

- **One source of truth for records.** Validation and writes live in
  `packages/core`, used by both the desktop host and the MCP server. Never add a
  second implementation in the app or the server; extend core and call it from both.
- **The renderer has no filesystem or shell access.** It reaches the host only
  through the named operations in `apps/desktop/src/shared/contract.ts`, handled by
  `ipcMain.handle` in `src/main`. New capabilities add a contract operation.
- **Writes carry the revision the caller read.** A stale write must return a
  conflict, never overwrite. Keep this for every new mutation, in the app and MCP.
- **Only the user decides Done or records a review.** No MCP tool may mark content
  reviewed, and `ticket_update` must not set Done. See "Three rules the code
  enforces" in [Using Knightbook with AI tools](docs/using-knightbook.md).
- **Document content is untrusted.** Rendering stays sanitized, links are classified,
  only in-project raster images are shown, read by the host after its checks and
  handed over as data URLs; remote, `data:` and SVG images never load (D-034).
  `renderer/markdown/markdown.test.tsx` covers each case.
- **The skill must match the tools.** `packages/mcp/src/guidance.test.ts` fails when
  `skills/projectspace/SKILL.md` and the real tool list drift. Update the skill in the
  same change as the tools.

## Conventions

- Files stay under 400 lines, ideally under 300; split before adding to a file near
  the limit. `App.tsx` and the MCP ticket tools were split for this.
- Source is grouped by feature, not by file type (decision D-027). A feature's
  components, hooks, helpers, CSS and tests share one folder, such as
  `renderer/tickets/`; there are no `components/`, `hooks/` or `styles/` folders.
  - Tests sit beside the code they cover. A scenario test for a whole feature goes
    in that feature's folder. Shared fixtures and setup live in a `test/` folder.
  - Only entry points (`main.tsx`, `App.tsx`, `index.ts`, `index.html`) and
    cross-cutting glue stay at a package's root.
  - Split a folder by sub-feature once it passes about 20 files. Don't create a
    feature folder for fewer than three; fold a small feature into its nearest
    neighbour instead. `test/` is the exception.
  - Move files with `git mv` so history follows them, and keep moves in their own
    change, apart from behaviour changes.
- Prettier leaves Markdown and `.projectspace/` alone on purpose; prose is written by
  hand. Match the plain, specific voice of the existing docs.
- The product is Knightbook, but `.projectspace/` and the `projectspace` skill name
  keep the old name deliberately (decision D-020): renaming them would migrate users'
  own files. Do not "fix" them.
- UI copy states what was observed, not what is assumed: unknown is not "off", and
  missing data never looks like zero or success.
- Work on a `feature/<name>` branch per ticket and commit there at handoff (see "One
  ticket, one branch, one commit"). Pushing, pull requests and merging are the
  user's unless asked.
- Commit messages and pull-request titles are
  [Conventional Commits](https://www.conventionalcommits.org/): `feat: …`, `fix: …`,
  `docs: …`, `refactor: …`, `test: …`, `ci: …`, `chore: …`, with `!` after the type
  (or a `BREAKING CHANGE:` footer) for a breaking change. Pull requests are
  squash-merged, so the title becomes the commit on `main`, and the release workflow
  reads it to choose the version (D-040): `feat` is a minor release, `!` a major one,
  every other type a patch, but only when the merge changes the app (D-041). A title that is not a Conventional Commit fails the
  `Pull request title` check and would release nothing. When suggesting or writing a
  title or message, check it with `printf '%s\n' "<title>" | pnpm exec commitlint`.
  Releases are only ever published by the workflow; never create tags or GitHub
  Releases by hand.

## Gotchas

- `packages/mcp/dist/server.mjs` is only as new as the last `pnpm build:mcp`. The
  copies under `apps/desktop/resources/mcp-<arch>/` and `apps/desktop/release/` are staged at
  packaging time and lag further. A connected client keeps running the build it
  started with; reconnect after rebuilding.
- `pnpm preview:board` must run from the repository root script (it filters to
  `apps/desktop`); starting Vite elsewhere cannot resolve React.
- The formatted editor is blocked on a Milkdown fix (ticket `b217a95f`);
  `experiments/editor-preservation/src/limitations.test.ts` starts failing when a
  fixed release ships. That failure is good news, not a regression.
- macOS and Linux are built and tested in CI, but the app window has not been
  launched on either. Do not claim cross-platform behaviour you only saw on Windows.
