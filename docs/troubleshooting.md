# Troubleshooting

## `type does not match content.type`

Keep the outer section `type` and `content.type` identical.

## `unknown variant`

Read `SECTION_REGISTRY[type].variants` and choose one of its keys. The importer
can coerce an unknown value, but fixing the package is safer.

## `references unknown asset`

Add an `assets[]` row with the referenced `exportId`, or remove the media
reference. A dangling image reference would be dropped during import.

## `no assets/<id>.<ext> file`

Put exactly one matching blob in the package. Do not include both PNG and WebP
with the same export id.

## Import skips an image

Check that the file bytes match the declared MIME type and real dimensions.
Very large, extreme-aspect, malformed, or unsafe SVG files fail closed.

## The source layout has no matching section

Do not force it or smuggle it through raw HTML. Use the closest editable
section, simplify the design, or report the gap as a candidate for a generic
new variant.

## Next.js code does not import

Correct. Site Kit converts content and structure, not application code. Render
the site, inventory the result, and map it to typed sections.
