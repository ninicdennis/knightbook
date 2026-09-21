# Landing page, downloads, and user documentation

Status: proposed delivery and content plan. Written 2026-09-20.

This document describes the public website needed to distribute Knightbook as
a downloadable desktop application and help people use it. It includes page
structure, draft copy, documentation requirements, and launch acceptance criteria.
It does not implement a website, publish binaries, select a commercial provider,
or create tickets. The product name below is accepted; the remaining recommendations
are proposals until implementation.

## Accepted name and logo

On 2026-09-20, the user selected **Knightbook** to replace the **Projectspace**
placeholder. See decision D-020 in the [product specification](project-workspace-spec.md).
Knightbook is a documentation and Kanban workspace that preserves written context
and work status under human direction. It supplements the user's external AI tools;
it is not an AI assistant or model.

“Book” emphasizes the durable written record; “Knight” gives the product a distinct
identity. On 2026-09-20, the user approved the white chess knight on a navy book
cover, with a solid white page block and no horizontal line inside the pages.
Use [the approved logo](assets/knightbook-logo.png) as the canonical asset. It is a
generated PNG and the only approved source artwork; the SVG attempts were rejected
and removed. Application icons are derived from it rather than drawn separately.
**Your project, remembered.** remains a proposed tagline.

Binaries and technical identifiers were migrated to Knightbook on 2026-09-20, so
public copy and the application now agree. Two names are deliberately unchanged and
should stay accurate in any documentation: the `.projectspace/` folder inside each
project, and the bundled workflow skill at `skills/projectspace/`. No domain is
selected or purchased, and availability, pricing, and trademark clearance for
Knightbook remain unchecked.

## 1. Purpose and audience

The website should answer four questions quickly:

1. What is Knightbook, and why would I use it?
2. Can I download a build that works on my computer?
3. How do I open a project and connect my existing AI tool?
4. Where do I go when I need instructions or something goes wrong?

The initial audience is people building software with external AI tools who want
project context, decisions, and work status to survive individual conversations.
An existing repository should feel like a natural starting point. A new visitor
should understand the benefit before encountering MCP configuration details.

The primary conversion is a suitable binary download. The first-use success
condition is opening a project, finding its documents and board, and understanding
how an AI handoff reaches Verification for the user's completion decision.
Connecting an AI tool is a separate onboarding milestone, not a download gate.

## 2. Product truth and public claims

Use the [README](../README.md) for the current implementation overview, the
[product specification](project-workspace-spec.md) for intended behavior, and the
[technical design](project-workspace-technical-design.md) for architecture.
Verify public claims against the release being offered, rather than treating every
specification requirement as shipped.

Current repository evidence gives this starting point:

| Topic | Safe basis for the website | Boundary to preserve |
| --- | --- | --- |
| Product | Desktop project workspace with Markdown documents and a Kanban board | Not a browser-based workspace or a built-in coding environment |
| Project files | Project content lives in the user's selected folder; existing included documents stay in place | Do not promise cloud backup, hosted storage, or automatic synchronization |
| AI | External AI clients connect through a bundled MCP server | Do not advertise a built-in assistant, included model subscription, or universal client compatibility |
| Workflow | Backlog, In progress, Verification, Done; the user decides completion | Passing tests does not mean accepted or human-reviewed |
| Documents | Included Markdown can be read and reviewed in the app, with external-editor handoff | Formatted in-app document editing is not currently shipped |
| Runtime | The package is designed to include the Node runtime and MCP server | Validate each released package before promising users need no separate runtime |
| Platforms | Windows, macOS, and Linux are product requirements; packaging configuration names candidate targets | Configuration and CI packaging alone do not establish installer or interactive platform support |
| Updates | A future release-publishing workflow is documented | In-app automatic updating is a separate feature, not an implied benefit of binary releases |

The README reports unpacked packaging and packaged MCP checks in CI on all three
operating systems. Older packaging findings and parts of the release proposal
describe Windows-only evidence. This planning pass has not rerun CI or installer
tests. Resolve support using the actual release evidence before publishing a
platform badge, minimum OS version, or download button.

