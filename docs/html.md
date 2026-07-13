# Convert a plain HTML site

Use the rendered document as evidence, not as the import payload. Raw HTML is
not stored or executed inside a SnabbSajt site.

## Recommended workflow

1. Open each public HTML page in a browser.
2. Record page titles, navigation, headings, paragraphs, contact details, and
   meaningful images.
3. Ignore CSS utility markup, decorative wrappers, scripts, pixels, and hidden
   elements.
4. Map visible regions to built-in sections.
5. Copy used local assets into `assets/` and reference their `exportId`.
6. Validate and pack the package.

For a single static file:

```bash
npx site-kit init ./converted-site --template html
```

Then replace the starter `site.json` with the real content.

## Forms and scripts

Do not copy `<form action>`, inline event handlers, script tags, iframes, or
tracking snippets. Use a `contact`, `lead-form`, `booking`, or other typed
section when one matches. Otherwise record the feature as unsupported.

## Links

Convert internal navigation to page, anchor, or typed action targets. Keep
external HTTPS links as external targets. Do not copy `javascript:` URLs.
