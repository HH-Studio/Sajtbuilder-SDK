---
name: import-website
description: Convert an existing public website or local export into a safe editable SnabbSajt site package.
metadata:
  skill-version: "1.1.0"
  minimum-cli-version: "0.1.0"
  portable-format: "sajt-site@1"
  report-contract: "snabbsajt-import-report@1"
---

# Import a website into SnabbSajt

Use this workflow when a developer asks to migrate a Next.js site, rendered
HTML, or a WordPress export. The deterministic importer runs first. AI may then
improve the native mapping, but it cannot invent facts or bypass review.

Read [the shared mapping rules](references/import-mapping-rules.md) completely
before inspecting or changing a candidate package.

## Safety contract

- Never run the source or execute imported React, JavaScript, PHP, plugins,
  scripts, build tools, or arbitrary CSS.
- Never install source dependencies or load its environment variables.
- Never forward cookies, authorization headers, credentials, or secrets.
- Convert evidence into `PortableSiteV1` through native SnabbSajt sections.
- Preserve and cite every loss, replacement, warning, proposal, and manual
  follow-up in `ImportReportV1`.

## Workflow

1. Run `snabbsajt site doctor --json` and stop on incompatible formats.
2. Run `snabbsajt site import html <source> -o <candidate-dir> --json` for a
   public URL, local HTML entry, or static zip.
3. Read the deterministic evidence and report. Preserve their ids and hashes.
4. Inventory routes, copy, media, SEO, forms, analytics, booking, animations,
   redirects, and unsupported behavior without executing the source.
5. Improve `site.json` only with native, evidence-backed sections/settings.
6. Add every AI-created mapping as an `ai_proposed` report item with real
   evidence ids and confidence, following the shared lint rules.
7. Run `snabbsajt site validate <candidate-dir> --json` after each meaningful
   proposal.
8. Run `snabbsajt site inspect <candidate-dir> --json` and compare page,
   section, content, and asset counts to the evidence inventory.
9. Run `snabbsajt site doctor --json` again before handoff.
10. Require human approval for all `ai_proposed`, `missing`, `unsafe`, and
    `manual` findings. The human records it with
    `snabbsajt site import approve <candidate-dir> --yes`.
11. Pack only after approval: `snabbsajt site pack <candidate-dir> -o site.zip`.

Do not claim the migration, browser import, edit, publish, or restore succeeded
unless that exact step was verified. Local conversion requires no SnabbSajt API
key or bundled model client.