Avoid unverified claims such as “works with every AI,” “fully offline AI,” “secure
by default,” “zero data leaves your device,” or “open source.” License, pricing,
telemetry, and client compatibility need their own confirmed facts. Local project
storage does not determine what a connected AI provider receives.

## 3. Launch scope and information architecture

Propose a small static public site: one product page, a download page, and a focused
set of user guides. Keep public content as repository-owned Markdown where
practical. A visitor should not need an account to read guides or download a public
release. Avoid a backend, CMS, newsletter, blog, or custom updater for the initial
site unless a later requirement makes one necessary.

These are proposed URL routes, not files or deployed endpoints:

| Route | Purpose | Essential content |
| --- | --- | --- |
| `/` | Explain the product and offer a download | Positioning, actual screenshots, workflow, feature boundaries, FAQ, primary action |
| `/download/` | Choose the correct released binary | Version, channel, date, OS/architecture, requirements, assets, checksums, release notes |
| `/docs/` | Help users find the next instruction | Start here, everyday use, AI setup, troubleshooting |
| `/docs/getting-started/` | First successful session | Install, select a folder, initialize when needed, find board/documents, next steps |
| `/docs/installation/` | Install, update, or remove the app | Tested platform instructions, runtime requirements, data preservation, uninstall behavior |
| `/docs/connecting-ai/` | Connect an external client | MCP explanation, copied configuration, client-specific tested setup, connection check, skill guidance |
| `/docs/projects-and-documents/` | Explain the local workspace | Existing files, inclusion/removal, external editing, refresh, portable project data, Git |
| `/docs/tickets-and-verification/` | Explain the work lifecycle | States, dependencies, handoff evidence, completion, review, failed verification |
| `/docs/troubleshooting/` | Recover from common problems | Installation, MCP, wrong folder, conflicts, missing documents, safe diagnostic reporting |
| `/releases/` | Understand changes | Version history, known issues, compatibility changes, authoritative release links |
| `/privacy/` | Explain data boundaries | Desktop storage, external AI access, website data collection, support submissions |

Include license and support links in the footer once their terms and destinations
are chosen. Release history may initially be a simple index linking to distribution
release notes. Search is optional at launch; a clear sidebar and page contents are
sufficient for this small guide set.

## 4. Homepage structure and draft copy

### Header and hero

Header: Knightbook wordmark, How it works, Documentation, Releases, Download.
On mobile, preserve a visible download action and accessible navigation.

Suggested hero:

> **Your project context, beyond the chat.**
>
> Keep project documents, decisions, and a work board together in a desktop
> workspace. Connect your existing AI tools, keep your Markdown in your project
> folder, and decide when the work is done.

Primary action: **Download Knightbook**, leading to the download page. Once a
verified release exists, this may become **Download for Windows**, for example,
with the explicit architecture and version beside it. Always retain **All
downloads**. Secondary action: **Read the getting-started guide**.

If there is no downloadable release, show **Downloads are not available yet**
and keep the guides accessible. Do not use an active download button pointing at
a missing asset, a source archive, or an unpacked CI artifact. If the release is a
preview, label it beside the action and state its concrete limitations.

### Show the product

Use an actual screenshot of the release's board as the main visual. Use a small,
fictional sample project with understandable ticket titles and a visible
Verification column. Add a second image of a document and its review state.
Remove personal paths, client names, secrets, and private project content.

Suggested caption: “See what is planned, what is in progress, and what is ready
for you to verify.” Provide useful alt text. An optional short demonstration
should have captions and playback controls; downloading should never depend on
watching a video. Do not show proposed editor or UI features as released screens.

### Explain the workflow

Use four simple steps, with a link to the full guide:

1. **Open your project.** Choose the folder where your project lives.
2. **Keep the context together.** Include existing Markdown documents and capture
   planned work on the board.
3. **Work with your AI tool.** Connect a compatible client through MCP so it can
   read project context and update work when you ask.
