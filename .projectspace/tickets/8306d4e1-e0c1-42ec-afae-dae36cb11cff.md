---
schema_version: 1
id: 8306d4e1-e0c1-42ec-afae-dae36cb11cff
title: "Count website visits with self-hosted Umami"
status: verification
type: feature
depends_on: []
created_at: 2026-10-23T03:51:59.517Z
updated_at: 2026-10-23T03:58:43.670Z
related_documents: [ "docs/project-workspace-spec.md", "docs/project-workspace-technical-design.md" ]
---

The user installed Umami on their own server and asked for its script on the website (2026-10-23):

`<script defer src="https://data.aikoworks.com/script.js" data-website-id="fca304d5-f882-41a9-aa2d-c5582956fa8f"></script>`

## Acceptance criteria

1. A production build (`KNIGHTBOOK_SITE_STAGE=production`) puts exactly that script, once, in the `<head>` of every page except redirect pages.
2. A preview build, local dev and the test builds load no analytics: no page contains the script's address or the website id. (The privacy page names the host in its text, so the host alone is not the test.)
3. The pages still work without JavaScript: the script is `defer`, and nothing on the page depends on it.
4. The privacy page no longer says the website runs no analytics or loads nothing from other sites; it says the site counts visits with Umami on the maintainer's own server, what that records according to Umami's documentation, and its last-updated date moves.
5. The decision is recorded (D-052) with its reasoning, and the technical design's public-website section mentions it.

## Test plan

- AC1: new `src/layout/analytics.test.ts` builds the site with `KNIGHTBOOK_SITE_STAGE=production` and checks every non-redirect HTML page has the script exactly once, inside `<head>`. Fails today: no page has it.
- AC2: `layout.test.ts` (a preview build) checks no page contains the script URL or the website id; its existing check that `index.html` and `404.html` have no `<script` stays. Passes today and fails if the condition on the production stage is dropped.
- AC3: settled by reading (deferred external script, no markup depends on it); the existing no-JavaScript browser checks run against a preview build.
- AC4: `layout.test.ts` privacy test asserts the Umami sentence and refuses "runs no analytics", and asserts the qualified "Apart from that script, ... loads nothing" sentence and what Umami records. Fails today.
- AC5: settled by reading.
- Manual: Denny confirms visits appear in the Umami dashboard after the next production deploy.

## What changed

- `apps/website/src/layout/analytics.ts` holds the Umami script address and website id. `BaseLayout.astro` adds `<script defer src=... data-website-id=...>` (`is:inline`, so Astro leaves it as written) to every page's head, only when `isProductionBuild()`.
- Privacy page, "This website": replaced "runs no analytics or tracking script ... loads nothing from other sites" with a paragraph saying the site counts visits with Umami run at data.aikoworks.com, and what Umami's FAQ (docs.umami.is/docs/faq) says it records: pages, referrers, browser, OS, device type, approximate location, no cookies. Last updated moves to 2026-10-23.
- D-052 in the spec; a "Visit counting" bullet in the technical design's website section.
- Tests: new `analytics.test.ts` (production build: script exactly once, in the head, on every non-redirect page); `layout.test.ts` (preview build: no page has the script URL or id; privacy wording).

## How it was checked

- `pnpm check` passed: website 210 passed, 37 skipped; desktop 679 passed; core 294; mcp 51. Re-ran `layout.test.ts` (15 passed) after adding two privacy assertions.
- Each new test fails without its code: with the script never rendered, `analytics.test.ts` fails on 404.html; with it always rendered, `layout.test.ts` fails on index.html and 404.html.
- Verifier (run as a general-purpose agent following `.claude/agents/verifier.md`, since the verifier agent type is not registered in cloud sessions): covered 2 (AC1, AC2), weakly covered 1 (AC4, since closed by asserting the qualified sentence and the recorded fields), uncovered 0, settled by reading 2 (AC3, AC5).

## Not verified

- The 37 skipped website tests are the browser tests (Chromium checks), skipped in this container; they run against a preview build, which has no script either way.
- Packaged-app tests skipped (nothing packaged); this change does not touch the app.
- No test checks the privacy date moved; read by hand.
- Whether data.aikoworks.com accepts events from knightbook.xyz has not been checked; that needs a production deploy.
- Umami's own claims (no cookies, what it records) are taken from its FAQ, not measured.

## For you to check

- Read the new privacy paragraph and confirm "an analytics tool we run ourselves" is how you want it put.
- After the next production deploy, open knightbook.xyz and confirm a visit shows in the Umami dashboard.