---
name: build-snabbsajt-site
description: Build a new SnabbSajt site package from a brief - constrained, portable, safe for a non-technical customer to edit. Use when the human says "build a site for <customer>", "bygg en sajt at <kund>", "scaffold a SnabbSajt package", "gor en ny sajt", or hands over a brief, copy, and images with no existing website. Creates a package from scratch; use import-website when a source website already exists, and manage-snabbsajt-site when the site is already live.
metadata:
  skill-version: "1.2.0"
  minimum-cli-version: "0.1.0"
  portable-format: "sajt-site@1"
  report-contract: "snabbsajt-import-report@1"
---

# Build a SnabbSajt site package

Use this workflow to create or revise a developer-built site that must remain
safe for a non-technical customer to edit.

## Product contract

- Use only supported `PortableSiteV1` pages, sections, themes, assets, and redirects.
- Do not add raw HTML, arbitrary CSS, executable JavaScript, or framework runtime code.
- Preserve constrained design choices so text and media edits cannot break layout.
- Use native SnabbSajt settings for allowlisted analytics and native sections for
  forms or booking alternatives.
- Keep generated asset paths relative and inside the package.

## Workflow

Full command surface, flags, and per-command failure modes:
[references/cli-commands.md](references/cli-commands.md). Every command below
runs locally and needs no credential.

1. Run `snabbsajt site doctor --json`. Stop on an incompatible format — upgrade
   the CLI rather than proceeding on an old contract.
2. Create a starter with `snabbsajt site init <dir> --template nextjs` or
   `--template html`.
3. Edit `site.json` and assets using the installed Site Kit types as the contract.
4. Run `snabbsajt site validate <dir> --json` after each meaningful change.
5. Run `snabbsajt site inspect <dir> --json` and verify page, section, asset, and
   section-type counts.
6. Review the package with the `review-site-package` skill.
7. Pack with `snabbsajt site pack <dir> -o <name>.zip`.

Local build, validation, inspection, and packing require no API key. Publishing
and account access are separate product workflows.

## Handoff

The package is data; landing it in a site is a separate, credentialled step.

- `snabbsajt link` connects this directory to one of the human's sites with a
  read-only, single-site token; `snabbsajt pull` reads the current draft.
- `snabbsajt push <dir> --dry-run` merges the package into that site's draft
  server-side and rolls it back, printing what a real push would do. Run it
  before every real push. A push needs the separate admin token from
  `snabbsajt admin pair`, which the human mints through a browser approval —
  you cannot self-serve it, so stop and ask.
- Sections match on `externalKey`. Anything the customer already edited in the
  app comes back as a **conflict** and is skipped unless the human names it with
  `--force-key`. Never pass `--force-key` on your own judgement; a conflict is
  the customer's own work.
- Nothing published: `push` lands in the draft. For ongoing content edits and
  the publish handshake afterwards, use the `manage-snabbsajt-site` skill.
