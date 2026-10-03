# Homepage, header, and footer design brief

Status: proposed visual direction, prepared 2026-10-02 for the Website plan.
This is an implementation brief, not an approved design or a built homepage.

Read this alongside [the website content and launch proposal](landing-page-and-user-documentation.md),
[the app's visual direction](../research/ui-ux-design-direction.md), and
[the website architecture](../project-workspace-technical-design.md#the-public-website-2026-10-01-d-042).
The content proposal owns product claims and release requirements; this brief
makes its layout, typography, and shared navigation concrete.

## What the scaffold needs

The pulled site has a useful foundation: static Astro, shared layout, blue-gray
tokens, system typography, a no-script mobile menu, and the approved PNG logo.
The current homepage is only a heading and paragraph. Its small logo, compact
header, one-line footer, and largely empty viewport do not yet communicate the
product. Reuse the foundation and change the composition.

As inspected on 2026-10-02, only the homepage and 404 are built. Documentation,
releases, download, and the workflow anchor are planned destinations. A shell
redesign does not make those routes exist. Track their availability honestly in
private previews; the other Website tickets deliver them before launch.

## Recommended direction

A calm product page built around the work itself: a readable statement on the
left, a generous real board screenshot on the right, followed by a short workflow
and substantial explanations. The visible Verification column is the memorable
element: this is where AI work returns to the person's decision.

Carry the app's blue-gray layers and restrained blue actions into the website.
Use open space and typography for grouping. Reserve a bordered surface for
actual product images and meaningful notices rather than enclosing every section
in identical cards. Keep the chess/book identity in the approved logo.

### Palette and typography

Reuse the existing `--kb-*` tokens; these values describe their current roles.

| Role | Light | Dark |
| --- | --- | --- |
| Page background | #eef0f4 | #14161a |
| Raised product surface | #ffffff | #1c1f26 |
| Quiet section/footer surface | #f7f8fa | #181b21 |
| Main text | #1b1f27 | #e4e7ec |
| Supporting text | #4a5263 | #b4bac6 |
| Action and link accent | #3a588f | #9fb3dc |

Follow system appearance in both schemes. Keep the existing system sans-serif
stack, led by Segoe UI on Windows. Typography, spacing, and product imagery
provide the character; there is no need for a webfont dependency.

Recommended homepage scale: hero 48–56px on desktop and 34–40px on phones,
semibold with 1.08–1.15 line height; section titles 28–34px; body 17–18px at
1.6 line height; navigation 15–16px; captions and footer supporting copy 14–15px.
Use a responsive scale and rem units. Keep hero copy around 38–44ch and reading
sections around 60–72ch. Do not enlarge every guide heading when styling the hero.

Keep all headline words the same color. Avoid uppercase labels, decorative
gradients, glowing backgrounds, floating ornaments, automatic section reveals,
stock AI illustrations, integration-logo walls, and invented social proof.

### Layout dimensions

Keep the existing 1120px content width. Use 24–32px side gutters on desktop,
20–24px on tablets, and 16px on phones. Major sections have roughly 80–104px
vertical spacing on desktop and 48–64px on phones. Use the existing spacing
scale where it fits. Align the header, hero, section headings, and footer brand
to the same left edge.

The hero uses approximately 42% copy / 58% image with a 40–48px gap. Switch to
one column when both sides cannot remain readable, around 900px rather than
squeezing desktop proportions onto a tablet. No fixed hero height or forced
full-screen section. Image and copy determine the height.

## Header

A quiet full-width header with the content aligned to the page grid. Target a
72–80px row on desktop. Keep it in normal flow for the first version; a sticky
header would add overlap and anchor-offset work without improving this page.

- Left: approved PNG mark and Knightbook wordmark, linking home. Aim for about
  28–32px of visible artwork and a 20px semibold wordmark with a 10–12px gap.
  The source PNG has transparent margins: size the visible artwork, not just its
  square file bounds. Use the existing deterministic asset derivation if needed;
  never redraw, trace, recolor, or replace the approved artwork.
- Right: How it works, Documentation, Releases, then the Download page action.
  Use a 24–28px navigation gap and a modest 8px button radius, not a pill.
- Download is navigation to the download page, not a promise that an installer
  exists. Asset/version/availability claims belong to the release-data component.
- Hover and current-page state use text/underline treatment. Set `aria-current`
  only for the actual current destination. Do not imply an anchor is a separate page.
- At narrow widths, keep brand and Download on the first row. The existing native
  `details/summary` Menu can occupy a deliberate second row with full-width
  links when open. An intentional two-row header is preferable to squeezed links.
  Do not add JavaScript just to make a mobile drawer.
- Preserve the skip link, one accessible navigation per responsive state, clear
  keyboard focus, and approximately 44px action targets. Test the open menu at
  320px and with 200% zoom.

## Homepage, in order

### 1. Hero and product image

Retain the content proposal's headline:

> Your project context, beyond the chat.

Retain its supporting copy:

> Keep project documents, decisions, and a work board together in a desktop
> workspace. Connect your existing AI tools, keep your Markdown in your project
> folder, and decide when the work is done.

Left-align the headline, paragraph, and actions. Keep the headline to roughly
three short lines on a wide screen; do not add a decorative eyebrow.

The primary action and its state come from the download ticket's shared
release-data rendering. With no release, show “Downloads are not available yet”
as status text, not a disabled button posing as a download. Keep “All downloads”
as a link to the download page. With a verified asset, show its actual platform,
architecture, version, and preview state where applicable. The secondary link
is “Read the getting-started guide.”

On the right, use an authentic board screenshot of a fictional project. Keep
the four column labels and Verification legible. Prefer a full-width image with
an 8–12px radius and quiet border; do not tilt it, layer browser chrome over the
desktop app, or invent ticket states. Set intrinsic dimensions and serve suitable
image sizes. Caption: “See what is planned, what is in progress, and what is
ready for you to verify.”

On phones the order is headline, paragraph, actions/status, image, caption.
Do not shrink a four-column board into unreadable text; supplement the full
image with a clearly described detail crop if necessary. The surrounding prose
must explain the workflow without requiring the image.

### 2. How it works

Use the actual `how-it-works` anchor. A heading and one horizontal sequence on
desktop, stacked steps on phones. Numbers are useful here because this is an
ordered process; do not put each step in a separate promotional card.

1. Open your project — choose its local folder.
2. Keep the context together — include Markdown and capture planned work.
3. Work with your AI tool — connect a compatible client and ask it to act.
4. Verify and decide — inspect the handoff and decide whether work is complete.

Link to the getting-started guide. Explain MCP once near the third step:
“MCP is the connection that lets a compatible AI tool read and update this project.”
Do not place configuration snippets in the hero.

### 3. Three substantial product explanations

Use spacious sections, with consistent alignment rather than a grid of six
feature cards. A quiet surface can distinguish one section; avoid alternating
backgrounds mechanically at every boundary.

- **Files you can keep using.** Pair text with a real document screenshot,
  explaining ordinary Markdown and including existing documents in place.
  Screenshot labels must match the offered release; do not show the proposed
  formatted editor as shipped.
- **A shared view of the work.** Explain how documents, tickets, and dependencies
  give the next session context. Refer back to the board; another full board
  screenshot is unnecessary. A concise text example can show a ticket's outcome,
  acceptance criteria, and handoff without pretending to be application UI.
- **Your completion decision.** Explain Backlog → In progress → Verification →
  Done as labeled workflow states. Give Verification more emphasis in the
  diagram and state that the user decides Done. Keep content review separate
  from acceptance; do not label an AI handoff “human reviewed.”

### 4. FAQ

Use native `details/summary` rows separated by quiet rules in a readable column.
Keep all eight questions and answer boundaries from the content proposal §4.
Use sentence case and a visible expansion indicator. Answers remain accessible
without scripts. License/pricing, platform support, and client compatibility
answers wait for evidence rather than being inferred.

### 5. Closing action

One concise heading: “Keep the next session connected to the project.”
Repeat the same release-aware action/status and getting-started link. Give the
section its own space; do not repeat the whole hero paragraph or make it a large
rounded banner.

## Footer

The footer should feel like the end of the same page, not a thin strip of
duplicated header links. Use the quiet surface, one top divider, and roughly
48–64px vertical padding.

On desktop, use a brand block on the left and two compact destination groups on
the right:

| Block | Content |
| --- | --- |
| Brand | Approved mark + Knightbook; “Project documents and a work board, together.” |
| Product | Download, How it works, Releases |
| Guides | Documentation; Getting started and Troubleshooting once built |

Below, use a modest utility row for Privacy, License, and Support when their pages,
terms, and destinations exist. These are reserved destinations in the design,
not links to invent now. The repository is private, so do not add a GitHub/source
link or an “open source” badge. Do not invent a legal entity or an all-rights-reserved
statement while ownership/license terms are unresolved.

On phones, stack the brand first, keep the two short link groups in two columns
when they fit, and wrap or stack the utility row. Keep link labels visible and
tap targets comfortable. Share destination definitions with the header; group
them differently without maintaining competing URLs.

## Wireframe

```text
Knightbook                         How it works  Documentation  Releases  Download
---------------------------------------------------------------------------------
Your project context,              Actual board screenshot
beyond the chat.                   Four readable column labels
Supporting paragraph              Verification visible
Release state / action             Caption
All downloads · Getting-started guide

How it works
Open project → Keep context → Work with AI → Verify and decide

Files you can keep using            Actual document screenshot

A shared view of the work           A small, plain-language ticket example

Your completion decision           Backlog → In progress → Verification → Done

Questions, answered
Eight native expandable answers

Keep the next session connected to the project.
Same release state / action and getting-started link
---------------------------------------------------------------------------------
Knightbook + one-line description   Product                 Guides
                                   Download                Documentation
                                   How it works            Getting started*
                                   Releases                Troubleshooting*
Utility links*: Privacy / License / Support
* Publish only when the destinations and facts exist.
```

## Ticket scope and delivery

1. **Shared header and footer:** a separate Website phase 2 ticket. Depends only
   on the completed Astro scaffold. Redesign the shared shell on homepage and
   404, preserving routes and no-JavaScript behavior. This can be the next work
   while release data is still being prepared.
2. **Homepage:** extend existing ticket `36aabb4a` with this brief. Keep its
   download-page/release-data dependency `a53c3c06` and add the shell ticket as
   a prerequisite. Preserve its existing content and claims acceptance criteria.
3. **Publication:** final screenshots come from ticket `90c7aba5`; release facts,
   public guides, legal/support destinations, and route completion stay with
   their existing tickets. Draft screenshot slots and unresolved required copy
   must fail a production build, as the homepage ticket already requires.

No site code, new library, release, deployment, legal terms, or backlog reorder
is authorized by this design brief itself. This planning pass leaves implementation
tickets in Backlog; it does not start them.

## Implementation acceptance and evidence

For the future implementation, capture desktop screenshots at 1440px and 1024px,
and narrow screenshots at 768px, 390px, and 320px in both schemes. Test 200% zoom,
the open mobile menu, keyboard order/focus, FAQ expansion, long navigation labels,
and unavailable/preview/withdrawn release states.

Text should reach 4.5:1 contrast, large text and essential control boundaries 3:1.
No clipped content, page-wide horizontal scroll, inaccessible links, or essential
information conveyed only by color/image. Disable JavaScript and repeat navigation,
FAQ, and download checks. Check the 404 with the same redesigned shell.

Extend the existing built-HTML tests rather than adding a second test harness.
For shell work, retain no-script output, skip link, navigation, native mobile
menu, logo, and 404 checks. For homepage work, trigger release states and prohibited
claims checks with actual fixtures; verify internal routes/anchors when their
page tickets deliver them.

Run `pnpm check` and `pnpm --filter @knightbook/website build`, then inspect the
preview. Passing automated tests alone does not establish visual acceptance.
Record remaining draft assets and unavailable routes explicitly in the handoff.
