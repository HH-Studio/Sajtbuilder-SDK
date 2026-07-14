# Code review backlog

## Bug Hunt — 2026-07-14

### Auto-fixed (4 issues)

- `src/import/html/behavior.ts` — required provider-specific setup syntax before
  converting analytics identifiers; example prose no longer becomes tracking.
- `src/import/html/map.ts` — malformed percent escapes no longer crash contact
  extraction, and raster metadata now requires matching file signatures.
- `src/import/html/map.ts` — bounded content/media loss is reported instead of
  silently producing a ready import.
- `src/import/html/input.ts` — public URL crawling rejects a non-HTML entry and
  records skipped non-HTML anchor targets instead of parsing them as pages.

### Needs human review (0 issues)

No unresolved runtime defects were found in the changed-file scope.

## Bug Hunt — 2026-07-14 — evidence-cited import skill

### Auto-fixed (3 issues)

- `packages/cli/src/commands/site.ts` — approval now always compares the
  candidate report with the preserved deterministic baseline, so refreshing
  provenance cannot hide changed findings.
- `packages/cli/src/commands/site.ts` — candidates forged from `blocked` to
  `ready` cannot skip baseline validation.
- `packages/cli/src/skills/install.ts` — failed shared-reference copies now
  remove the partial staging directory.

### Needs human review (0 issues)

No unresolved runtime defects were found in the Task 8 changed-file scope.

## Browser gate — 2026-07-14

### Auto-fixed (1 issue)

- `src/import/html/map.ts` and `src/lib/site-kit/validate.ts` — HTML conversion
  emitted lookalike order keys such as `a000` that imported successfully but
  crashed normal publish autofixes. Generated keys now come from the same
  fractional-indexing library as SnabbSajt, and validation rejects malformed
  keys before pack.

### Needs human review (0 issues)

The generated package-order defect is covered by mapping and validator tests.
