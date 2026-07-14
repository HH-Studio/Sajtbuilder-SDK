# UX polish bug hunt: HTML import CLI

## Verdict

The HTML import CLI is polished enough for developer beta use after the fixes
in this pass. The conversion, review, approval and packing journey is complete.
This is a terminal-only surface, so browser, responsive viewport and pointer
testing do not apply. The SnabbSajt browser-side upload/editor journey was not
tested here.

## What was tested

- Commands: `site import html`, `site import approve`, `site validate`,
  `site pack`, nested help and JSON failures.
- Inputs: the synthetic multipage fixture, a single local HTML file, hostile
  analytics prose, malformed contact escapes, unavailable remote media, long
  content, non-HTML URL responses and missing `/tmp` files.
- Review states: `ready`, `review_required`, `blocked`, review-draft packing,
  explicit approval, evidence-cited AI proposals, provenance changes and
  marker-file deletion.
- Tools: source CLI through Bun, Vitest, TypeScript, package builds and archive
  inspection with `unzip`.
- Viewports/accounts: not applicable. No browser UI, auth or account data is
  involved in these local commands.

## Must-have findings

### UX-CLI-001: Review workflow had no supported completion path

- Evidence: verified fact in the CLI and generated `REVIEW-DRAFT.md`.
- Goal: turn a reviewed conversion into a normal package.
- Before: the report said to regenerate, but regeneration returned the same
  state and no command could record a decision.
- Fix: `snabbsajt site import approve <dir> --yes` records per-finding
  resolutions, refreshes provenance, rejects blocked/invalid packages and
  removes the draft marker.
- Verification: imported the fixture, approved it, packed it, and confirmed the
  ready archive contains root `site.json` without `REVIEW-DRAFT.json`.

### UX-CLI-002: Shared review draft omitted its report and evidence

- Evidence: verified by inspecting the original archive.
- Impact: another developer could see the draft but not why it needed review.
- Fix: review archives now include report JSON/Markdown, evidence, validation,
  provenance and instructions under `REVIEW-DRAFT/`.
- Verification: `unzip -l` showed all review artifacts and no root `site.json`.

### UX-CLI-003: Agent proposals could weaken the deterministic review baseline

- Evidence: verified fact reproduced by changing a finding or changing a
  blocked report to ready while refreshing candidate provenance.
- Impact: approval could present a false clean result and undermine trust in
  the import receipt.
- Fix: conversion preserves `import-report.original.json`; approval always
  compares candidates with that baseline and permits only additive, unresolved,
  evidence-cited `ai_proposed` findings.
- Verification: regressions cover changed deterministic findings and both
  blocked-to-review and blocked-to-ready provenance refreshes.

### UX-CLI-004: Generated order keys broke the normal publish journey

- Evidence: verified in the real SnabbSajt browser flow. The generated archive
  imported and remained editable, but publish autofix failed with
  `invalid order key: a000`.
- Impact: a developer could complete conversion and upload, then leave the
  customer with a draft that failed during ordinary publishing.
- Fix: HTML mapping now generates keys through `fractional-indexing`, and Site
  Kit validation rejects malformed order strings before packing.
- Verification: focused mapping/validator regressions plus the full SDK gate.

## Should-have findings

All six verified findings were fixed:

1. Nested import and pack help now returns focused usage instead of an error.
2. Human import output shows counts, the report path and the exact next command.
3. Schema success is labelled so it cannot be confused with publish readiness.
4. Review-required findings sort before informational findings, and repeated
   script/handler/animation evidence is grouped into bounded batches.
5. JSON errors identify `site import html`, not the ambiguous `site import`.
6. The trusted macOS `/tmp` alias resolves safely while arbitrary symlink roots
   remain rejected.

## Nice-to-have findings

Both verified copy issues were fixed:

1. Human output includes page, section and asset counts.
2. `site doctor` says bundled skills are available but not installed instead of
   implying the package contains no skill assets.

## Delight opportunities

1. Keep the approval receipt: it now states how many review findings were
   accepted and prints the next shell-safe command.
2. The downloadable `import-website` skill now walks through deterministic
   findings with shared evidence rules and explicit human approval.

## Fixes completed

- Review/approval flow: `packages/cli/src/commands/site.ts` and
  `packages/cli/src/commands/site/import-html.ts`.
- Review archive contents: `src/lib/site-kit/pack.ts`.
- Evidence-cited agent workflow: `skills/import-website/SKILL.md`,
  `skills/shared/import-mapping-rules.md`, and `skills/manifest.json`.
- Safe shared-reference installation: `packages/cli/src/skills/install.ts` and
  `packages/cli/src/skills/verify.ts`.
- Action-first, auditable report rendering: `src/import/report.ts`.
- Clear usage: `packages/cli/src/cli.ts`, `docs/cli.md`, and `docs/html.md`.
- Recovery and honest input errors: `src/import/html/assets.ts` and
  `src/import/html/input.ts`.
- Automated proof: `packages/cli/test/cli.test.ts`, `test/html-input.test.ts`,
  `test/html-map.test.ts`, `test/import-report.test.ts`,
  `test/skill-contract.test.ts`, and `packages/cli/test/skills-install.test.ts`.

## Findings not fixed

None in the local CLI journey. Browser-side SnabbSajt import/editor behavior is
separate integration scope and was not claimed as verified.

## Stale and false-positive findings

- The earlier “no way to become ready” finding no longer reproduces.
- The earlier “review archive has no evidence” finding no longer reproduces.
- Arbitrary `G-*` prose no longer becomes verified analytics.
- The two provenance-refresh approval bypasses no longer reproduce.
- The imported `a000` publish failure no longer survives SDK validation.

## Remaining risks

- A user who owns the local directory can deliberately rewrite the candidate,
  preserved baseline, and provenance together. These local files are not a
  cryptographically signed external record; the gate protects the documented
  agent workflow, not against a hostile local owner.
- The generated ready zip still needs verification through SnabbSajt's actual
  browser upload and regular editor before the end-to-end product milestone can
  be called complete.
