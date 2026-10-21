# Knightbook

<img src="docs/assets/knightbook-logo.png" alt="Knightbook: a white chess knight on a navy book cover" width="192" />

Knightbook is a desktop workspace where a person and their AI tools share one
project: its Markdown documents and a Kanban board of tickets, kept as ordinary
files in the repository. AI clients reach it through a bundled MCP server; the
person decides what is done.

Knightbook is free, and its source is available under the
[Functional Source License](#license). Installers for Windows, macOS and Linux are
on the [releases page](https://github.com/ninicdennis/knightbook/releases). To
report a problem, open an [issue](https://github.com/ninicdennis/knightbook/issues/new/choose);
for a security problem, see [SECURITY.md](SECURITY.md).

## What it does

- **A board of tickets** in Backlog, In progress, Verification and Done, with
  dependencies, a manual backlog order, archiving, and search. New tickets come from
  the Backlog column or an AI tool. Only the user can accept work as Done, and each
  acceptance records who decided.
- **Plans** such as an MVP or a launch, whose phases group existing tickets, with
  progress read from the tickets themselves. Create plans, add and arrange phases,
  and attach tickets in the app or through your AI tool.
- **Documents where they already are.** Existing Markdown is included by path and
  rendered read-only, with links between documents and tickets. Editing happens in
  your own editor; an AI tool can also create new documents through MCP.
- **Review you can trust.** Tickets and documents show whether you reviewed them,
  and what changed since. Only a person can record a review.
- **AI access you control.** One MCP configuration reaches the projects you allow,
  and a workflow skill ships with the app to teach AI tools how to work the board.
- **Plain files.** Records live in a `.projectspace/` folder and are safe to commit.
  Every write checks what the writer last read, so a stale write is refused rather
  than overwriting newer work.

The [specification](docs/project-workspace-spec.md) and
[technical design](docs/project-workspace-technical-design.md) are authoritative for
behaviour and decisions.

## Getting started

This section is for building Knightbook from source. To use it, install a release
instead.

You need **Node 24 or newer** and **pnpm 12.4.2**, the version pinned in
`package.json`. Corepack, which ships with Node, provides that pnpm:

```bash
corepack enable
pnpm install --frozen-lockfile
```

The same commands work in PowerShell and in a POSIX shell.

### Run the app

```bash
pnpm --filter @knightbook/desktop dev
```

Starts the real Electron app with hot reload. It opens your most recent project, or
a welcome screen where you can open a folder or set one up.

For the MCP status and **Set up your AI tool** to find the bundled server in
development, build it and stage it beside the app once, and again after changing
`packages/mcp`:

```bash
pnpm build:mcp
pnpm --filter @knightbook/desktop build
```

### Preview the board without Electron

```bash
pnpm preview:board
```

Serves the board against **stub data** at `http://localhost:5199`, for reviewing
layout in a browser. It reads no project and writes nothing. Add `?light` to the
URL for the light scheme.

### The website

The public website is a static Astro site in `apps/website` (decision D-042).

| Command | What it does |
| --- | --- |
| `pnpm dev:website` | Serves the site with live reload at `http://localhost:4321` |
| `pnpm preview:website` | Builds the site and serves the built output at `http://localhost:4321`, as a host would |
| `pnpm --filter @knightbook/website build` | Builds the static site to `apps/website/dist/` |

`pnpm check` typechecks it and runs its tests, which build the whole site and check
the HTML a visitor receives. Website-only merges do not release the desktop app
(D-041).

The site is hosted on GitHub Pages (D-044) and deployed by the
[Website workflow](.github/workflows/website.yml). A pull request that changes the
site gets a preview build as a `website-preview` artifact on its workflow run:
unzip it into `apps/website/dist/` and run `pnpm --filter @knightbook/website preview`
to see it at `http://localhost:4321`. Every
preview page is `noindex` and says it is a preview. A merge to `main` runs the
website's tests, and when the repository variable `DEPLOY_WEBSITE` is `true`, makes
the production build (which refuses drafts) and deploys it. To roll back, open the
Website run for the earlier commit on `main` in the Actions tab and choose
**Re-run all jobs**; it builds and deploys that commit again.

## Checks

```bash
pnpm check
```

Runs the linter (Oxlint), the formatting check (Prettier), typecheck, and every
test suite. Run it before handing off a change. `pnpm format` rewrites code to the
project style; it leaves Markdown and `.projectspace/` alone on purpose.

[CI](.github/workflows/ci.yml) runs install, `pnpm build:mcp` and `pnpm check`
first. Only when those pass does it run `pnpm pack:dir` and the packaged-app tests
against the real package with `REQUIRE_PACKAGED_APP=1`, so they fail rather than
skip when no package exists. Locally they skip without one. Pull requests run on
Linux only; pushes to `main` and manual runs (Actions tab, "Run workflow") run on
Windows, Linux and macOS.

## Packaging

```bash
pnpm pack:dir
```

Builds the MCP server and the app, and produces an unpacked application under
`apps/desktop/release/`. Close any copy of Knightbook running from that folder
first, and stop any AI client running its bundled MCP server: packaging replaces
it. On Windows, `pack:dir` checks this before building and refuses, listing the
files in use, rather than leaving the folder half-deleted.

```bash
pnpm start:packaged
```

Opens the last packaged app and rebuilds nothing; it prints the path and when it
was packaged.

To run the packaged-app tests against that package the way CI does (a failing
window test leaves a screenshot and log in `experiments/packaging/test-results/`):

```bash
REQUIRE_PACKAGED_APP=1 pnpm --filter @knightbook/experiment-packaging test:packaged
```

In PowerShell, set the variable first:

```powershell
$env:REQUIRE_PACKAGED_APP = '1'
pnpm --filter @knightbook/experiment-packaging test:packaged
```

## Connecting an AI tool

In the app, click the MCP status in the bar along the bottom of the window and
choose **Set up your AI tool**. It copies the one configuration your client needs,
lets you allow each project, and installs or exports the workflow skill for Claude
Code, Codex, or any other client. [Using Knightbook with AI tools](docs/using-knightbook.md)
covers what each step does, what the status bar can observe, and the rules the code
enforces.

## Layout

```text
packages/core        Records, safe writes, dependencies, completion, documents, search, review
packages/mcp         The stdio MCP server; bundles packages/core
apps/desktop         Electron app: main process, preload bridge, Mantine board
skills/projectspace  The workflow skill shipped with the app
experiments/         Editor-preservation and packaging experiments, kept as regression tests
docs/                Specification, technical design, guides, research, experiment findings
```

`packages/core` is used by both the desktop host and the MCP server, so the two
cannot validate records differently. The renderer reaches the host only through
the named operations in `apps/desktop/src/shared/contract.ts`.

The `.projectspace/` folder and the `projectspace` skill keep an earlier name on
purpose, because renaming them would migrate files in every existing project
([D-020](docs/project-workspace-spec.md#accepted-decisions)).

## Documentation

| Document | What it covers |
| --- | --- |
| [Using Knightbook with AI tools](docs/using-knightbook.md) | Connecting a client, the status bar, the workflow skill, enforced rules, documents and links |
| [Specification](docs/project-workspace-spec.md) | What the product does, and every accepted decision |
| [Technical design](docs/project-workspace-technical-design.md) | Architecture, storage, MCP, and how each part was built |
| [UI and UX direction](docs/research/ui-ux-design-direction.md) | Visual and interaction principles for the app |
| [Packaging findings](docs/experiments/packaging-findings.md) | How the bundled runtime and MCP server ship, and what was tested where |
| [Editor preservation findings](docs/experiments/editor-preservation-findings.md) | Why the formatted editor is blocked, and what would unblock it |
| [Release automation](docs/proposals/release-automation.md) | How a merge to `main` chooses a version, builds the installers and publishes a release |
| [AGENTS.md](AGENTS.md) | Working agreement for AI tools changing this repository |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to report a problem or propose a change |
| [SECURITY.md](SECURITY.md) | How to report a vulnerability privately |

This repository tracks its own work in Knightbook: open this folder in the app to
see its board.

## License

Knightbook is licensed under the [Functional Source License, version 1.1, with the
Apache 2.0 future license](LICENSE.md) (FSL-1.1-ALv2), decision D-043. You may use,
change and share it for any purpose except offering it, or something built from it,
as a commercial product or service that competes with it. Two years after each
version is released, that version is also available under the Apache License 2.0.
