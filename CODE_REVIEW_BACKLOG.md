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