4. **Verify and decide.** Review the handoff in your usual tools. You decide
   whether the ticket is complete.

### Feature sections

Prefer three substantial sections over a long grid of generic feature claims:

- **Files you can keep using.** Documents remain ordinary Markdown in your
  project. Include existing documentation without moving it into a new hierarchy.
- **A shared view of the work.** Documents and tickets provide context for the
  next session; the board shows the state of the work and its dependencies.
- **Your completion decision.** AI work reaches Verification with evidence.
  Human review and completion remain distinct, visible decisions.

Explain MCP in one sentence near the AI section: “MCP is the connection that lets
a compatible AI tool read and update this project.” Put setup instructions in
the guide, not in the hero. Name or display client logos only after testing the
documented integration and checking applicable brand requirements.

### FAQ and closing action

Draft FAQ topics and answer boundaries:

| Question | Answer direction |
| --- | --- |
| Does Knightbook include an AI assistant? | Planning and coding happen in the user's external AI tool; Knightbook supplies shared project context and work records. |
| Can I use an existing repository? | Yes, choose its local folder and include existing Markdown in place. Explain initialization before adding project metadata. |
| Where are my files? | In the selected project folder; explain `.projectspace/` in the guide. Connected tools have their own data handling. |
| Can I edit documents? | For the current implementation, read/review in Knightbook and edit in an external editor. Update this answer only when the release changes. |
| Does the app need to stay open? | The AI client launches the packaged MCP process independently of the window. Validate this with the released installer and documented client. |
| Does it sync across computers? | Users transfer files themselves, for example through Git; built-in sync and automatic Git operations are outside the initial product scope. |
| Which systems and AI clients work? | Link to the tested release matrix and tested client guides. Avoid a blanket compatibility promise. |
| Is it free, and what is the license? | Publish the owner's chosen terms before release; no pricing or licensing decision is made here. |

End with the same download action and a getting-started link. Do not invent
testimonials, usage counters, endorsements, or benchmark claims.

## 5. Download and release contract

Use the existing [release automation proposal](release-automation.md) as the
distribution design. GitHub Releases is the proposed binary origin there; the
landing page is the discoverable entrance to those assets. Hosting the site and
publishing desktop releases are separate operations. A manually published,
verified release can serve an initial site before release automation exists.

Each offered download needs an explicit record:

- Product version, channel (stable or preview), release date, and release notes.
- Operating system, CPU architecture, package format, and tested OS requirements.
- Exact published HTTPS asset URL and readable filename; optionally file size.
- A checksum and verification instructions, plus the actual signing/notarization
  status appropriate to the platform. Checksums are not a substitute for signing.
- Installation instructions, known limitations, and a support destination.

Candidate targets from the current Electron Builder configuration are Windows
x64 NSIS, macOS Apple silicon and Intel DMGs, and Linux x64 AppImage/deb. These
are candidates only. Linux formats need distinct instructions and tested
distribution requirements. Do not silently offer an Intel build as Apple silicon,
infer CPU architecture with certainty from a browser, or invent minimum OS versions.

The download page must handle these states:

| State | Required behavior |
| --- | --- |
| Supported OS and architecture | Show the matching verified asset with version and requirements |
| Unknown browser platform or mobile visitor | Show all supported desktop choices and explain that this is a desktop app |
| Target not released | State that no build is available; do not substitute another platform or expose a dead link |
| Preview only | Explicit preview label, known issues, and preview installation guidance |
| Stable and preview available | Stable is the default; preview requires a deliberate choice |
| Download fails | Keep a direct link to the authoritative release page and troubleshooting guidance |
| Release withdrawn | Stop recommending the asset; identify a known-good release or show temporary unavailability |

Prefer a small checked-in release-data file rendered at site build time for the
initial implementation. Updating it is part of release publication, after assets
exist. This avoids making a visitor's download choices depend on a live API call.
Automating that update can come later; it must still verify the full asset set.

