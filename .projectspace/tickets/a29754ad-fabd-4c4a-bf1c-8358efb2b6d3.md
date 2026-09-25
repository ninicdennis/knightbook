---
schema_version: 1
id: a29754ad-fabd-4c4a-bf1c-8358efb2b6d3
title: "Make the Windows app icon fill its native icon space"
status: done
type: bug
depends_on: []
created_at: 2026-09-22T01:45:41.324Z
updated_at: 2026-09-25T14:36:16.191Z
related_documents:
  - docs/research/plans-review-documents-research.md
  - docs/assets/README.md
completion:
  decision_source: direct_user_action
  recorded_by: user
  recorded_at: 2026-09-25T14:28:53.044Z
  instruction: Moved to Done in the app.
  accepted_revision: 1eac3e9ee2d79102f30bbb82299a0062
---

# Make the Windows app icon fill its native icon space

## Intended outcome
Knightbook's existing logo occupies the largest practical area within Windows' native icon slots while retaining the complete artwork and proportions.

## Acceptance criteria
- Remove excess transparent margins from the derived app icon and fit the full knight/book proportionally into a square with only necessary padding. Keep docs/assets/knightbook-logo.png unchanged; do not redesign or clip the artwork.
- Document a reproducible derivation from the canonical image and produce valid Windows icon frames for small and large native uses. Inspect the generated ICO rather than assuming a 1024 PNG guarantees small-size legibility.
- Verify packaged titlebar, taskbar, Alt-Tab, and executable icon appearance at representative 100%, 125%, 150%, and 200% Windows scaling, documenting any unavailable checks. Distinguish stale Windows icon caching from a generation failure.
- Retain native titlebar/controls. Size improvement must come from artwork occupancy and correct assets, not a custom titlebar or an attempt to enlarge an OS-controlled slot.
- Confirm other platform icon outputs retain correct proportions if they share the changed source; do not claim macOS/Linux visual validation without running it.

## Notes
Research measured apps/desktop/build/icon.png at 1024x1024 with alpha content x=256..767 and y=187..836: about 50% width and 63.5% height. This wastes visible native icon space. Source inspection and measurement explain the likely cause; no live packaged icon check was performed. Microsoft documents DPI-dependent native icon slots; electron-builder already generates platform icons from the build source. Sources are linked in the research document.

## Verification
Compare old/new bounds and previews at actual small pixel sizes, inspect ICO frame sizes, run relevant asset/packaging checks and pnpm pack:dir, and collect native before/after screenshots. Do not terminate an MCP client to work around a locked runtime; use the existing safe staging workflow.

## Handoff
**What changed:** `apps/desktop/scripts/derive-icon.cjs`, run with `pnpm --filter @knightbook/desktop derive:icon`, derives `apps/desktop/build/icon.png` from the untouched logo using Electron's `nativeImage`. It crops to the pixels with alpha ≥ 4 and fits the artwork's longer side into 1024 with a 20 px margin, proportions unchanged. What it trims is generator haze of alpha 1–3 (≤1.2% opaque), none of the artwork. Measured result: the source artwork is 630×799 at (312,228) in the 1254² logo; the output artwork is 776×984 in the 1024² icon. That is 75.8% × 96.1% occupancy, up from 50.0% × 63.5%. The aspect ratio is kept (0.788 → 0.789). The derivation and measurements are in `docs/assets/README.md`, and the decision is D-024 in the spec. The native titlebar is untouched.
**How it was checked:** Packaged with electron-builder into a scratch folder and inspected the generated `.icon-ico/icon.ico`: 7 frames, all 32-bit PNG, at 16, 24, 32, 48, 64, 128 and 256 px. Rendered the old icon (resized) beside the new ICO frames at 16/24/32/48 px, enlarged pixel for pixel: at every size the knight and book are clearly larger, and at 16 px the knight is recognisable. `pnpm check` passed, including the packaging suite.
**Not verified:** Native titlebar, taskbar, Alt-Tab and exe icons at 100/125/150/200% scaling. Changing display scaling is a system setting I don't touch. Your packaged app was also running from `release/win-unpacked`, and I did not close it. `pnpm pack:dir` failed there (EPERM on a locked DLL) after electron-builder had already deleted most of that folder. I restored the missing files from the scratch build without overwriting locked ones, so the running exe and `app.asar` there are the old build. That is filed as bug 5ebdd851. Windows has no 20 or 40 px frame and scales the nearest one for 125%/250%. The macOS `.icns` shares the source, so its proportions are right, but at 96% height it will look larger than typical macOS icons, which leave more margin. It has not been viewed on macOS or Linux.
**For you to check:** Close Knightbook, run `pnpm pack:dir`, start it with `pnpm start:packaged`, and look at the titlebar, taskbar and Alt-Tab icons. If Windows still shows the old icon, that is its icon cache: check the exe's icon in Explorer, or restart Explorer.