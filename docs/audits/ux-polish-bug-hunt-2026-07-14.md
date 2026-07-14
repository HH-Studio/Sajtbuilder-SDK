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
  explicit approval, provenance changes and marker-file deletion.
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
2. Later, let a downloadable agent skill walk through findings one by one. This
   is intentionally outside this narrow CLI pass.

## Fixes completed

- Review/approval flow: `packages/cli/src/commands/site.ts` and
  `packages/cli/src/commands/site/import-html.ts`.
- Review archive contents: `src/lib/site-kit/pack.ts`.
- Action-first, auditable report rendering: `src/import/report.ts`.
- Clear usage: `packages/cli/src/cli.ts`, `docs/cli.md`, and `docs/html.md`.
- Recovery and honest input errors: `src/import/html/assets.ts` and
  `src/import/html/input.ts`.
- Automated proof: `packages/cli/test/cli.test.ts`, `test/html-input.test.ts`,
  `test/html-map.test.ts`, and `test/import-report.test.ts`.

## Findings not fixed

None in the local CLI journey. Browser-side SnabbSajt import/editor behavior is
separate integration scope and was not claimed as verified.

## Stale and false-positive findings

- The earlier “no way to become ready” finding no longer reproduces.
- The earlier “review archive has no evidence” finding no longer reproduces.
- Arbitrary `G-*` prose no longer becomes verified analytics.

## Remaining risks

- A user who owns the local directory can deliberately delete every import
  artifact and reconstruct a hand-authored package. The provenance gate prevents
  accidental bypass; it is not a DRM or hostile-local-user security boundary.
- The generated ready zip still needs verification through SnabbSajt's actual
  browser upload and regular editor before the end-to-end product milestone can
  be called complete.
