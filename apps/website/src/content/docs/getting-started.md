---
title: Getting started
description: Install Knightbook, open a project folder, find its documents and board, and try a first AI handoff.
group: Start here
order: 1
appVersion: 0.2.0
---

This guide takes you from installing Knightbook to a first piece of work handed
back to you for checking. It takes about twenty minutes, most of it in step 7. You
do not need Git, Node or any developer tools, and steps 1 to 4 need no AI tool at
all.

**How much of this has been checked.** This guide was written on 2026-10-21 for
Knightbook 0.2.0, from the app's own screens and labels. On 2026-10-22 it was
followed on Linux, in a fresh Ubuntu 24.04 test machine without a desktop, with
Claude Code, up to accepting the work in step 7, which was not tried. It has not
yet been followed on a clean Windows or macOS install. Steps marked **Not yet
checked** describe what the app is built to do, not something anyone has watched it
do on a fresh computer. This note is updated as each system is checked.

## 1. Install and open Knightbook

Download the installer for your computer from the [download page](/download/) and
install it as [Installing, updating and removing](../installation/) describes for
your system. Then open Knightbook from the Start menu, the Applications folder or
your applications menu.

**What you should see:** a window titled Knightbook with one button, **Choose a
project folder**. Once you have opened projects, they are listed under **Recent**.