Use version-specific asset links so the label and binary agree. A “latest” label
must refer to the release record the page actually renders. Never expose draft
assets, tokens, or repository credentials in site output. If the application
repository is private, choose a publicly accessible distribution location before
launch; visitors should not discover that authentication is needed after clicking.

Publish in this order: validate binaries, publish the release, verify public
downloads, update the site's release record and guides, then deploy the site.
If the site deployment fails, keep the previous valid site and download available.
Do not describe this as an in-app updater. Document manual installation of updates
until another update mechanism is implemented and tested.

## 6. Getting-started guide: first-session content

The public guide should be a short walkthrough with screenshots, expected results,
and a link to recovery instructions at each likely failure point. Author it from a
clean install of the exact binary being offered. The following is its content brief:

1. **Install and open Knightbook.** Choose a matching package, follow its
   platform-specific instructions, and open the installed app. End-user setup
   should not begin with Git cloning, pnpm, or a source build. Confirm bundled
   runtime behavior on a clean machine before saying no Node install is needed.
2. **Choose a project folder.** The current onboarding labels are **Choose a
   project folder** and, for an uninitialized folder, **Set up this folder**.
   Explain the difference between opening an existing Knightbook project and
   initializing a new one. Initialization adds `.projectspace/` metadata; existing
   code and documents stay in place. Setup can optionally include `README.md`
   and/or `docs`. Recheck these labels against the release used for screenshots.
3. **Find your documents.** Explain how to include a Markdown file or folder through
   the available UI or MCP tools. Inclusion records a path; it does not import a
   copy. Show how to read, review, and edit externally. If an operation needs MCP
   in the released build, say so rather than inventing a desktop button.
4. **Understand the board.** Introduce the four states and show a sample ticket
   with a small outcome and acceptance criteria. Explain the supported way to
   create it; do not require an AI subscription simply to understand the board.
5. **Optionally connect an AI tool.** Open the app's connection details, copy the
   MCP configuration, and follow a tested client guide. Explain that the client
   launches the server and that the configuration points at this project folder.
6. **Confirm the connection.** Ask the client to identify the project and list its
   documents. The returned name and checkout path should match the selected folder.
   This is a read-only first check before asking the AI to change project files.
7. **Try a small handoff.** Ask the AI to work on a deliberately small ticket.
   Show the evidence it leaves in Verification. Verify the outcome in your normal
   tools, then accept in the app or explicitly tell the AI to record completion.
8. **Return later.** Reopen the folder and locate its saved work and documents.
   Explain Refresh and refresh-on-focus when changes came from an external tool.

Suggested first connection prompt:

> Use Knightbook to tell me the project name and checkout path, then list its
> documents and summarize the board. Do not change files or ticket statuses yet.

Keep a “Use without connecting AI” branch that covers the available desktop
reading, review, and board controls. Clearly label any operations that currently
require an external tool.

## 7. User-guide details

### Installation, updating, and removal

Provide a page section per actually released platform, covering download choice,
installation location, first launch, prerequisites, and supported OS versions.
Record what the installer really does. Do not publish generic instructions to
disable OS protections; explain the artifact's verified publisher/signing state
and route unexpected warnings to support.

For updates, explain how to find the installed version, back up project data,
install the new package, reconnect a client if runtime paths change, and confirm
the project still opens. State migration and older-version compatibility when
applicable; do not recommend downgrading across an untested data-format change.
Document actual uninstall behavior separately for app preferences and project
files. Verify preservation rather than assuming every installer behaves alike.

### Connecting an AI tool

Explain MCP as optional connectivity, the bundled server, and the companion
[workflow skill](../skills/projectspace/SKILL.md). Tools expose capabilities;
guidance teaches the expected workflow. They are separate setup steps.

Use the configuration copied by the installed app as the source of paths, not a
hard-coded developer checkout or a Windows command pasted into every platform's
instructions. Client-specific wrappers, configuration locations, and restart
steps must be checked against the selected client's current documentation during
guide authoring. Record the tested app/client versions and date on each guide.

