# Package format

## Directory layout

```text
site-package/
  site.json
  import-report.json       # generated HTML imports only
  import-report.original.json # deterministic baseline for agent proposals
  import-report.md         # generated HTML imports only
  import-provenance.json   # generated HTML imports only
  evidence.json            # generated HTML imports only
  assets/<exportId>.<ext>
  fonts/<tmpId>__<index>.<ext>
```

`site.json` uses the versioned `sajt-site` envelope. The current version is 1.

## Identity and references

Temporary ids are local to the package. Use `[A-Za-z0-9_-]+` for asset ids.
The importer creates fresh database ids and remaps references.

- Pages use `tmpId`.
- Sections point to `pageTmpId`.
- Assets use `exportId`.
- Image references use `{ "assetId": "<exportId>", "alt": "..." }`.
- Uploaded font files use `<font tmpId>__<files index>.<ext>`.

## Pages

The home page has an empty slug. Slugs are language-independent paths without
the leading slash. `showInNav` controls navigation visibility.

## Sections

Every section has matching `type` and `content.type` values. `variant` must be
allowed for that section type. `order` must be a valid `fractional-indexing`
key; `a0`, `a1`, `a2` is sufficient for a hand-authored package. Validation
rejects lookalike strings such as `a000` because the editor cannot insert a
section after them safely.

## Theme

Themes use allow-listed tokens. Raw colors and CSS are not accepted. Import
`DEFAULT_THEME` or inspect `ThemeTokens` for the current keys.

## Bundles

`snabbsajt site pack` creates a zip containing `site.json`, `manifest.json`, and all
declared blobs. The manifest records SHA-256 and byte length for each file.
SnabbSajt verifies those checksums before storing any asset.

An unresolved HTML import can only be packed with `--review-draft`. That archive
places `site.json`, report, evidence and validation under `REVIEW-DRAFT/` and
omits root `site.json`. It is a review artifact, not an importable site bundle.

Approved imports keep their reviewed findings and per-item resolutions in the
report. The provenance file binds the approved report and current `site.json`
by SHA-256 so accidental post-review changes are caught before packing.

## Compatibility

The version 1 validator is strict. Unknown fields are rejected instead of
silently discarded. Upgrade Site Kit when SnabbSajt adds a field you need, and
keep your installed version pinned for reproducible builds.
