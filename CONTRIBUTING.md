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
different license later, while you keep the copyright in your own work.

You agree to it once, by checking its box in the pull-request form:

```markdown
- [x] I have read the [Contributor License Agreement](https://github.com/ninicdennis/knightbook/blob/main/CLA.md) and agree to it for this and my future contributions.
```

If the box is missing from your description, add that line. The "CLA agreed" check
fails until you do, and a comment on the pull request says what to do; it runs
again when you save the description. Only your own checked box counts: a box
someone else checks for you is not agreement. When you agree, the check records
your GitHub account, the CLA's version and the date on this repository's
`cla-signatures` branch, and your later pull requests pass without asking again.
If the agreement itself changes to a new version, you are asked once more. A pull
request without an agreement cannot be merged.

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
