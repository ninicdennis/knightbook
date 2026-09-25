# Knightbook — Product Specification

Status: Working draft v0.19. Knightbook is the chosen product name (2026-09-20); Projectspace was the working placeholder.

This document records the agreed concept and proposals for discussion. Proposed behavior and open decisions are not approved implementation requirements. Electron, TypeScript, and React are accepted stack choices; the companion design records remaining implementation recommendations.

Companion: [Technical Design v0.3](project-workspace-technical-design.md) records the accepted base stack and Mantine UI library, and proposes supporting packages, storage, packaging, MCP, review, and editor design. Unconfirmed choices remain proposals and do not supersede the accepted product decisions here.

## Purpose

A simple desktop workspace for one person to develop project ideas, preserve specifications and decisions, and track implementation through a Kanban board. Humans and different AI tools share durable project context through ordinary Markdown files, with MCP providing structured access to that content.

The intended benefit is continuity: return to a project, understand its current state and reasoning, and continue work with a different AI tool without reconstructing previous conversations.

## Confirmed requirements

- Serve a solo user, with minimal project-management complexity.
- Support **Windows, macOS, and Linux in the first version**. The user regularly uses all three.
- Provide one application for switching between projects, reading and writing documentation, and viewing work on a Kanban board.
- Allow flexible document and folder organization chosen by the user. Templates may be offered as optional starting points; fixed documentation sections are not required.
- Include existing Markdown files and folders selected by the user or AI without moving or duplicating them. Edit those files in their original locations within the selected project.
- Store the general project content as actual Markdown files. The UI is a way to work with those files, not a separate authoritative copy of their content.
- Allow both the user and AI tools to author and edit content.
- Support an idea-to-specification-to-tickets workflow, including architectural thinking and decisions made with user input.
- Let AI tools retrieve and work with tickets and project information through MCP.
- Preserve useful context when planning and implementation happen in different AI tools or models.
- Avoid requiring concepts intended for multiple teams.
- Let the user choose a folder for each project, including an existing code repository. A single app-managed workspace is not required.
- Rely on user-managed Git for sharing project content between machines. The user pulls the repository and opens its local folder in the app; built-in synchronization is outside the first-version scope.
- Keep AI conversations and implementation in the user's existing tools. The first version does not require an in-app AI chat or a particular model/provider.
- Keep MCP project access available when the app window is closed. After setup, external AI tools must be able to read and update projects without an open desktop UI.
- Provide MCP access so compatible external AI tools can work with the project. A companion workflow skill is a likely addition; its packaging and client support remain to be defined.
- Let an external AI create a project through MCP and populate its documentation, including when adopting an already established application.
- Show an in-app review status for AI-created or backfilled project content so the user can explicitly record human validation. Review is informational: unreviewed tickets can be implemented without an app-imposed approval gate. Review granularity remains open.
- Include a required **Verification** column before Done. The user verifies work in their usual editor/tools and decides when it is complete. On the user's explicit instruction, AI may record Done through MCP; it must not decide completion independently.
- Meaningful changes to reviewed content require renewed review while retaining the previous review record. Routine non-substantive changes should not reset review status.
- If a prerequisite fails verification, flag affected dependent tickets and explain the issue. Leave rework decisions to the user; do not automatically reset downstream work.
- Support simple dependency links between tickets, visible to the user and available through MCP so work can be planned in a sensible order.
- A dependency is satisfied for starting dependent work when its prerequisite reaches **Verification** or **Done**. Dependent work does not need to wait for the user's final completion decision.
- When the user asks an external AI to work on the next ticket, let it choose an eligible ticket using dependencies and backlog order and start without another ticket-selection confirmation. Completion still requires the user's explicit decision.

## Intended workflow

1. **Explore an idea.** The user and an AI discuss the problem, desired outcome, possibilities, and constraints in an existing external AI tool.
2. **Develop the project definition.** Capture the scope, expected behavior, relevant architecture, decisions, and unresolved questions in Markdown. The user can also write these directly.
3. **Create a pool of tickets.** Turn the project definition into actionable work linked to the relevant documentation.
4. **Select and implement work.** The user can specify a ticket or ask the AI to work on the next one. For the latter, the AI selects an eligible ticket using dependencies and backlog order, retrieves its context, and starts without a separate selection confirmation. Implementation may happen in a different tool from planning.
5. **Verify and record the result.** AI leaves implemented work in Verification. The user checks it in their existing editor/tools and can tell the AI that it is complete; the AI then records Done on that instruction. Proposed: also retain progress, verification, blockers, remaining work, and relevant documentation updates.
6. **Resume later.** Retrieve the project state and relevant records to continue without depending on the original conversation.

