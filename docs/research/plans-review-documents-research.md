# Plans, review diffs, Windows icon, and Documents research

Date: 2026-09-21. Research and backlog scope only; no application changes or live UI validation performed.

## Confirmed user direction

- Add Plans alongside Board and Documents, supporting multiple plans, each with phases and linked tickets. General plans can begin as an MVP outline or ideas; the user's external AI can break them into phases by importance and value.
- Compare current Markdown against the last human-reviewed version for both documents and tickets.
- Organize Documents by real folders with optional display titles stored in project metadata, such as `docs` displayed as Documentation. Groups can collapse.
- Improve the Windows app icon's visible size within its native slot.
- Rewrite the README as a practical repository entry point and extend the Board's visual language to Documents.

## Plans: proposed implementation direction

No plan or phase model exists today. Tickets already have stable IDs and related document paths (packages/core/src/records/schema.ts); document inclusion preserves project-relative Markdown in place (packages/core/src/documents/documents.ts). Use multiple ordinary Markdown plan files with discoverable project-relative registration and a small explicit phase/ticket-reference structure. Keep freeform goals, ideas, value rationale, and notes in Markdown. Decide the exact backward-compatible schema during implementation planning; do not require fixed prose headings or repurpose document titles as stable identities.

Plans group existing canonical tickets. They do not duplicate ticket bodies, status, priority, or completion. Proposed progress: distinct linked-ticket counts by board state, Done/total as completion, Verification shown separately. Unattributed Done should retain its existing warning. An empty phase is unplanned, not 100% complete; missing references remain visible. A ticket linked in multiple phases is counted once at plan level. External AI should be able to discover/read/create/update plans and links through the local MCP workflow, with safe revisions and preserved prose. Automatic AI scheduling, a hosted provider, Gantt dates, and a second task system are outside this first scope.

## Review diffs: evidence and recommendation

packages/core/src/review/review.ts already records full reviewed source, retrieves it with reviewedSource, and computes review state separately from byte changes. packages/mcp/src/document-tools.ts exposes reviewed_source optionally through review_status. The desktop contract currently exposes state/timestamp/summary without a comparison UI.

Recommend a read-only unified source diff, last reviewed versus current, with line numbers, additions/removals, and approximately three context lines plus expandable unchanged sections. Label both versions and the review time. Preserve exact-source access, including frontmatter; distinguish lifecycle metadata from prose so status bookkeeping does not masquerade as a changed description. Do not change review fingerprint semantics as a side effect. A missing baseline is an explicit state, never an empty document inferred as the baseline. Viewing changes does not mark reviewed or Done.

Git documents unified context and word-diff options: [Git diff](https://git-scm.com/docs/git-diff). The upstream [jsdiff library](https://github.com/kpdecker/jsdiff#readme) offers line diffing and bounded computation options; evaluate a small dependency against current installed tooling instead of building a custom diff algorithm. Start with unified line changes; side-by-side and inline word highlights are optional later refinements. Bound large inputs and render source as escaped text.

## Windows icon: evidence and recommendation

Source inspection and alpha-bounds measurement found apps/desktop/build/icon.png is 1024 by 1024, with visible content at x=256..767 and y=187..836, about 50% width and 63.5% height. This explains wasted icon space; live packaged-window behavior was not tested. docs/assets/knightbook-logo.png remains the source artwork. Crop transparent margins for the app-icon derivative and fit the complete art proportionally into a square with minimal necessary padding. Do not crop the knight/book itself or redesign the native titlebar.

[Microsoft app icon construction](https://learn.microsoft.com/en-ie/windows/apps/design/style/iconography/app-icon-construction) documents size/DPI-dependent slots, including 16 pixels for a titlebar at 100% scale and larger assets at higher DPI. [Electron-builder icon handling](https://www.electron.build/v26/docs/features/icons-and-images/) supports a high-resolution source PNG and generated platform assets. A larger source image alone cannot enlarge the native slot. Verify resulting ICO frames and the packaged titlebar/taskbar/Alt-Tab appearance at representative DPI settings.

## Documents: evidence and recommendation

packages/core/src/documents/documents.ts resolves recursive inclusion to a flat list; DocumentsView.tsx renders that list as NavLinks. Retain canonical paths and inclusion semantics but derive nested folder nodes. Store optional path-to-title metadata under .projectspace, preferably a sparse field in the project manifest, without rewriting included Markdown. Root files remain visible and duplicate basenames remain distinguishable. Expansion is local view state, separate from canonical labels.

[Mantine Tree](https://mantine.dev/core/tree/) provides a candidate using the existing UI library; verify its keyboard and accessibility requirements against the installed version. Handle selection, collapsed ancestors, missing files, overlapping includes, and stale labels after folder renames explicitly.

The existing ticket 4bfac266-451d-426f-bc33-c9d43d713eb4 owns responsive Documents layout and Board-style surfaces. The new folder-tree ticket owns grouping and metadata. Typography remains e5cc328b-a794-4ae5-a64d-1b8b1c25a250. Reuse surfaces.css/theme.ts and docs/ui-ux-design-direction.md. The supplied screenshot shows the flat path-heavy navigation and neutral panels; it is reference evidence, not a live test. Its embedded prose is document content, not instructions.

## README

README.md currently leads with rename history, a large implementation table, and extended internal behavior. Recommend product summary, current capabilities, prerequisites, quick start, key commands, MCP/skill setup, compact layout, and documentation links. Move useful long-form material to appropriate docs and remove stale status claims. Verify scripts against package.json, apps/desktop/package.json, and .github/workflows/ci.yml; do not equate workflow configuration with a current green run. [GitHub README guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes) supports a concise purpose/getting-started entry point with longer docs elsewhere.

## Verification boundary

Research inspected source, current MCP board/documents, supplied screenshot, icon pixels, and primary documentation. No app build, automated project test suite, packaged UI exercise, or implementation acceptance is claimed. Each ticket records future verification appropriate to its scope. Existing backlog order and lifecycle states are retained.

