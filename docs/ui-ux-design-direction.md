# UI/UX direction: extend the board's visual language

Date: 2026-09-20. Proposed implementation direction, requested for future backlog work; no UI implementation or user acceptance is claimed.

## Evidence and scope

The user approved the general appearance of the board columns and supplied three screenshots: the board and header, a long ticket, and its bottom actions. The ticket actions require scrolling past its entire body; the dialog and surrounding chrome use a different neutral-gray treatment. Source inspection confirms the actions follow the Markdown body in TicketDetailModal.tsx. Other surface recommendations below come from source inspection, not live interaction testing.

The accepted reference is ticket `4c73d142-22e0-47f0-b5a8-c6db75a2821c`, “Visual pass on the board: layered surfaces, scannable cards, quieter Done.” Preserve its separated surfaces, sentence-case labels, restrained borders, wrapping badges, meaningful status colors, and quiet Done column. Extend this work rather than redesigning the board.

## Palette and typography

Reuse surfaces.css and theme.ts, not a parallel theme. Dark reference values: window `#14161a`, column/panel `#1c1f26`, raised surface `#252932`, quiet surface `#1f232b`, accent `#5474b4`. Existing light counterparts are window `#eef0f4`, panel `#e3e6ec`, raised surface `#ffffff`, quiet surface `#f7f8fa`; use the theme's accent scale for accessible interactions. Check actual foreground/background combinations in both schemes. Reserve warning and acceptance colors for their meanings.

Keep the existing system sans-serif stack (Segoe UI on Windows). Proposed scale: 20–22px semibold dialog title, 16–18px content headings, 14–16px reading text, 12–13px metadata. Use roughly 1.55–1.65 body line height and 65–78ch reading measure. Titles, prose, and metadata need distinct emphasis without adding fonts or decorative labels. Keep all authored Markdown headings; fix hierarchy through presentation, never by stripping content.

## Layout direction

Shell: left-aligned project identity, centered search where space permits, view navigation and utility actions to the right. At narrow widths deliberately reflow the header and account for its actual height. Keep the checkout identifiable without allowing a long path to dominate.

Ticket: a stable title/status header and action footer around one scrolling reading area. Related documents and audit details belong to secondary, clearly labeled sections. Maintain room in the body for the eventual editor and room for its future toolbar; do not introduce inactive Edit or Save controls.

```text
Ticket title                                  Close
Status   Review state
---------------------------------------------------
Scrollable body: notices, dependencies, Markdown
Related documents / audit details
---------------------------------------------------
Move to                  Review / verification actions
```

Documents: a quiet navigation panel beside a raised reading surface, with a persistent document toolbar. On narrow windows provide an intentional list/reader transition. Use available container height rather than guessed viewport subtraction.

Secondary surfaces: project switching, settings, search, MCP details, and confirmation dialogs should share the same surface and action hierarchy. Keep rare configuration and diagnostics subordinate to everyday reading and navigation.

## Constraints and sequencing

- First address shell coherence and ticket control reachability; follow with reading typography, Documents layout, and secondary surfaces. This is a suggested implementation sequence, not a change to the user's backlog order.
- The existing formatted-editor ticket is `b217a95f-dc62-4319-b3a1-5c649fe183d9`. Its current record says it is blocked on Markdown preservation. This pass does not reassess upstream releases or unblock it. Preserve read-only rendering, external editing, sanitization, and Markdown files as canonical data. Reader improvements can ship independently of the editor.
- Keep completion, review, dependency, and failure semantics intact. Reviewing content must never imply acceptance as Done. Preserve warnings and provenance.
- Coordinate with existing Archive (`f8c8fdc7-b97b-49a0-8976-1d10aeac9f90`), guided AI setup (`9f4177e9-cb15-430d-892b-ca1640a48aec`), and shared MCP connection (`43253b7e-9c34-40bd-adcf-4919e4f63290`) tickets; do not implement those features as styling work.
- Keep native OS window controls; do not build a custom title bar for palette matching.

## Future verification

For each implementation, compare both schemes at 1280×860 and 900×650, then test increased text/zoom at 200%. Include a long title/path, a long ticket, all applicable verification actions, errors, and empty states. No essential controls may be clipped or overlap reading content. Verify keyboard focus, Escape and focus restoration for overlays, accessible names, and readable contrast. Normal text should reach 4.5:1, large text and essential control boundaries 3:1. Run pnpm check and use pnpm preview:board for visual evidence; confirm native shell behavior in the desktop app. These are acceptance checks for future work, not tests performed during this planning pass.
