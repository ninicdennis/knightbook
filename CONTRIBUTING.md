# Contributing

Thanks for your interest in Knightbook. It is free, and its source is available
under the [Functional Source License](LICENSE.md) (FSL-1.1-ALv2).

## Questions and problems

Open an [issue](https://github.com/ninicdennis/knightbook/issues/new/choose). The
bug-report form asks for what is needed to reproduce a problem. Everything in an
issue is public, so leave out private project content and credentials. Report a
security problem privately instead, as [SECURITY.md](SECURITY.md) describes.

## Changes

Knightbook is maintained by one person. Before writing a pull request, open an
issue describing the change, so we can agree it fits before you spend time on it.
Small fixes to typos and broken links are welcome without one.

Every contribution needs the [Contributor License Agreement](CLA.md). It lets the
maintainer keep distributing your contribution with Knightbook, including under a
different license later, while you keep the copyright in your own work. You agree
to it once, by checking its box in the pull-request form; it then covers your
later contributions too. A pull request without it cannot be merged.

When you do send a change:

- Read [AGENTS.md](AGENTS.md). It is the working agreement for this repository,
  for people as well as AI tools: one change per branch, tests beside the code, files
  under 400 lines, and decisions recorded in the
  [specification](docs/project-workspace-spec.md).
- Run `pnpm check` before opening the pull request. The
  [README](README.md#getting-started) has the setup.
- Title the pull request as a [Conventional Commit](https://www.conventionalcommits.org/)
  (`fix: …`, `feat: …`, `docs: …`). Pull requests are squash-merged, and the title
  decides the next release's version.
