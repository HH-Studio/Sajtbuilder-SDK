---
name: review-site-package
description: Review a SnabbSajt portable package for correctness, safety, editability, and honest import evidence.
metadata:
  skill-version: "1.0.0"
  minimum-cli-version: "0.1.0"
  portable-format: "sajt-site@1"
  report-contract: "snabbsajt-import-report@1"
---

# Review a SnabbSajt site package

Use this workflow before handing a generated or imported package to a customer.

## Review gates

1. Run `snabbsajt site doctor --json` and record compatibility.
2. Run `snabbsajt site validate <dir> --json`. A failing validator blocks handoff.
3. Run `snabbsajt site inspect <dir> --json` and compare counts with the source or brief.
4. Confirm all asset references remain inside the package and no secrets exist.
5. Confirm the package contains no executable JavaScript, PHP, plugins, raw HTML,
   or arbitrary CSS presented as SnabbSajt runtime behavior.
6. Check routes, locale prefixes, redirects, SEO fields, contact details, forms,
   analytics, booking, animations, and media. Mark native replacements explicitly.
7. If an import report exists, verify its format is `snabbsajt-import-report@1`,
   cited evidence resolves, hashes match, and unsupported behavior is disclosed.
8. Confirm ordinary customer edits remain constrained to safe text, media, and
   supported settings.
9. Pack only after every blocking finding is fixed.

Report findings by severity, then give the exact validation evidence. Local
review requires no API key or SnabbSajt login.
