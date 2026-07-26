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

`externalKey` is your own stable identifier for the page (`"home"`,
`"tjanster"`). It is optional and unused by a first import, but a later merge
import matches on it — without one, re-importing inserts rather than updates.

## Sections

Every section has matching `type` and `content.type` values. `variant` must be
allowed for that section type.

`order` is optional. Leave it out and the importer assigns valid keys from the
order the sections appear in the array — that is the recommended way to
hand-author a package. If you do supply one it is preserved verbatim, so it has
to be a valid `fractional-indexing` key; validation rejects lookalike strings
such as `a000` because the editor cannot insert a section after them safely.

Sections take an `externalKey` too, with the same merge-import meaning as pages.

## Theme

Themes normally use allow-listed tokens: `palette`, `fontPair`, `density`,
`radius`, `buttonStyle`, `appearance`, `typeScale`. Import `DEFAULT_THEME` or
inspect `ThemeTokens` for the current keys. Owners pick from these in the
editor, and the constrained set is what keeps an off-palette or low-contrast
result unreachable.

A developer building a site outside SnabbSajt can go further. Three optional
fields carry a brand verbatim instead of snapping to the nearest built-in:

| Field | Shape |
| --- | --- |
| `customPalette` | `{ light: SurfaceTokens, dark: SurfaceTokens }` — 13 raw CSS colours per mode (`bg`, `fg`, `muted`, `mutedFg`, `primary`, `primaryFg`, `primaryText?`, `accent`, `accentFg`, `border`, `card`, `cardFg`, `cardBorder`) |
| `customFonts` | `{ heading: string, body: string }` |
| `customBrandHex` | The single brand colour the palette was derived from |

Set `palette` and `fontPair` to the nearest built-in values anyway. They are
what the editor falls back to if the owner clears the custom look, so pick a
close match rather than an arbitrary one.

Unlike the built-in palettes, a custom palette is **not** gated by the authored
contrast test. Check your own colour pairs — the importer will not catch an
unreadable combination for you.

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
