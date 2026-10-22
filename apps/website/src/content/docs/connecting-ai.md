---
title: Connecting an AI tool
description: Connect an AI tool to your projects through MCP, give it the workflow skill, and check that it reads the right project.
group: AI setup
order: 1
appVersion: 0.2.0
---

Knightbook does not include an AI assistant. It works with the AI tool you already
use, through MCP, the Model Context Protocol: a standard way for an AI tool to use
programs on your computer. Connecting one is optional. Everything on the board also
works without it.

This guide connects Claude Code, the one tool it has been tested with so far, and
explains what the connection can and cannot tell you.

## Two separate steps

Setting up an AI tool takes two things, and they do different jobs:

- **The MCP server gives the tool its abilities.** It comes with Knightbook, in the
  app's own folder, with everything it needs to run. You do not install Node or
  anything else. Your AI tool starts it, from a configuration you copy out of the
  app.
- **The workflow skill teaches the tool how to work.** It is a short set of
  instructions: start a ticket only when you ask, hand finished work over in
  Verification with a note, and never decide Done. Without it the tool still has
  the abilities, and the server reminds it of the core rules when it connects, but
  it has not read the full workflow.

You can have one without the other, so the app keeps them as two steps.

## Before you start

- Knightbook is installed: see [Installing, updating and removing](../installation/).
- You have opened a project in it: see [Getting started](../getting-started/).
- Your AI tool is installed and you can sign in to it.

## 1. Allow AI access to the project

At the bottom of the Knightbook window, click the MCP status. At first it reads
**MCP not connected**. In the panel that opens, turn on **Allow AI access through
MCP**.

This is the only thing that lets an AI tool reach a project. Opening a project, or
its being in your recent projects, does not. Once you connect a tool, it can read
and change **every** project you have turned this on for, not only the one on
screen. Turn it off for a project to take access back; a connected tool loses it
on its next request, without restarting.

Do this in each project you want the AI tool to reach. You do not need to change
the tool's configuration when you allow another project later.

## 2. Copy the configuration

In the same panel, choose **Set up your AI tool**. Under **1. Connect your AI
client**, choose **Copy MCP configuration**, then pick your tool from the list. The
app copies a complete entry in that tool's format, and says below the button which
file it goes in.

The configuration names two things on your computer: the server inside the
installed app, and the app's list of projects you have allowed. It does not name
any project, so it is the same whichever project you copy it from, and you add it
to your tool once.

Always use the configuration the app copies. The paths in it are the real ones for
your computer, and they differ between Windows, macOS and Linux. For Claude Code, it
has this shape, with your own paths in place of the ones in angle brackets:

```json
{
  "mcpServers": {
    "knightbook": {
      "type": "stdio",
      "command": "<the app's folder>/resources/mcp/node",
      "args": ["<the app's folder>/resources/mcp/server.mjs", "--registry", "<your settings folder>/mcp-access.json"]
    }
  }
}
```

