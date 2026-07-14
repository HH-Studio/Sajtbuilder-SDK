# Quickstart

Until `0.2.0` is published and tagged, install the release candidate from
`main`:

```bash
npm install github:HH-Studio/Sajtbuilder-SDK#main
```

## 1. Create a package folder

```bash
npx site-kit init ./acme-site --template nextjs
```

Use `--template html` when the source is a static HTML site. Both templates
produce the same SnabbSajt package format. The flag only changes the guidance
inside the generated folder.

## 2. Replace the starter content

Edit `site.json`. Start with the real page list, business facts, headings,
paragraphs, calls to action, and images from the source site.

Map visual regions to the closest built-in section type. Common mappings:

| Source region | SnabbSajt section |
| --- | --- |
| Hero/banner | `hero` |
| Offering grid | `services` |
| Story | `about` |
| Team grid | `team` |
| Reviews | `testimonials` |
| Photo grid | `gallery` |
| FAQ | `faq` |
| Contact form | `contact` or `lead-form` |
| Footer | `footer` |

Do not force a custom layout into the wrong section. Record unsupported pieces
for a human review instead.

## 3. Add assets

Each `assets[]` row has an `exportId`. Put its file at:

```text
assets/<exportId>.<extension>
```

References inside section content use the same id:

```json
{
  "media": {
    "assetId": "hero-office",
    "alt": "Team working in the Stockholm studio"
  }
}
```

Record the image's real width, height, and MIME type. The server decodes the
actual file again and rejects unsafe or mismatched images.

## 4. Validate

```bash
npx site-kit validate ./acme-site
```

Errors block packing. Warnings describe safe coercions or suspicious content
that the importer can still handle.

## 5. Pack and import

```bash
npx site-kit pack ./acme-site -o acme-site.zip
```

In SnabbSajt, open **Settings > Backup & move**, choose import, and select the
zip. The server verifies the bundle checksums and validates the payload again.
The result is a new draft site.
