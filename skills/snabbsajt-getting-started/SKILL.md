---
name: snabbsajt-getting-started
description: Entry point for any SnabbSajt work - picks the right layer (local CLI, delivery token, or MCP), gets the terminal or agent connected, and routes to the sibling skill that does the job. Use when the human mentions SnabbSajt or snabbsajt, asks to connect/koppla a site, install the CLI or skills, says "vad kan jag gora med snabbsajt", "connect my site", "set up the MCP", "pair my terminal", or asks for SnabbSajt work without saying which tool. Start here when unsure which SnabbSajt skill applies.
metadata:
  skill-version: "1.0.0"
  minimum-cli-version: "0.4.0"
  portable-format: "sajt-site@1"
  report-contract: "snabbsajt-import-report@1"
---

# Getting started with SnabbSajt

SnabbSajt is a website builder for small businesses. The sites belong to owners
who are often not technical, and they are usually public. Everything below is
shaped by that: draft-first, human-approved, nothing invented.

There are three layers. Picking the wrong one is the most common way an agent
wastes a session.

| Layer | Use it for | Credential |
| --- | --- | --- |
| **CLI, `site` namespace** | building/importing/validating a site **package** offline | none |
| **CLI, `link`/`pull`** | reading a live site's published content into a repo | delivery token (read-only, one site) |
| **CLI `admin` / `push`, or MCP** | changing a site that already exists | admin token or MCP connection, capability-scoped |

Rule of thumb: **does the site exist yet?** No → package layer. Yes → MCP (or
`admin`) layer.

## Step 1 — state check before anything else

Never assume the setup is done.

```bash
snabbsajt --version          # missing => not installed
snabbsajt site doctor --json # format compatibility, always before package work
snabbsajt link --status --json   # is this directory already linked to a site?
```

If the CLI is missing: `npm install -g @snabbsajt/cli`. If it is older than a
skill's `minimum-cli-version`: `snabbsajt upgrade`, and do not proceed on the
old contract.

For MCP work, check the connected server's tool list instead. If a tool this
skill set names is absent, say so — never substitute one that sounds similar.

## Step 2 — connect the layer you need

**Read a live site from a repo** (read-only, cannot change anything):

```bash
snabbsajt link --json     # lists the human's sites; they pick one
snabbsajt pull --json     # writes snabbsajt/published.json
```

**Write to a live site from the terminal:**

```bash
snabbsajt admin pair --scopes site:read,content:write --json
```

**Write to a live site from this agent:** the human adds
`https://snabbsajt.com/api/mcp` as an MCP connector and approves the scopes in
their SnabbSajt account.

All three need a human at a browser. Print the URL and code, then stop and
wait — you cannot self-serve any of them, by design.

Full command surface, credential split, and per-command failure modes:
[references/cli-commands.md](references/cli-commands.md).
Scopes, tool catalogue, and the confirm handshake:
[references/mcp-tools.md](references/mcp-tools.md).

## Step 3 — hand off to the skill that does the work

| The human wants | Skill |
| --- | --- |
| an existing website converted into a SnabbSajt package | `import-website` |
| a new site built from a brief, for a customer to edit | `build-snabbsajt-site` |
| a package checked before anyone imports it | `review-site-package` |
| an existing live site read, edited, or prepared for publish | `manage-snabbsajt-site` |

The package skills end at a validated `.zip`. Landing it is a separate,
credentialled step: the human uploads it in the app, or you run
`snabbsajt push <dir> --dry-run` first and then the real push. A push writes the
DRAFT only.

## Boundaries that hold at every layer

- **Draft-first.** Nothing you do makes a site live. Publishing is a
  `prepare_*` → human approves → `confirm_pending_action` handshake, and you
  cannot complete it alone.
- **A denied tool or scope is a boundary, not an obstacle.** Say what was
  refused and stop.
- **Never invent facts** — prices, opening hours, dates, certifications,
  testimonials. Ask, or leave it out.
- **Never execute source material.** Imported React, PHP, plugins, scripts, and
  arbitrary CSS are evidence to read, never code to run.
- **Money and PII are opt-in.** Image generation spends the owner's credits;
  leads, bookings, and contacts are real people. Touch them only when that is
  the ask.
- **Report what happened, not what you intended.** Verify a write by reading it
  back before you claim it landed.

## Install these skills for the next session

```bash
snabbsajt skills doctor  --agent auto --json   # drift vs what this CLI ships
snabbsajt skills install --agent auto --json   # project-local unless --global
```
