# CLI reference

## `site-kit init`

```bash
site-kit init <dir> [--template nextjs|html]
```

Creates a starter `site.json`, empty asset/font directories, and a local readme.
It refuses to overwrite an existing `site.json`.

## `site-kit validate`

```bash
site-kit validate <site.json|dir>
```

Checks the versioned envelope, section content, variants, caps, references,
duplicate ids/slugs, and package file names. A directory check also verifies
that every declared asset and uploaded font has exactly one matching file.

Exit code is 0 when no errors exist. Warnings do not change the exit code.

## `site-kit inspect`

```bash
site-kit inspect <site.json|dir>
```

Prints a small JSON summary: business name, language, page/section/asset counts,
and section types. It validates before printing.

## `site-kit pack`

```bash
site-kit pack <dir> [-o bundle.zip]
```

Validates the directory, calculates SHA-256 for embedded files, and creates the
self-contained bundle accepted by SnabbSajt. Packing fails on missing or
ambiguous files and on the total bundle-size cap.