Cover one connection per project root, multiple local checkouts, moving a project,
app updates, and window-closed operation. Explain observable MCP statuses without
claiming the desktop app controls a client-owned server process. A connected
indicator is not proof that the client has followed the workflow skill.

### Projects, documents, and portability

Explain what `.projectspace/` contains and which records travel with the project.
Distinguish durable records from disposable runtime coordination files; link to
the maintained storage guidance rather than telling users to ignore the entire
folder. Document inclusion, unresolved paths, removal from the view versus deleting
a source file, relative links, external edits, and refresh behavior.

Explain that users operate Git themselves. Before a pull, branch switch, or
restoration, they should coordinate active writers and inspect outstanding edits.
Conflicts remain visible problems to resolve; they are not a reason to overwrite
metadata blindly. Do not market single-session usage as real-time team collaboration.

### Tickets, dependencies, verification, and review

Teach these distinctions through one small example:

- **Backlog → In progress → Verification → Done** describes work state.
- Dependencies are ready when all prerequisites are in Verification or Done;
  ready does not mean the prerequisite was accepted.
- AI handoff evidence should say what changed, what was checked, what remains
  unverified, and what the user should inspect.
- Only the user decides completion. An AI can record that explicit decision;
  its attribution must not imply a direct user action in the app.
- Human content review is separate from completion. Unreviewed content can still
  progress; meaningful changes can make an earlier review stale.
- Failed verification can flag dependent work without automatically resetting it.
  The user decides the rework.

Avoid explaining these as a tamper-proof authorization system. Markdown can be
edited externally; the product makes provenance and missing attribution visible.

### Troubleshooting and support

| Symptom | First checks to document |
| --- | --- |
| Installer will not run | Match OS/CPU, verify complete download and publisher state, check known release issues |
| MCP runtime missing | Confirm this is the installed package and its bundled runtime exists; inspect release-specific repair steps |
| MCP not connected | Check the client's configuration and errors, installed paths, project root, and whether the client started the server |
| Wrong project appears | Compare the root in the saved configuration with the checkout path returned by MCP |
| Documents or changes are absent | Check inclusion and file existence, then refresh; confirm the same checkout is open |
| Write conflict or malformed record | Preserve both versions, reread current content, resolve the conflict, and retry the intended change |
| Done or review looks unexpected | Explain attribution and review states; inspect the recorded decision rather than inferring acceptance |
| Behavior changes after an update | Consult release notes, configuration paths, and compatibility guidance before altering project data |

Every diagnostic page should state the expected result, the next safe action,
and when to contact support. Ask for app version, OS/architecture, reproduction
steps, and redacted relevant errors. Do not ask users to post entire private
projects, credentials, or unredacted client logs. Choose a support channel and
responsible maintainer before publishing its link.

## 8. Visual direction and accessibility

Carry the desktop application's restrained surface hierarchy, system typography,
and muted blue accent into the site. Use the
[UI direction](ui-ux-design-direction.md) as a reference, not as a requirement to
ship the desktop component library in a static website. The main visual should
be the working application, with generous space and readable explanatory copy.

On wide screens, pair a concise hero with a large board screenshot. On narrow
screens, stack the copy, actions, and image; let platform choices become clearly
labeled cards rather than a horizontally clipped table. Guides need a readable
measure, a mobile navigation pattern, and anchored headings.

Acceptance checks include keyboard navigation, visible focus, semantic headings,
skip navigation, meaningful link names, screenshot alt text, and reduced-motion
support. Verify contrast, 200% zoom, narrow screens, and long platform/file names.
Essential instructions and download links must work without client-side JavaScript.
Screenshots may supplement instructions, but must not contain the only explanation.

## 9. Content, hosting, privacy, and maintenance

Choose the static-site tooling and host during implementation based on repository
fit and delivery needs. Required capabilities are HTTPS, an owned domain when
chosen, deployment previews, redirect support, and rollback to a previous build.
This document does not select a framework, install dependencies, or authorize
publication. Keep application binaries at the release origin rather than adding
them to site source control.

