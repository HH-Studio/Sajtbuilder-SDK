---
name: build-snabbsajt-site
description: Build a constrained portable SnabbSajt package that customers can safely edit.
metadata:
  skill-version: "1.0.0"
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

1. Run `snabbsajt site doctor --json`.
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