On Windows the program is `node.exe` and the paths use `\`. Where the app's folder
and your settings folder are on each system is listed under "Where it goes" in
[the installation guide](../installation/).

## 3. Add it to Claude Code

**Checked with:** Knightbook 0.2.0 and Claude Code 2.1.306 on Linux, on 2026-10-21.
Not yet on Windows or macOS. [What has been tested](#what-has-been-tested) says
exactly what was checked.

Choose **Claude Code or Claude Desktop** in the copy menu. Then add the entry to
Claude Code's user settings, which apply in every folder you start Claude Code in:

1. Quit Claude Code if it is running.
2. Open the file `.claude.json` in your home folder in a text editor. On Windows
   that is `C:\Users\<you>\.claude.json`; on macOS and Linux, `~/.claude.json`.
   Claude Code creates it the first time it runs.
3. Find `"mcpServers"` at the top level of the file, not inside `"projects"`.
   - If it is there, add the `"knightbook": { … }` entry from what you copied inside
     its braces, with a comma between it and the entry before.
   - If it is not, add the whole `"mcpServers": { … }` block from what you copied
     just inside the file's first `{`, followed by a comma.
4. Save the file, and start Claude Code again.

Keep the file valid JSON: Claude Code will not read a file with a missing comma or
brace. If you are unsure, paste it into a JSON checker before saving.

You could also put the entry in a `.mcp.json` file in a project folder, as the app's
note mentions. Avoid that in a folder you commit to Git: the paths in the entry are
specific to your computer and would not work for anyone else.

**What you should see:** run `claude mcp list` in a terminal, or type `/mcp` inside
Claude Code. `knightbook` is listed as connected. Back in the Knightbook window, the
MCP status changes to **MCP available**.

**If it does not:** run `claude mcp get knightbook` to see the error Claude Code
reports, and see [MCP not connected](../troubleshooting/#mcp-not-connected).

### Give Claude Code the workflow skill

In **Set up your AI tool**, under **2. Give it the workflow skill**, choose
**Install** on one of the two Claude Code rows:

- **Personal**: installs into `.claude/skills/projectspace` in your home folder, for
  every project on this computer.
- **This project**: installs into `.claude/skills/projectspace` inside the project.
  Git sees it, so it travels with the project to anyone who clones it.

The skill keeps the name `projectspace` from before the product was called
Knightbook, on purpose. Start Claude Code again after installing. To check that it
loaded, ask Claude Code which skills it has.

The app can see that the skill's files are where Claude Code looks. It cannot see
whether Claude Code loaded them.

## Other AI tools

The copy menu also offers **Codex**, **OpenCode** and **Another client**, each with a
note saying where the configuration goes. Knightbook has not been tested with any
of these yet. If you try one, follow that tool's own documentation for adding an MCP
server, then do the check below. The app can install the workflow skill for Codex.
For any other tool, **Export skill folder…** saves a copy you can put where the tool
reads skills, and **Copy skill text** gives you the instructions to paste into its
project instructions, such as `AGENTS.md`.

## 4. Check the connection

Before you let the AI tool change anything, check it reaches the project you mean.
Ask it:

> Use Knightbook to tell me the project name and checkout path, then list its
> documents and summarize the board. Do not change files or ticket statuses yet.

**What you should see:** the project's name, and a path that is exactly the folder
open in Knightbook. To compare, click the project name at the top left of the
window: the path is under **Open now**, and **Copy path** copies it. The documents
and tickets it lists match the **Documents** tab and the board.

**If the name or path is different:** see [the wrong project
appears](../troubleshooting/#the-wrong-project-appears).

## What "connected" does and does not tell you

The MCP status in the Knightbook window reports what the app observed, not what
the AI tool is doing:

- **MCP available** means a tool is connected and this project is allowed. It does
  not mean the tool is working in this project, or using the right copy of it.
- It does not tell you whether the tool loaded the workflow skill, or follows it.
  A tool can be connected and still ignore the workflow. Ask it which skills it
  has, and read its handoff notes.

The other labels, and what to do about each, are in
[Troubleshooting](../troubleshooting/#mcp-not-connected).

## Working with the window closed

Your AI tool starts Knightbook's server itself, separately from the window, so it
can work in your allowed projects with Knightbook closed. When you open the window
again, it reads the project from disk and shows what the tool changed. The app has
no Start or Stop button for the server, because the AI tool owns it; closing the
window leaves a connected tool running.

## One configuration, many projects

One configuration covers every project you allow. Each project is allowed by its
folder, so:

- **Several copies of one project**, such as two clones or Git worktrees, are
  separate entries. They have the same name, and only the folder path tells them
  apart. Allow only the copies you want the tool to work in, and if more than one
  is allowed, tell the tool which path to use. A tool following the workflow skill
  asks when it cannot tell.
- **Moving a project** to another folder takes its access away: the tool reports
  the old folder as unavailable rather than looking for the project somewhere
  else. Open the project at its new place and turn **Allow AI access through MCP**
  on again.
- **An older setup with one entry per project**, where each entry ends in `--root`
  and a folder, keeps working and reaches only its own folder. To move to the
  single configuration, allow each of those projects in the app, add the copied
  configuration as one new entry, and remove the old entries once it works.
  Knightbook never edits your AI tool's configuration.

## After updating Knightbook

Your AI tool keeps running the server it started until the tool restarts, so after
installing a new version of Knightbook, restart your AI tool. The configuration
names the app's folder, which stays the same when you update, so it should keep
working. If the tool cannot start the server afterwards, copy the configuration
again and replace the old entry. The name of the entry, `knightbook`, does not need
to change. [The installation guide](../installation/#updating) has the full update
steps.

A configuration saved while the app was called Projectspace names a folder the
current app does not use. Copy the configuration again and replace it.

## What has been tested

**Claude Code 2.1.306, Knightbook 0.2.0, Linux (Ubuntu 24.04), 2026-10-21.** In a
test machine without a desktop, using a Linux build of 0.2.0 made from its source
rather than the published installer:

- Claude Code read an entry in the shape **Copy MCP configuration** makes from the
  top-level `"mcpServers"` in `~/.claude.json`, and `claude mcp list` showed
  `knightbook` as connected.
- Started fresh with that configuration, Claude Code ran the server bundled with
  the app and answered the check prompt with the right project name, folder path,
  two documents and one ticket, and changed nothing.
- The Knightbook window was never open during the test, so this was also the
  window-closed case.

What this did not cover: the project was allowed by writing the same list of
allowed projects that **Allow AI access through MCP** writes, not by using the
switch in the window, and the workflow skill was not installed.

**Not yet checked:** Claude Code on Windows and macOS, Claude Desktop, Codex and
OpenCode. This section is updated as each is tried.
