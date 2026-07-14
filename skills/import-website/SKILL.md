---
name: import-website
description: Convert an existing public website or local export into a safe editable SnabbSajt site package.
metadata:
  skill-version: "1.0.0"
  minimum-cli-version: "0.1.0"
  portable-format: "sajt-site@1"
  report-contract: "snabbsajt-import-report@1"
---

# Import a website into SnabbSajt

Use this workflow when a developer asks to migrate a Next.js site, static HTML,
or WordPress export. Treat source code as evidence, never runtime code.

## Safety contract

- Never execute imported React, JavaScript, PHP, plugins, scripts, or arbitrary CSS.
- Never forward local cookies, authorization headers, or environment secrets.
- Convert source into `PortableSiteV1`, validate it, and report every loss,
  replacement, warning, and manual follow-up in `ImportReportV1`.
- Analytics, booking, and animation behavior may only become allowlisted native
  SnabbSajt settings or sections.
- Keep preview and production on the same SnabbSajt renderer.

## Workflow

1. Run `snabbsajt site doctor --json` and stop on incompatible formats.
2. Preserve the source location and hashes as evidence.
3. Inspect the source without executing it. Inventory routes, copy, media, SEO,
   forms, analytics, booking, animations, redirects, and unsupported behavior.
4. Map the inventory to supported SnabbSajt sections and settings. Prefer native
   equivalents. Mark uncertain mappings for review.
5. Build a normal `site.json` package plus local assets.
6. Run `snabbsajt site validate <dir> --json`.
7. Run `snabbsajt site inspect <dir> --json` and compare route/content counts to
   the source inventory.
8. Produce `import-report.json` using `snabbsajt-import-report@1`. Cite source
   paths or URLs for material claims and state what was not imported.
9. Pack only after validation passes: `snabbsajt site pack <dir>`.

The current CLI does not require an API key or SnabbSajt login for these local
steps. Do not claim a hosted import or publish happened unless separately proven.