These are activities the app supports, not a requirement to complete every stage in a rigid sequence.

## Existing-application onboarding

Accepted direction: the user can ask an external AI to create a project for an existing application and fill gaps in its project documentation.

Proposed flow:

1. The user identifies the application folder and the material the AI should examine.
2. The external AI inspects available code and existing documentation using its own tools. Repository analysis does not require an AI runtime inside this app.
3. The AI creates the project through MCP in the chosen folder, preserving existing files.
4. The AI selects relevant existing Markdown files and folders for inclusion in the workspace, leaving them in their original locations, and drafts missing project context, specifications, and architecture notes. Detailed discovery and inclusion controls remain open.
5. Generated content enters the app's review view. Observed behavior is linked to supporting material; inferred intent and unanswered questions are identified explicitly. The AI must not present an invented historical rationale as an accepted decision.
6. The user can review, edit, and mark the content as human-validated in the app at their convenience. This does not block other project work.

Documenting an existing application does not by itself authorize code changes or generate an approved backlog of speculative improvements. Suggested follow-up work remains distinguishable from agreed work.

## Human review

Accepted direction: AI-generated project setup and backfilled content have a visible review status inside the app; human validation is an explicit user action. Review is informational and does not prevent AI from implementing unreviewed tickets. Only meaningful content changes require renewed review, with the previous review record retained.

Proposed initial behavior:

- Use two content-review states: **Unreviewed** and **Reviewed**. Exact labels remain open.
- Track review per document or ticket, with a project-level view showing what still needs attention. Individual and grouped review actions are proposals.
- Keep content review separate from a ticket's implementation status. A reviewed ticket may still be in the backlog. Moving a ticket to Done records the user's acceptance of the implementation; whether that action also updates the ticket-content review badge remains open. It must not automatically validate linked documents.
- Show the content being approved and, for later edits, what changed since its last review.
- Tie validation to the reviewed content. Meaningful later edits return it to Unreviewed while retaining the prior review record. Proposed examples include changes to scope, acceptance criteria, architecture, rationale, or documented behavior; formatting-only edits and routine status updates should not reset content review. The detection mechanism remains open.
- Store durable review information with the Markdown records so it is visible through MCP and survives switching AI tools. The metadata format is undecided.
- An AI must not independently mark its generated content as human-validated.

MCP exposes review status so external AI tools can report it accurately. Neither the app nor its companion workflow guidance should require human review solely to permit ticket implementation. This does not override user instructions or permissions in the external AI tool.

## Ticket lifecycle

Accepted direction: the board includes a required **Verification** column before Done. The user owns the completion decision and can communicate it to the AI in the tool where they are already working. AI may record that decision but must not independently declare success.

The working lifecycle is **Backlog → In progress → Verification → Done**. The surrounding column labels remain working defaults.

Completion responsibilities:

- AI can implement work, move it into Verification, perform checks, and record results for the user.
- The user verifies the implementation in their existing editor or other development tools. A separate in-app verification screen or repeated approval is not required.
- The user may move the ticket to Done in the app or explicitly tell the AI it is complete; the AI may then record Done through MCP on the user's behalf.
- MCP and workflow guidance must support recording user-authorized completion while distinguishing it from AI-reported checks. Passing tests or reaching Verification alone is not permission for AI to mark Done.
- Human review of planning content remains informational: unreviewed tickets can still enter implementation. Human acceptance is required at completion.

Proposed behavior:

- Move implemented work into Verification to check the outcome against the ticket's acceptance criteria.
- Record what was checked, the result, and any unresolved issues. If further implementation is needed, return the ticket to In progress.
- Represent a blocker as a flag and explanation on the ticket rather than a separate column.
- Display human-review status as a separate badge, with a way to find unreviewed content.
- Record relevant verification with the ticket's outcome and retain the user's completion decision separately from AI-reported results. The app can display saved information without requiring the user to repeat their verification there.

How user authorization is recorded and transitions are validated through the UI, MCP, and direct file edits remains a technical design question. The design must distinguish the completion decision from the actor writing the update, without requiring a second in-app approval after an explicit instruction in the user's AI tool. Any limits to verifying that instruction must be documented rather than claiming that editable Markdown proves authorization.

