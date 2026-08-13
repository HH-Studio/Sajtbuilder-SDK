---
name: manage-snabbsajt-site
description: Safely read and edit a live SnabbSajt site over MCP - draft-first, honest reports, never publish without an explicit human ask.
metadata:
  skill-version: "1.0.0"
  minimum-cli-version: "0.4.0"
  portable-format: "sajt-site@1"
  report-contract: "snabbsajt-import-report@1"
---

# Manage a SnabbSajt site over MCP

Use this workflow when the human has connected SnabbSajt as an MCP server and
wants an existing site read, edited, or prepared for publishing. This is the
**operating** skill; `build-snabbsajt-site` and `import-website` create a package,
this one changes a site that already exists.

The site belongs to a small-business owner who may not be technical, and it may
be public. Every rule below exists because a wrong edit is visible to their
customers.

## Safety contract

- **Draft-first.** Every write tool edits the DRAFT. The live site does not
  change until someone publishes.
- **Never publish on your own initiative.** Publishing needs an explicit ask
  from the human in this conversation ("publish", "gå live", "lägg ut det").
  A request to *edit* is never a request to publish.
- **You cannot publish alone, by design.** `publish_site` is deprecated and
  always fails. The real path is `prepare_publish` -> the human approves the
  review card -> `confirm_pending_action`. The same two-step guards
  `prepare_unpublish`, `prepare_search_visibility`, `prepare_publish_product`,
  `prepare_send_document`, `prepare_grant_access` and `prepare_create_company`.
  Do not try to route around it.
- **A denied tool is a boundary, not an obstacle.** The connection carries
  scopes (`site:read` always, then `content:write`, `publish`, `settings:write`,
  `crm:read`, `crm:write`, `domain:write`, `ai:generate`, and others), and the
  builder or agency may deliberately have restricted them. On a denial, say what
  was refused and stop. Never look for a second route to the same effect.
- **Never invent facts.** No prices, opening hours, dates, certifications,
  testimonials, or claims that the human or the existing site did not supply.
  Ask instead.
- **Money and PII are opt-in.** `generate_image` spends the owner's credits, and
  `list_leads` / `list_bookings` / `list_contacts` / `crm_update` read and write
  real customer data. Only touch these when asked for that specific thing.
- **Report what happened, not what you intended.** Name each section you edited
  and each one you could not.

## Workflow

1. **Orient before writing.** `list_sites` -> `get_site_overview` (business,
   vertical, language) -> `list_pages` -> `get_page` for the page in question.
   Write in the site's own language.
2. **Check the starting state** with `list_draft_changes`, so you can tell the
   human afterwards which changes are yours and which were already waiting.
3. **Edit the draft.** `update_section_text` (one content field by dot path, e.g.
   `headline`, `items.0.title`), `add_section`, `move_section`,
   `set_section_hidden`, `create_page`, `create_blog_post`, `update_page_seo`.
   Prefer the smallest edit that does the job.
4. **Verify.** Re-read with `get_page`, then `list_draft_changes`. Do not claim
   an edit landed unless a read confirms it.
5. **Report.** What changed, what is still only in the draft, what you refused
   and why, and what the human should look at in preview.
6. **Publish only on an explicit ask:** `prepare_publish` (this creates the
   review card and publishes nothing), then let the human approve. Tell them
   plainly that the approval is theirs to give.

## Advanced tools

`get_section_json`, `replace_section_content` and `set_section_layout` round-trip
whole sections and layout tokens. They require the workspace's advanced-editor
(Labs) grant and fail closed without it — treat a denial as "this workspace is
an ordinary one" and fall back to `update_section_text`. When you do use them,
pass the `rev` from `get_section_json` as `clientRev`, so a concurrent edit in
the browser is rejected instead of silently overwritten.

## Version check

Skills, CLI and site format move together. If a SnabbSajt CLI is present, run
`snabbsajt --version`; below this skill's `minimum-cli-version` header, stop and
tell the human to run `snabbsajt upgrade` or `npm install -g @snabbsajt/cli`
rather than proceeding on an older contract. If an MCP tool named in this skill
does not exist on the connected server, say so instead of substituting one that
sounds similar.
