# Security and limits

Site Kit is offline. It needs no SnabbSajt account, API key, network token, or
write access to a customer workspace.

## Trust boundaries

- Local validation is developer feedback, not authorization.
- SnabbSajt validates the package again on import.
- Import requires a signed-in user with permission to create a site.
- Import creates a draft and never publishes automatically.
- Asset bytes are checksummed, decoded, and screened server-side.
- Raw HTML, JavaScript, iframes, and custom CSS are not part of the model.

## Current caps

The exported `PORTABLE_CAPS` constant is authoritative for this SDK version.
Current headline limits include 50 pages, 500 sections, 200 assets, 12 fonts,
5 MB for `site.json`, 15 MB per image, and 150 MB for the bundle.

## Secrets and personal data

Do not put API keys, private source files, customer credentials, or hidden
application data in a package. `site.json` becomes website content. Treat it as
content that workspace editors can inspect.

## API keys later

A future hosted API may use scoped, revocable tokens for direct upload or CI.
That is a separate product surface. Local authoring, validation, and packing
should remain keyless.