### Selecting the next ticket

Accepted direction: an explicit request to work on the next ticket authorizes the external AI to select and start an eligible ticket using dependencies and backlog order. The user can still choose a specific ticket directly. This is an on-request workflow, not an app-managed background queue.

Proposed behavior: identify the selected ticket, retrieve its linked context, and update its progress as work proceeds. If no ticket is eligible, report the blocking prerequisites or missing information. Selection must not mark prerequisites Done or imply human review. For dependency eligibility, all listed prerequisites must be in Verification or Done; other blocker and override rules remain open.

## Ticket dependencies

Accepted direction: tickets can depend on other tickets. Dependencies provide context for choosing the next piece of work without adding scheduling or timeline features. A prerequisite in Verification or Done satisfies the dependency for starting work; Verification does not imply final human acceptance.

Proposed first-version behavior:

- Let the user or AI add and remove dependency links between tickets in the same project.
- Show which tickets a task depends on, their current statuses, and whether they satisfy dependency readiness. Expose the same information through MCP while distinguishing Verification from Done.
- Store dependency references with the Markdown ticket records; the identifier convention remains open.
- Identify missing references, self-dependencies, and circular dependencies rather than silently treating them as valid work ordering.
- When a prerequisite fails verification, flag affected dependent tickets and explain the problem. The user decides what needs rework; do not automatically discard work or reset downstream statuses. Proposed: reevaluate eligibility for work that has not started if the prerequisite returns to In progress.

For automatic next-ticket selection, prerequisites in Backlog or In progress do not satisfy dependencies. Whether a user can explicitly override that readiness rule for a selected ticket remains open. D-013 authorizes selection and execution when the user asks for the next ticket; background scheduling and continuous queue execution are not included.

## Proposed first-version scope

| Area | Proposed behavior |
| --- | --- |
| Desktop platforms | Deliver the core project, documentation, board, review, and MCP workflows on Windows, macOS, and Linux. Exact supported OS versions and processor architectures remain open. |
| Projects | Create or open a project through the UI or MCP in a user-selected folder, including an existing application, and switch between known projects. The structure added inside that folder remains open. |
| Documents | Browse, read, edit, and organize Markdown in user-defined documents and folders, with optional starter templates. Include selected existing files in place. A formatted editor is the tentative default; an in-app source editor is not yet a requirement. |
| Board | View tickets by status and open their Markdown content. The working flow is Backlog → In progress → Verification → Done. The user decides completion in the app or instructs AI to record it through MCP. Other transition details remain open. |
| Connections | Link tickets to the documents and decisions needed to understand them. |
| Dependencies | Link tickets to prerequisites and show their current status in the app and MCP. Verification or Done satisfies a prerequisite. Flag affected work if verification fails; leave rework decisions to the user. Explicit overrides remain open. |
| Retrieval | Find relevant project content without requiring an AI to read every document. The initial search behavior remains open. |
| MCP | Expose project/document/ticket retrieval and updates against the same content used by the UI, including while the app window is closed. Exact operations and process lifecycle remain open. |
| Workflow guidance | Likely provide a companion skill explaining how to read project context, capture decisions, develop tickets, and record handoffs. Exact delivery remains open. |
| Continuity | Record enough task context and progress for another tool to continue, including unresolved questions. |
| Human review | Track human validation in the app and expose it through MCP without blocking work. Exact granularity remains open. |

## Desktop platform support

Accepted direction: Windows, macOS, and Linux are all first-version requirements.

Proposed acceptance requirements:

- Install and run the application and connect an external AI client through MCP on each supported platform.
- Keep project Markdown and record conventions portable across the three platforms, including links within a project.
- Validate opening projects, editing documents, detecting external edits, using the board, and completing user verification on each platform.
- Define supported OS versions, processor architectures, and Linux packaging targets before release. These have not been selected.

## Git and project portability

Accepted direction: Git carries project content between machines. The user manages their repository and opens the local checkout in the app after cloning or pulling it.

- Store durable project documentation and ticket state in the selected project folder so the user can version them alongside the application.
- Leave commits, pulls, pushes, and Git conflict resolution to the user's existing Git workflow. Automatic Git operations are outside the first-version scope.
- Provide no separate app-managed synchronization service in the first version.

Proposed acceptance behavior:

- Opening the same repository on another machine reconstructs its documents and board from the project files.
- Local app preferences and remembered checkout locations do not become authoritative project content.
- After the user pulls or switches branches, refresh the view from the resulting files. Detect unresolved conflict markers or invalid record metadata and surface them without silently rewriting the affected content.
- Use portable links within projects so different checkout locations do not break document relationships.

## External AI integration

Accepted direction: users continue using their preferred AI tools, with MCP providing access to project content. The app does not require a bundled model or provider-specific workflow.

MCP access must work without an open app window on Windows, macOS, and Linux. Closing the window must not make project access depend on reopening it. How the MCP process is started and stopped remains an implementation decision; an always-running background service has not been selected.

Proposed acceptance behavior: changes made through MCP while the window is closed are reflected when the app is reopened. The user can explicitly authorize completion in their external AI tool while the UI is closed, and the AI can record it through MCP.

Proposed division of responsibility:

- **MCP:** create and discover projects, and retrieve, create, and update their records through defined operations. Expose review status and support recording completion explicitly authorized by the user.
- **Companion skill or equivalent instructions:** guide the agent through planning, ticket execution, documentation maintenance, and handoffs. Require an explicit user completion instruction before recording Done; autonomous test results do not satisfy that requirement.
- **Application:** present the records and validate changes consistently. Workflow instructions alone should not be relied on to enforce data integrity.

The skill's format and supported clients require validation. MCP compatibility does not imply that every client supports the same skill format. Keep the guidance readable and usable independently of any single client's packaging.

Initial usage assumption: one active AI session per project at a time, with handoffs between tools. The user does not currently expect simultaneous AI sessions. Multi-session coordination and ticket-claiming infrastructure are outside the initial proposal; ordinary conflicts between the app and external file edits still need handling.

## Document editing experience

Tentative direction: use a formatted editor as the primary document interface. The user prefers this approach but wants to leave room to reconsider it.

Proposed behavior and acceptance criteria:

- Let the user edit rendered headings, paragraphs, lists, links, code blocks, and tables while saving ordinary Markdown files.
- Preserve the meaning and content of Markdown written by AI or other editors, including record metadata. Avoid unnecessary rewrites that make Git changes difficult to review.
- Opening and closing a document without edits must not rewrite it.
- Preserve syntax the formatted editor cannot edit, using a visible fallback instead of silently dropping or converting content. The fallback design remains open.
- Keep direct editing in an external text editor available. A built-in source toggle is optional and has not been selected for the first version.
- Evaluate a small editor prototype with representative project documents before making the editor choice final. No prototype has been built yet.

## Document organization and optional templates

Accepted direction: users organize documents and folders however they prefer. Templates can be offered as optional starting points rather than mandatory sections or required documents.

Existing Markdown stays in its original location within the selected project. The user or AI chooses which files and folders appear in the workspace; inclusion does not create an imported copy or require reorganizing the repository.

Proposed behavior:

- Create blank documents or start from a template; give them user-chosen names and locations within the project.
- Allow documents and folders to be organized without requiring an Overview, Specification, Architecture, or Decisions section.
- A template supplies editable Markdown. It does not lock the document's structure or require all suggested fields to be completed.
- Offer a small initial set of templates for common project documents. The exact set is not yet selected; a template builder or marketplace is outside the current proposal.
- Let AI tools discover and reference documents without depending on fixed filenames or folder names. The discovery and linking conventions remain to be defined.
- Persist document inclusion choices with the project using portable references so another checkout can reconstruct the workspace. The storage convention remains open.
- Removing a document from the workspace view should leave its source file intact. Deleting a source file is a distinct action; exact UI behavior remains to be defined.

Flexible documentation organization is separate from the minimal metadata needed to identify tickets, their board status, and review information. Those conventions remain open.

## Proposed content conventions

Markdown remains readable and useful outside the application. A small documented metadata convention may identify records and their status; its format is undecided.

Optional document-template candidates and the ticket content model to evaluate:

- **Project definition:** problem, intended user, goals, scope, constraints, and open questions.
- **Specification:** expected behavior and criteria for judging whether it has been delivered.
- **Architecture notes:** relevant structure, responsibilities, and constraints; clearly distinguish proposed and implemented behavior.
- **Decision record:** the decision, its rationale, alternatives where useful, and whether it is proposed, accepted, or superseded.
- **Ticket:** intended outcome, acceptance criteria, related context, status, dependencies, progress, verification, blockers, and next action where relevant.

These are suggested content roles, not a requirement to create a separate file for every role or to fill every field for every project. They do not prescribe the user's document hierarchy.

