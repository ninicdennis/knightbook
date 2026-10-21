# Capturing the website screenshots

The homepage and guides show Seedling, a fictional garden-planning project. It is
built by `seed.ts` from the words in `content.ts`, through `@knightbook/core`, so
its records are the ones the app itself writes. Nothing in it is real project
content. Take screenshots from the installed release build, never the
development app (ticket 90c7aba5).

## 1. Build Seedling

From the repository root, into a new folder outside the repository:

```bash
pnpm --filter @knightbook/website sample:project ~/Seedling
```

Give an absolute path: the command runs inside `apps/website`. The folder must not
already hold a project. Seedling is generated fresh each time rather than checked
in, so its dates are current when you capture it. It has:

- three documents: `README.md` and `docs/planting-calendar.md` (reviewed) and
  `docs/decisions.md` (not reviewed);
- ten tickets: three Done (accepted by the user), one In progress, one in
  Verification with a handoff note, and five in the Backlog, one of them blocked
  and two waiting on a prerequisite;
- a plan, "Spring release", with three phases.

To change what it says, edit `content.ts` and build it again into a new folder.

## 2. Open it in the release build

1. Install the newest release from the download page, on a clean account if you
   can, so no personal folder, username or other project shows.
2. Open the app, choose **Choose a project folder** on the welcome screen (or
   **Open folder…** in the project menu) and pick the Seedling folder.
3. Turn on **Allow AI access through MCP** for it, and connect an AI client, so
   the status bar does not say "MCP not connected".
4. Make the window 1440 × 900 (logical pixels), at 200% display scaling if you
   can, which gives 2880 × 1800 captures.

## 3. Capture

Take each in the light and the dark colour scheme:

| File | What to show |
| --- | --- |
| `board-light.png`, `board-dark.png` | The board with all four columns and no ticket open |
| `document-light.png`, `document-dark.png` | Documents, with `docs/planting-calendar.md` open and its review state visible |

The getting-started guide needs its own steps (open a folder, set it up, connect
an AI tool); capture those from the same build when the guide is written.

Before keeping a capture, check that it shows no personal path, username, other
project, secret or notification from outside the app.

## 4. Put them on the site

1. Scale each to 1920 × 1200 PNG and replace the files in
   `apps/website/src/home/screenshots/`. `Screenshot.astro` makes the WebP sizes at
   build time.
2. Check the alt text in `HomeHero.astro` and `FeatureSections.astro` still
   describes what the new image shows.
3. Remove `boardScreenshot` and `documentScreenshot` from
   `apps/website/src/home/drafts.ts` and from the list in
   `apps/website/src/pages/index.astro`, and the `draft` attribute from both
   `<Screenshot>` uses.
4. Run `pnpm --filter @knightbook/website test`.
