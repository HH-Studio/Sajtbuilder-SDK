# Import a rendered HTML site

Use the rendered site as evidence. SnabbSajt converts supported facts into
native, editable sections. It never stores or executes the source website as
the runtime.

## Accepted input

```bash
snabbsajt site import html https://example.com -o ./example-import
snabbsajt site import html ./index.html -o ./example-import
snabbsajt site import html ./static-export.zip -o ./example-import
```

- Public HTTP(S) URLs are crawled on the selected origin through SSRF-safe,
  DNS-pinned, redirect-limited fetches.
- A local `.html` entry can discover linked local HTML, CSS, scripts and assets.
- A `.zip` must contain ordinary files. Traversal, symlinks, encrypted entries,
  duplicate paths and archive bombs are rejected.

## What is converted

- Page titles, navigation, headings, paragraphs and lists.
- Constrained theme signals from CSS. Raw CSS is discarded.
- Verified raster images with dimensions read from the file bytes.
- Exact GA4, Google Tag Manager and Meta Pixel setup syntax into typed tracking
  settings. Consent still needs review.
- Exact HTTPS booking links for allow-listed providers into a native booking
  section.
- POST mailto forms with a verified recipient and supported named fields into
  a native lead form.
- Explicit gallery structures when at least three verified image blobs exist.

## What is not converted automatically

- React components, PHP, WordPress plugins or server code.
- Arbitrary JavaScript, inline handlers, iframes or embeds.
- Arbitrary CSS, animations or pixel-identical layout.
- Maps without a verified structured address.
- Booking schedules, prices or availability not present as structured facts.
- Remote media that was not fetched as a verified same-origin blob.

Each omission or replacement is recorded in `import-report.md` with evidence.
Long pages have bounded conversion. If content crosses the safe cap, the import
is blocked instead of silently claiming success.

## Review and approve

The generated directory contains:

```text
site.json
evidence.json
import-report.json
import-report.md
import-provenance.json
validation.json
assets/
fonts/
REVIEW-DRAFT.md        # only while unresolved
```

Open `import-report.md` first. Review-required findings appear before
informational converted/skipped entries. Edit `site.json`, run validation, then
approve only when the result is acceptable:

```bash
snabbsajt site validate ./example-import
snabbsajt site import approve ./example-import --yes
snabbsajt site pack ./example-import -o example.zip
```

`--yes` is an audit decision, not AI reconstruction. A blocked import cannot be
approved. Re-import it with a smaller or corrected source.

## Review drafts

To share an unresolved conversion with another developer:

```bash
snabbsajt site pack ./example-import --review-draft
```

The archive includes the report and evidence, but is intentionally not accepted
by the normal SnabbSajt site importer.