## Proposed reliability requirements

- UI operations and MCP operations act on the same authoritative Markdown content.
- Direct external file edits are supported; the app detects changes and makes invalid metadata or editing conflicts visible instead of silently overwriting content.
- Planning suggestions can be distinguished from accepted decisions.
- Task progress distinguishes claims of completion from the available verification evidence.
- Significant implementation discoveries can be reflected in affected specifications and decision records.
- Agent operating instructions remain distinguishable from evolving project documentation.
- Changes should be inspectable and recoverable. The mechanism and review expectations remain open.

## Proposed exclusions from the first version

- Team administration, roles, organization hierarchies, and sprint reporting.
- Automatic multi-agent scheduling or execution orchestration.
- A built-in coding environment.
- Cloud accounts and collaboration.

Built-in AI conversation is excluded from the first-version direction by accepted decision D-002.
Built-in synchronization and automatic Git operations are excluded from the first version by accepted decision D-009.

## Open decisions

Deferred delivery feature: [releases after merge](proposals/release-automation.md). Merging
changes into a designated release branch should eventually build and publish a
GitHub Release automatically. Tooling, version policy, and platform validation
remain proposed; implementation is deferred while the product is built out.
This concerns distributing Knightbook, not automatic Git operations inside
users' projects or in-app automatic updates.

1. **Document editing details:** validate the tentative formatted editor, determine supported Markdown syntax and fallback behavior, and decide whether a built-in source view is needed.
2. **Work lifecycle:** explicit dependency overrides, representation of backlog order, recording user-authorized completion, and transition validation including externally edited Markdown. Verification or Done satisfies prerequisites. AI may select and start the next eligible ticket on request and record Done after an explicit user instruction. Failed prerequisites flag affected work for the user's rework decision.
3. **Review details:** review granularity, how meaningful changes are identified, whether user completion also marks ticket content reviewed, and how changes are recovered. Only meaningful changes require renewed review; content review does not block implementation.
4. **Content organization:** discovery and inclusion controls, portable record identity and links, and storage of app-specific records. Existing documents are selected by the user or AI and remain in place. Document/folder organization is flexible; the optional template set remains open.
5. **Workflow guidance:** whether to ship a companion skill initially, how it is delivered, and which clients to validate first.
6. **Platform delivery:** MCP process setup/lifecycle remains open. Windows, macOS, and Linux are all required, and MCP must work with the app window closed. Supported OS versions, processor architectures and Linux package formats are settled by D-028.

## Accepted decisions

- **D-028 — Supported platforms follow Electron's floor; x64 plus Apple silicon; deb first (2026-09-25):** Knightbook supports the operating systems its Electron version supports, which for Electron 44 is Windows 10 and later, macOS 13 Ventura and later, and current Linux releases still maintained by both Chromium and the distribution (tested on the CI runner's Ubuntu). No stricter floor is set, because it would turn away machines the app runs on for no technical reason; the floor moves with Electron upgrades, and release notes must say when one drops an OS. Builds are Windows x64, macOS arm64 and x64, and Linux x64. Windows and Linux arm64 are not built until someone asks for them. On Linux, deb ships first because it installs to a fixed path, so the saved MCP command stays valid across updates. AppImage is wanted, but it runs from a mount path that changes every launch, and the saved command currently points inside it; it is offered once the app copies the MCP helper to a persistent location and that has been checked on Linux (ticket `68f54f52`). rpm is not built. Before the macOS x64 build ships, the Node runtime must be staged per architecture, because one staged folder is today copied into both macOS builds and the Intel app would carry an arm64 Node that cannot start its MCP server (ticket `41d9ba34`). The options and their costs are in [Platform support](proposals/platform-support.md). The user chose these on 2026-09-25 (ticket `6b200e68`). Still open: MCP process setup and lifecycle (open decision 6), and code signing and notarization.

- **D-027 — Source is organised by feature (2026-09-25):** The renderer had grown to 57 files at its top level, plus 48 in `components/` and 13 in `hooks/`. Splitting by file type spread one feature across three places, and its tests sat in a separate flat list. Files are now grouped by feature (`app`, `projects`, `theme`, `board`, `tickets`, `verification`, `documents`, `markdown`, `plans`, `review`, `search`, `mcp`), with each feature's tests beside it and shared test support in `test/`. Only entry points stay at a package's root. A folder is split by sub-feature once it passes about 20 files, and no feature folder is made for fewer than three. The user agreed to feature folders over type folders. A second change applied the same rule elsewhere (ticket `09728710`). `apps/desktop/src/main` became `window`, `project`, `tickets`, `documents` (which also holds the plan and review-changes handlers) and `mcp`, with `index.ts`, `ipc.ts` and `guard.ts` at the root. `packages/core/src` became `records`, `tickets`, `documents`, `plans`, `review`, `search`, `mcp` and `test`, with `index.ts` still its only public entry. `packages/mcp/src` and `apps/desktop/src/shared` are under the threshold and stay flat. The working rules are in `AGENTS.md`.