**If it does not open:** see [the installer will not run](../troubleshooting/#the-installer-will-not-run).

## 2. Choose a project folder

A Knightbook project is an ordinary folder. It can be a code repository you already
have, or a new empty folder for something you are planning.

Choose **Choose a project folder** and pick the folder. What happens next depends on
the folder:

- **It already has a Knightbook board**, because you or someone else set it up
  before, for example in a repository you cloned. It opens straight to its board.
- **It has no board yet.** Knightbook shows **Set up this folder** with the folder's
  path. Nothing has been written at this point.

To set up a new folder:

1. Check the **Project name**. It starts as the folder's name; change it if you like.
2. Under **Documents already here**, Knightbook offers what it found, such as
   `README.md` and the `docs` folder. Leave them ticked to include them. Including
   one does not move, copy or edit it.
3. Choose **Set up this folder**.

Setting up adds one folder, `.projectspace/`, and changes no existing file. It holds
the board and its records as plain Markdown. The folder keeps the name
`.projectspace` from before the product was called Knightbook; that is deliberate.
[Projects and documents](../projects-and-documents/#what-projectspace-holds)
explains what is inside, and what to add to `.gitignore` if the folder is a Git
repository.

**What you should see:** the project's board, with its name at the top left and
four tabs: **Board**, **Documents**, **Plans** and **Archive**. A new project's
board is empty.

**If it goes wrong:** the setup screen says **Could not set up this folder** with the
reason, and nothing is written. If a folder that should have a board opens to the
setup screen instead, check it is the right folder: see [the wrong project
appears](../troubleshooting/#the-wrong-project-appears).

## 3. Find your documents

Open the **Documents** tab. Anything you included during setup is listed there.
Choose a document to read it, formatted.

To add more, choose **Include** under the list, then **Markdown files…** or **A
folder…**. Including a folder includes every Markdown file inside it, and files you
add to it later. **New** creates a new Markdown file in the project and includes it.

Knightbook shows documents for reading and review. To change one, choose **Edit
externally**: it opens in the editor your computer uses for Markdown, and you save
there as usual. When you come back to the Knightbook window, it shows your change.

**What you should see:** each included document in the list, and its contents
when you open it.

**If a document is missing or a change does not appear:** see [documents or changes
are missing](../troubleshooting/#documents-or-changes-are-missing).

## 4. Understand the board

The **Board** tab has four columns, and they say where each piece of work stands:

- **Backlog**: wanted, not started.
- **In progress**: someone, you or an AI tool, is working on it.
- **Verification**: finished, waiting for you to check.
- **Done**: you checked it and accepted it.

Create a ticket with the **+** at the top of the Backlog column. Try a small one,
for example:

- **Title:** Add a "Getting help" section to the README
- **Intended outcome:** someone reading the README knows where to ask a question.
- **Acceptance criteria:** the README has a section called "Getting help"; it links
  to where questions go.

The new ticket asks for a **Title**, a **Type** and a **Body**. The body starts with
**Intended outcome**, **Acceptance criteria** and **Notes** headings to write under.
Keep the criteria to statements you can check one at a time.

**What you should see:** the ticket's card at the top of Backlog, marked **Next
up**, because it is the first ticket in Backlog with nothing holding it back.

**If the board says records could not be read, or your change was not saved:** see
[a change was not saved, or a record cannot be read](../troubleshooting/#a-change-was-not-saved-or-a-record-cannot-be-read).

[Tickets, verification and review](../tickets-and-verification/) covers
prerequisites, plans and archiving.

## Using Knightbook without an AI tool

You can stop here and use Knightbook on its own. Without an AI tool you can:

- set up project folders, and include, create, read and review documents;
- create, edit, order and move tickets, add prerequisites and blockers, and accept
  work as done or record that it did not pass;
- mark tickets reviewed, make plans, and archive and restore tickets.

Two things happen outside the app, with or without AI:

- **Editing document text** happens in your own editor, through **Edit externally**.
- **The work itself**, writing code or text, is done by you or an AI tool in your own
  tools. Knightbook records where the work stands; it does not do it.

The rest of this guide needs an AI tool that supports MCP, such as Claude Code.

## 5. Connect an AI tool, if you want to

An AI tool reaches your project through Knightbook's MCP server, which comes with
the app. The tool starts the server itself, so you set it up once in the tool and
then choose in Knightbook which projects it may reach.

1. At the bottom of the window, click the MCP status, which reads **MCP not
   connected** at first.
2. Turn on **Allow AI access through MCP**. Any AI tool you connect can then read
   and change this project, and every other project you turn this on for.
3. Choose **Set up your AI tool**. Under **1. Connect your AI client**, choose **Copy
   MCP configuration**, pick your tool, and paste the configuration where the app
   says. Under **2. Give it the workflow skill**, choose **Install** for your tool.
   The skill teaches the AI how to work on the board, and that only you decide Done.
4. Restart your AI tool.

[Connecting an AI tool](../connecting-ai/) has each of these steps in detail,
including exactly where the configuration goes for Claude Code.

**What you should see:** after your AI tool starts, the status reads **MCP
available**. Checked on Linux; **Not yet checked** on a clean Windows or macOS
install.

**If it does not:** see [MCP not connected](../troubleshooting/#mcp-not-connected).

## 6. Confirm the connection

Before you let the AI change anything, check it is looking at the right project.
Ask it:

> Use Knightbook to tell me the project name and checkout path, then list its
> documents and summarize the board. Do not change files or ticket statuses yet.

**What you should see:** the project name you gave in step 2, and a path that is
exactly the folder you opened. Compare it with the path in Knightbook: click the
project name at the top left, and the path is under **Open now**. The AI should list
the documents from step 3 and the ticket from step 4. Checked on Linux; **Not yet
checked** on a clean Windows or macOS install.

**If the name or path is different:** see [the wrong project
appears](../troubleshooting/#the-wrong-project-appears). Several copies of one
project, such as two clones, have the same name; only the path tells them apart.

## 7. Try a small handoff

Ask the AI to do the ticket from step 4:

> Start the Knightbook ticket "Add a 'Getting help' section to the README". When
> you have finished, hand it off in Verification.

Following the workflow skill, the AI moves the ticket to **In progress**, does the
work, then moves it to **Verification** with a handoff note at the end of the
ticket. The note says what changed, how it was checked, what was **not** verified,
and what is left for you to check.

Now check the work yourself, in your normal tools: open the README and read the new
section. Then decide:

- **It is right.** Choose **Accept as done** at the foot of the ticket, and confirm.
  The card moves to Done and shows **Accepted by you**. You can also tell the AI
  "that ticket is done", and it records your decision; the card then shows
  **Recorded by AI**.
- **It is not right.** Choose **Did not pass…**, write what you found, and choose
  **Record the issue**. The ticket stays where it is, marked **Failed
  verification**, until you decide what to do.

The AI cannot move a ticket to Done by itself. Finishing its work, passing tests or
its own review do not count as your decision.

**What you should see:** the ticket in Verification with a handoff note, and after
you accept it, in Done. Checked on Linux as far as the handoff note in
Verification; **Not yet checked:** accepting it, and the whole step on a clean
Windows or macOS install.

**If Done or the label on the card looks wrong:** see [Done or review looks
wrong](../troubleshooting/#done-or-review-looks-wrong).

## 8. Come back later

Knightbook remembers the projects you open on this computer. Next time, choose one
under **Recent**, or click the project name at the top left of an open project to
switch, or choose **Open folder…** there for another.

Everything you did is in the project folder: documents where they always were, and
the board in `.projectspace/`. If the folder is a Git repository, commit
`.projectspace/` along with your work, and the board travels with it.

Knightbook reads the project again whenever its window comes back into focus, so
changes made in your editor, through Git or by an AI tool appear when you switch
back. If the window kept focus while something changed, use the refresh button at
the end of the bar along the bottom of the window.

**What you should see:** the project opens to the board as you left it, with the
ticket from step 7 in Done, and its documents in the **Documents** tab.

**If something you expected is missing:** see [documents or changes are
missing](../troubleshooting/#documents-or-changes-are-missing).
