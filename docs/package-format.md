# Package format

## Directory layout

```text
site-package/
  site.json
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
allowed for that section type. `order` is a sortable string; `a0`, `a1`, `a2`
is sufficient for a hand-authored package.

## Theme

Themes use allow-listed tokens. Raw colors and CSS are not accepted. Import
`DEFAULT_THEME` or inspect `ThemeTokens` for the current keys.

## Bundles

`site-kit pack` creates a zip containing `site.json`, `manifest.json`, and all
declared blobs. The manifest records SHA-256 and byte length for each file.
SnabbSajt verifies those checksums before storing any asset.

## Compatibility

The version 1 validator is strict. Unknown fields are rejected instead of
silently discarded. Upgrade Site Kit when SnabbSajt adds a field you need, and
keep your installed version pinned for reproducible builds.