- **D-026 — MCP configuration is copied in the chosen client's own format (2026-09-25):** The app used to copy one bare `{ command, args }` object, which is the inside of a Claude entry and works in no client as pasted. Copying now asks which client, and produces a complete entry for Claude Code or Claude Desktop (JSON under `mcpServers`), Codex (a TOML `[mcp_servers.knightbook]` table) or OpenCode (JSON under `mcp`, with one `command` array), plus the plain command and arguments for any other client. Each format was checked against the client's documentation on 2026-09-25; the sources are listed in technical design section 9. The list is kept to three because the formats belong to the clients and can change without notice. A shell command line such as `claude mcp add` is not offered, because quoting a path with spaces differs between PowerShell, cmd and POSIX shells (ticket `7ae60785`).

- **D-025 — Line endings never change review status (2026-09-25):** Review compares content, and LF versus CRLF is representation. Git for Windows checks committed files out as CRLF by default, so a ticket reviewed as LF showed "changed since review" after a checkout that nobody saw as an edit (ticket `34b13c5f`). `contentFingerprint` now normalises line endings before parsing, and review status and the changes view share one test, `unchangedSinceReview`: the exact bytes, then the same content in either line ending, then the fingerprint. Because snapshots recorded before this stored a fingerprint computed over CRLF bytes, the fingerprint is also recomputed from the snapshot's retained source, so existing reviews recover with no migration and nothing is rewritten. The raw revision used for write conflicts stays byte-exact. No per-project `.gitattributes` rule is required; a project may add one, but review must not depend on it.

- **D-024 — App icon cropped to the artwork (2026-09-25):** Refines D-021. `apps/desktop/build/icon.png` is no longer a plain resize of the logo: it is cropped to the logo's visible artwork and fitted into the square with a small margin, proportions unchanged, so the knight and book fill about 76% × 96% of each native icon slot instead of 50% × 64%. The approved logo PNG is unchanged, and the derivation is a script (`derive:icon`) documented in [the assets README](assets/README.md). The native titlebar and controls are kept; the gain comes from the artwork, not a custom titlebar.

- **D-023 — Documents can be created through MCP, without templates (2026-09-25):** `document_create` writes a new `.md` file at a project-relative path, creating missing folders, and includes it in the workspace, so an AI client with no filesystem access of its own can capture an idea or a specification as a document (validation scenario step 1). It never overwrites an existing file; the check and the write happen under the shared write lock. A file inside an already-included folder is covered by that folder's entry and gets no second entry. No template mechanism is provided through MCP: an AI already writes the whole content, so a template would only be a starting text it can compose itself, and D-010 keeps structure the user's choice. The "document from an optional template" half of scenario step 14 is therefore dropped for MCP and left to the in-app document creation ticket (`6f8476ef`), where a person benefits from a starting shape.

- **D-022 — Plans as one file each, read in the app first (2026-09-24):** The user chose to store each plan as `.projectspace/plans/<id>.md`, found by listing that folder the way tickets are, so a project written before plans existed has none and needs no migration. YAML frontmatter holds the plan's id, title, and an ordered `phases` list; each phase has a stable id, a title, optional `scope` and `value` notes, and the ids of the tickets it groups. The Markdown body is freeform goals, ideas and notes with no required headings. Phases in the body as headings were rejected because they impose prose structure and a hand edit could silently break a phase's identity. A plan stores nothing about its tickets; progress is computed from them each time, a missing or unreadable reference is never counted as done, and a plan or phase with no tickets is empty rather than finished. For the first version the user chose to read plans in the app and write them through MCP (`plan_create`, `plan_update`) or the plan's own file; in-app editing is a separate ticket.

