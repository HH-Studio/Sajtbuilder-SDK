# CLI reference

The `snabbsajt` CLI is local-first. It does not need an API key and does not
upload or publish anything by itself.

## Import rendered HTML

```bash
snabbsajt site import html <public-url|file.html|site.zip> [-o package-dir] [--json]
```

This command safely inventories rendered HTML, CSS, images, forms, scripts,
embeds, analytics and supported booking links. It then writes an editable
`site.json` plus evidence, validation and import-report artifacts. Imported
JavaScript, inline handlers, arbitrary CSS and embeds never execute.

The output status is one of:

- `ready`: no review-required facts or losses were found.
- `review_required`: inspect `import-report.md` and the generated site.
- `blocked`: an input cap or known content loss prevents approval.

For `review_required`, inspect the report, edit `site.json` if needed, validate,
then explicitly record your decision:

```bash
snabbsajt site validate ./package-dir
snabbsajt site import approve ./package-dir --yes
snabbsajt site pack ./package-dir -o site.zip
```

Approval records a resolution on every remaining review finding and refreshes
the package provenance. It refuses blocked or schema-invalid packages. When an
installed agent skill adds proposals, approval also proves the deterministic
baseline is unchanged and accepts only additive, unresolved `ai_proposed`
findings with valid evidence citations.

## Create a package

```bash
snabbsajt site init <dir> [--template nextjs|html] [--json]
```

Creates a starter `site.json`, empty asset/font directories, and local guidance.
It refuses symlinks and non-empty target directories.

## Validate

```bash
snabbsajt site validate <site.json|dir> [--json]
```

Checks the versioned envelope, section content, variants, caps, references,
duplicate ids/slugs, and package file names. Schema validity does not mean an
HTML import has completed review; check `import-report.md` as well.

## Import WordPress

```bash
snabbsajt site import wordpress --url https://example.com --wxr export.xml --out ./converted
```

The public URL and WXR/XML export are both required. The command crawls the
public origin through the bounded HTML adapter, parses WXR without DTD/entity
support, reconciles conflicts, downloads safe media, and emits the same review
artifacts as HTML import. Local conversion needs no API key.

## Inspect

```bash
snabbsajt site inspect <site.json|dir> [--json]
```

Prints business name, language, page/section/asset counts and section types.

## Pack

```bash
snabbsajt site pack <dir> [-o bundle.zip] [--review-draft] [--json]
```

Validates, calculates SHA-256 checksums, and creates a SnabbSajt bundle. An
unresolved import is refused unless `--review-draft` is explicit. A review
draft contains the site under `REVIEW-DRAFT/` together with its report and
evidence, but deliberately has no root `site.json`, so it is not importable or
publish-ready.

## Doctor

```bash
snabbsajt site doctor [--json]
```

Reports installed CLI, Site Kit and format versions without a network request.

## Legacy `site-kit` binary

The root package still provides `site-kit init|inspect|validate|pack` for
hand-authored packages. New developer workflows should use the namespaced
`snabbsajt site ...` commands.