Keep internal product/design documents distinct from public instructions. Do not
automatically publish every file in `docs/`: specifications, research, and proposals
can describe unfinished behavior. The future site should explicitly include only
public content. One canonical source should feed each guide to avoid editing the
same instructions independently in several places.

For discovery and sharing, provide unique page titles/descriptions, a canonical
URL after choosing the domain, social-preview imagery, a sitemap, redirects for
moved guides, and a useful 404 page. Preview deployments should not be presented
as the production site. Keep screenshots compressed and defer optional media so
the download action appears quickly.

Propose no added analytics or tracking scripts at launch. If metrics become
necessary, start with the explicit questions to answer, such as which platform
downloads fail or which setup guide is unclear. A download click is not a completed
download, installation, or active user. Review hosting logs and any later telemetry
before writing the privacy page; do not equate “no analytics script” with “no data
collection.” Separate website collection, desktop behavior, and the connected AI
client/provider in that explanation.

The release maintainer should update the download record, notes, compatibility
table, and affected guides together. Review screenshots whenever the workflow or
visible labels change. Initially target guides at the latest offered release and
clearly label version-specific differences; a full versioned documentation system
can wait until incompatible versions are actually supported concurrently.

## 10. Delivery sequence and launch acceptance

These are future work phases, not created tickets:

1. **Confirm release facts.** Choose distribution visibility, launch platforms,
   version/channel, license/pricing, and support owner. Validate installable assets.
2. **Author public content.** Turn the copy and guide briefs above into release-
   specific pages. Capture real screenshots and a complete first-use walkthrough.
3. **Build a private preview.** Implement the homepage, download data, guide
   navigation, and responsive layouts with the selected static tooling.
4. **Validate the full journey.** Test public download access and clean installs,
   then follow the guides with a supported external AI client.
5. **Publish and maintain.** Deploy after release assets are available; retain a
   rollback path and update the site as part of each subsequent release.

Before a public launch, require evidence that:

- A new visitor can explain the product and distinguish desktop features from
  external AI capabilities using the homepage alone.
- Every enabled platform choice downloads the stated version and architecture
  without a repository login; size/checksum/signing information matches the asset.
- Each advertised target has a clean installation and first-launch result, plus
  a bundled MCP check. CI packaging by itself is insufficient evidence.
- Getting started succeeds without developer tooling beyond any explicitly
  documented external client requirement.
- At least one named client guide succeeds using copied configuration, including
  reading the same project after closing the desktop window.
- The example handoff preserves the user's completion decision and distinguishes
  it from human content review.
- All internal links, asset links, navigation, mobile layouts, keyboard paths,
  and no-JavaScript download paths work; missing releases have an honest state.
- Public pages contain no placeholders, private paths, unsupported claims, or
  unfinished internal specifications accidentally exposed as user documentation.
- Manual updates, known issues, support, privacy, and licensing information are
  present and agree with the actual distributed product.
- A site rollback and withdrawn-download change have a documented procedure.

## 11. Decisions to settle before implementation or publication

| Decision | Working recommendation | When it matters |
| --- | --- | --- |
| Domain and hosting | Portable static output on an owned domain; provider unselected | Before production deployment |
| Binary origin | Follow the GitHub Releases direction, subject to public distribution access | Before download integration |
| Initial channel | Label an early build as preview if support and compatibility are still limited | Before drafting final download copy |
| Supported targets | Offer only install-tested targets; preserve the three-platform product goal | Before enabling each download |
| License and pricing | Owner supplies explicit terms; infer neither from repository visibility | Before public distribution |
| First AI client guides | Start with the clients validated against the released package | Before naming integrations on the site |
| Support and privacy | Named support destination and accurate, narrowly worded data explanation | Before launch |
| Site tooling | Small static implementation with Markdown guides; choose using project constraints | Before website implementation |

The immediate deliverable is this reviewable plan. Website implementation,
release publishing, and ticket creation remain separate follow-up work.