- **D-021 — Approved logo (2026-09-20):** The user selected [the generated Knightbook logo](assets/knightbook-logo.png): a white chess knight on a navy book cover with a solid white page block and no line inside the pages. This PNG is the sole approved source artwork; the SVG attempts were rejected and removed, and the mark is not to be traced or redrawn from them. Application icons are derived from it: `apps/desktop/build/icon.png` is a 1024×1024 resize that electron-builder turns into the Windows and macOS icons at package time.

- **D-020 — Product name: Knightbook (2026-09-20):** The user selected Knightbook to replace the Projectspace placeholder. Knightbook is a documentation and Kanban workspace for preserving project context, with human direction and completion decisions. It supplements external AI tools; it is not itself an AI assistant. Application branding, package identifiers and MCP naming were migrated on 2026-09-20; `.projectspace/` storage keeps its name deliberately, because it is written into every existing project and renaming it would be a migration of the user's own files rather than of this product. Domain selection and trademark clearance remain unresolved; no domain has been purchased. “Your project, remembered.” remains a proposed tagline. Logo selection is recorded in D-021.

- **D-001 — Project location:** The user selects a folder per project; that folder may be an existing code repository. D-011 establishes that selected existing documents remain in place. Storage conventions for app-specific records remain undecided.
- **D-002 — External AI tools:** Planning conversations and implementation remain in the user's existing AI tools, connected through MCP. The user wants to avoid locking people into tooling they do not already use. A companion skill is the likely way to supply workflow guidance, with details still open. No built-in AI chat is required for the first version.
- **D-003 — AI project creation and human validation:** An external AI can create and populate a project, including documenting an established application. Generated content must have an in-app review status so the user can record human validation. Detailed review states and granularity are still proposals; D-004 establishes that review is informational.
- **D-004 — Review without blocking work:** The user prefers low friction. Unreviewed tickets may be implemented; human validation remains separately trackable in the app. Do not require a Reviewed state before work begins or infer human validation solely from AI-reported success. D-015 allows AI to record the user's explicit completion decision.
- **D-005 — Required Verification column:** Include Verification before Done in the board workflow. The user explicitly requires this column. D-006 establishes completion ownership; content-review tracking remains separately defined.
- **D-006 — User-owned completion decision:** Only the user decides when a ticket is complete. D-015 clarifies that AI may write the Done update on the user's explicit instruction; a direct in-app action is not required. Content review is not required before implementation starts.
- **D-007 — Three desktop platforms:** Support Windows, macOS, and Linux in the first version because the user naturally works across all three. Specific versions, architectures, and packaging remain open.
- **D-008 — MCP without an open window:** External AI tools must be able to access project content through MCP while the app window is closed. The runtime mechanism remains undecided; UI visibility is not a prerequisite for AI work.
- **D-009 — User-managed Git:** Use Git to transfer project content between machines. The user pulls the repository and selects its local project folder. The app reads and edits that checkout; built-in synchronization and automatic Git operations are outside the first-version scope.
- **D-010 — Flexible documentation:** Users choose their own document and folder structure. Templates are optional aids; the app must not impose fixed documentation sections. The initial template set remains a proposal.
- **D-011 — Existing documents stay in place:** Include existing Markdown files and folders chosen by the user or AI, using their original locations within the project. Do not require moving or duplicating files to bring an established project into the app.
- **D-012 — Ticket dependencies:** Support simple dependency links so the user and AI can understand work ordering. Scheduling and timeline features are not part of this decision. D-014 establishes readiness and D-017 defines failed-prerequisite handling; explicit overrides remain open.
- **D-013 — Select and start on request:** When the user asks the AI to work on the next ticket, it chooses an eligible ticket using dependencies and backlog order and starts without a second selection confirmation. The user retains the final Verification-to-Done decision. D-014 defines dependency readiness.
- **D-014 — Dependencies unlock at Verification:** A prerequisite in Verification or Done allows dependent work to start. The user explicitly selected Verification as the unlock point. All listed prerequisites must meet that threshold; this does not mark them Done or human-reviewed.
- **D-015 — Verify in existing tools and tell the AI:** The user verifies work in their existing editor/tools and can tell the AI a ticket is complete. AI may then record Done through MCP. This refines D-006: the user owns the decision, while AI can perform the update. No separate in-app verification or repeated approval is required.
- **D-016 — Meaningful changes trigger renewed review:** Renew review only for meaningful content changes, retaining the previous review record. Routine non-substantive edits do not reset review. How the system identifies meaningful changes remains to be designed.
- **D-017 — Flag affected dependent work:** If a prerequisite fails verification, flag affected tickets and explain the issue. Leave rework decisions to the user rather than automatically resetting downstream work.
- **D-018 — Base stack accepted:** The user accepted Electron, TypeScript, and React with a Node-based MCP host. Milkdown remains the editor candidate subject to preservation testing.
- **D-019 — Mantine accepted:** Use Mantine for the desktop UI, with its theme and CSS modules for custom styling. Additional supporting packages in Technical Design v0.3 remain recommendations rather than user-approved dependencies.

