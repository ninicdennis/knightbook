# Research: ticket navigation and work types

2026-09-20. Recommendations for future Backlog work; no application changes or user acceptance claimed.

## Internal links

Use ordinary Markdown links and the existing app navigation mechanisms. A new public URL scheme, OS protocol registration, routing library, or wiki-link syntax is unnecessary for links within the current project. CommonMark defines link syntax; the host application still has to resolve the destination and choose the appropriate view.

Source inspection shows that ticket bodies are rendered relative to the placeholder `ticket.md`, rather than their actual `.projectspace/tickets/` location. Thus a valid link such as `../../docs/ui-ux-design-direction.md` cannot resolve correctly from a ticket. The link classifier treats every internal destination as a document, drops cross-document fragments, and blocks fragment-only links. These are distinct gaps; they do not prove that every document link is broken.

Recommend source-relative paths for ordinary Markdown links, project-relative paths for the existing structured related_documents field, and explicit target dispatch to either an included document or a canonical ticket. Preserve fragments and scroll to the target heading with deterministic IDs. Never reinterpret arbitrary prose or bare UUIDs as links.

The main process must validate the resolved project boundary and target kind; renderer classification alone is insufficient. Keep existing exclusions for arbitrary file access and unsafe schemes. A missing, excluded, unsupported, or unreadable target should explain the problem rather than silently do nothing. HTTP(S) continues through the validated external-browser action, with failures visible. Do not automatically include a document or rewrite project records when following a link.

Sources: [CommonMark links](https://spec.commonmark.org/0.31.2/#links); [Electron guidance on external links and navigation](https://www.electronjs.org/docs/latest/tutorial/security).

## One optional ticket type

Use a single optional canonical field, `type: feature | bug | task`, independent of workflow status. Suggested presentation:

| Type | Meaning | Display |
| --- | --- | --- |
| Feature | New or expanded capability | ✨ Feature |
| Bug | Incorrect existing behavior | 🐛 Bug |
| Task | Maintenance, investigation, documentation, or other work | 🛠️ Task |

Keep existing untyped records untyped. Allow setting, changing, and clearing the value through the app and MCP. Store the stable word in Markdown, derive the emoji in the UI, and retain a visible text label. Do not add emoji to ticket titles or use a completion checkmark for Task. Reuse the board's visual hierarchy; type should not outrank status, blocked work, or Next up.

The existing core ticket schema/create input, desktop ticket contract, and MCP inputs do not expose a type. This therefore requires a small vertical feature through those layers, not only a badge. Preserve revision checks, review semantics, and all unrelated ticket content. No generalized tag manager, custom taxonomy, automatic classification, filters, or release automation is required for this first version.

GitHub uses Task, Bug, and Feature as its default issue types. Conventional Commits gives `feat` and `fix` release-related meaning, while allowing other commit types. SemVer defines version increments around compatibility of a declared public API. Borrow the vocabulary lightly: Feature resembles `feat`, Bug resembles `fix`, and Task carries no fixed version increment. A breaking change can belong to any category, so ticket type must not automatically determine a version bump.

Sources: [GitHub issue types](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/managing-issue-types-in-an-organization); [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/); [Semantic Versioning 2.0.0](https://semver.org/).

## Relationship to existing work

These are separate functional tickets from the UI/UX pass in [the design direction](ui-ux-design-direction.md). Coordinate edits to MarkdownBody, TicketDetailModal, DocumentsView, and TicketCard when implementation begins. Neither feature needs the future formatted Markdown editor. Preserve ordinary Markdown so external editors and other agents can use the same records.
