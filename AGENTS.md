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
  byte for byte under a shared lock and revision check; go through the tools.
- `.projectspace/runtime/` and `.projectspace/.write-lock` are coordination state,
  ignored by Git. Everything else in `.projectspace/` is project content and is
  committed.
- If something outside the current ticket needs doing, create a ticket for it rather
  than growing the change.

## Commands

Node 24 and pnpm (the version pinned in `package.json`, via corepack).

| Command | What it does |
| --- | --- |
| `pnpm install --frozen-lockfile` | Install exactly what the lockfile says |
| `pnpm check` | Lint (Oxlint), format check (Prettier), typecheck, every test suite. Run before handing off |
| `pnpm build:mcp` | Bundle the MCP server to `packages/mcp/dist/server.mjs` |
| `pnpm pack:dir` | Build and produce the unpacked app under `apps/desktop/release/` |
| `pnpm start:packaged` | Open the last packaged app; rebuilds nothing |
| `pnpm preview:board` | Board against stub data at `http://localhost:5199`, for layout review |
| `pnpm --filter <package> test` | One package's tests, e.g. `@knightbook/core` |

CI (`.github/workflows/ci.yml`) runs install, `build:mcp`, `check` and `pack:dir` on
Windows, Linux and macOS, then reruns the packaging tests with
`REQUIRE_PACKAGED_APP=1`. Locally those tests skip when no package exists; say so
if you did not package.

## Layout

```text
packages/core      Records, safe writes, dependencies, completion, documents, search, review
packages/mcp       The stdio MCP server; bundles packages/core
apps/desktop       Electron: src/main (host), src/preload, src/renderer (Mantine board), src/shared (contract)
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
  reviewed, and `ticket_update` must not set Done. See the README's "Three rules the
  code enforces".
- **Document content is untrusted.** Rendering stays sanitized, links are classified,
  images are not fetched. `markdown.test.tsx` covers each case.
- **The skill must match the tools.** `packages/mcp/src/guidance.test.ts` fails when
  `skills/projectspace/SKILL.md` and the real tool list drift. Update the skill in the
  same change as the tools.

## Conventions

- Files stay under 400 lines, ideally under 300; split before adding to a file near
  the limit. `App.tsx` and the MCP ticket tools were split for this.
- Prettier leaves Markdown and `.projectspace/` alone on purpose; prose is written by
  hand. Match the plain, specific voice of the existing docs.
- The product is Knightbook, but `.projectspace/` and the `projectspace` skill name
  keep the old name deliberately (decision D-020): renaming them would migrate users'
  own files. Do not "fix" them.
- UI copy states what was observed, not what is assumed: unknown is not "off", and
  missing data never looks like zero or success.
- Work on a `feature/<name>` branch and leave commits and PRs to the user unless
  asked.

## Gotchas

- `packages/mcp/dist/server.mjs` is only as new as the last `pnpm build:mcp`. The
  copies under `apps/desktop/resources/mcp/` and `apps/desktop/release/` are staged at
  packaging time and lag further. A connected client keeps running the build it
  started with; reconnect after rebuilding.
- `pnpm preview:board` must run from the repository root script (it filters to
  `apps/desktop`); starting Vite elsewhere cannot resolve React.
- The formatted editor is blocked on a Milkdown fix (ticket `b217a95f`);
  `experiments/editor-preservation/src/limitations.test.ts` starts failing when a
  fixed release ships. That failure is good news, not a regression.
- macOS and Linux are built and tested in CI, but the app window has not been
  launched on either. Do not claim cross-platform behaviour you only saw on Windows.