## Tentative decisions

- **T-001 — Formatted editor:** Prefer a formatted document editor as the primary UI. The user expressed uncertainty, so this is a working preference rather than a final commitment. A source-editing mode remains optional pending validation.
- **T-002 — One active AI session per project:** Use one active AI session at a time as the initial usage assumption. The user does not expect concurrent sessions; do not add multi-session orchestration or ticket-claiming features on that basis. This does not eliminate handling of app/external-editor file conflicts.

## Proposed validation scenario

Use one small real project to complete a full handoff:

1. Capture an idea and an agreed specification in Markdown.
2. Create a few linked tickets.
3. Have a different AI tool retrieve one ticket and the relevant context through MCP.
4. Implement the task in that external tool, move it into Verification, and record the checks, result, and any changed decisions. The user verifies the outcome in their existing editor/tools and tells the AI it is complete; the AI records Done through MCP on that instruction. Also verify direct completion in the app.
5. Return later and identify the current state, important reasoning, and next action from the saved records.
6. Confirm that the content remains readable outside the app and that external edits appear correctly in the UI.
7. Also exercise onboarding an existing application: create its project through MCP, fill missing documentation without overwriting existing material, identify uncertain claims, and validate the generated content in the app.
8. Confirm that an unreviewed ticket can progress through implementation while remaining visibly unreviewed in both the app and MCP until the user records validation.
9. Confirm that the workflow leaves AI-implemented work in Verification without a user completion instruction, even if tests pass. After an explicit user instruction, AI can record Done through MCP without a second app approval. Validate authorization records and handling of externally edited completion fields under the selected design.
10. Run the core workflow on Windows, macOS, and Linux, including MCP access, external Markdown edits, and opening the same project content on another supported platform without broken internal links.
11. On each platform, close the app window, read and update project content through MCP, and record completion after an explicit user instruction. Reopen the app to confirm it displays the changes and distinguishes the user's completion decision from AI-reported checks.
12. Using a test repository, have the user transfer the project through Git to another machine and open its local checkout. Confirm that documents, board state, and durable review information load from the files and that the app does not initiate Git operations. Exercise external pull/branch changes and unresolved-conflict handling under the selected design.
13. Evaluate formatted editing with representative Markdown, including tables, fenced code, links, record metadata, and unsupported syntax. Confirm no-op opens preserve the file, intended edits preserve unrelated content, and external edits remain readable in the app.
14. Create a project with a custom document hierarchy and a blank document without using templates. Also create a document from an optional template and freely change its structure. Confirm the documents remain discoverable through the app and MCP without fixed section names.
15. Include an existing README and a documentation folder in place. Confirm inclusion does not move, copy, or rewrite the files, and editing a selected document updates its original file. Verify portable inclusion settings and removal-from-view behavior under the selected design.
16. Link a ticket to multiple prerequisites and verify matching readiness in the app and MCP: it is ineligible while any prerequisite is in Backlog or In progress, and eligible when all prerequisites are in Verification or Done. Check missing references, circular dependencies, and regression handling under the selected design.
17. Ask an external AI to work on the next ticket and confirm it selects and starts an eligible ticket using dependencies and backlog order without an extra selection confirmation. Also exercise a backlog with no eligible work and confirm it reports the reason without bypassing prerequisites or marking work Done.
18. Change reviewed content meaningfully and confirm it is flagged for renewed review with the prior review retained. Confirm formatting-only changes do not reset review under the selected detection rules.
19. Fail verification for a prerequisite whose dependent work has started. Confirm affected tickets show the issue without automatic rollback or status resets and the user can direct any rework.

Success means this flow is understandable and useful without duplicate authoritative documents or a dependency on the original chat history. This scenario is a proposed target; it has not been tested.

## Next discussion

The primary product decisions, base stack, and Mantine choice are captured. Review the [technical design](project-workspace-technical-design.md), including its supporting-package recommendations and bundled-runtime MCP packaging route. Editor preservation needs an experiment; packaged MCP needs normal release validation. No application has been built.
