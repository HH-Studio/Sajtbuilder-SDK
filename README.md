# SnabbSajt Site Kit

Build a website in Next.js, React, plain HTML, or any other tool, then convert
its content into a structured package that stays editable inside SnabbSajt.

Site Kit is intentionally not a code importer. It does not execute your React,
CSS, JavaScript, or HTML inside SnabbSajt. You map the finished site to
SnabbSajt's typed sections, validate it locally, and pack it as a safe bundle.

## Status

`0.1` is a public beta. The package format, validator, and bundle format match
the production SnabbSajt importer. The npm package name is reserved for a later
registry release; today, install from GitHub or clone this repository.

## Install from GitHub

```bash
npm install github:HH-Studio/Sajtbuilder-SDK#v0.1.0
```

Or clone the repository and use Bun:

```bash
git clone https://github.com/HH-Studio/Sajtbuilder-SDK.git
cd Sajtbuilder-SDK
bun install
bun run build
```

## Quickstart

```bash
npx site-kit init ./my-site --template nextjs
npx site-kit validate ./my-site
npx site-kit pack ./my-site -o my-site.zip
```

Import `my-site.zip` in SnabbSajt under **Settings > Backup & move**. The import
creates a new unpublished draft. It never overwrites or publishes a site.

No API key is needed. Every command runs locally.

To convert rendered HTML with the newer namespaced CLI:

```bash
snabbsajt site import html https://example.com -o ./example-import
snabbsajt site import approve ./example-import --yes
snabbsajt site pack ./example-import -o example.zip
```

Always read `import-report.md` before approval. Unsupported behavior is reported
and stays inert; blocked content loss cannot be approved.

WordPress requires the current public site plus a WXR/XML export:

```bash
snabbsajt site import wordpress --url https://example.com --wxr export.xml --out ./converted
```

## Typed authoring

```ts
import { DEFAULT_THEME, defineSite } from "@snabbsajt/site-kit";

export const site = defineSite({
  format: "sajt-site",
  version: 1,
  exportedAt: new Date().toISOString(),
  site: {
    businessName: "North Studio",
    vertical: "consultant",
    goal: "show_services",
    language: "en",
    theme: DEFAULT_THEME,
    contact: { email: "hello@example.com" },
  },
  folders: [],
  pages: [{ tmpId: "home", slug: "", title: "Home", order: 0, showInNav: true }],
  sections: [{
    pageTmpId: "home",
    type: "hero",
    variant: "image-right",
    order: "a0",
    content: { type: "hero", headline: "A useful headline" },
  }],
  fonts: [],
  assets: [],
});
```

`defineSite()` ties each section's outer type to its discriminated content type
and rejects unknown object-literal fields in TypeScript. `site-kit validate`
then runs the same runtime validators and caps used by the production importer.

## Documentation

- [Quickstart](docs/quickstart.md)
- [Convert a Next.js site](docs/nextjs.md)
- [Convert a plain HTML site](docs/html.md)
- [Convert a WordPress site](docs/wordpress.md)
- [Package format](docs/package-format.md)
- [CLI reference](docs/cli.md)
- [API reference](docs/api-reference.md)
- [Schema reference](docs/schema-reference.md)
- [Security and limits](docs/security.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Latest UX polish audit](docs/audits/ux-polish-bug-hunt-2026-07-14.md)
- [Code review backlog](CODE_REVIEW_BACKLOG.md)
- [Public SnabbSajt developer docs](https://snabbsajt.com/docs/en/developer/site-kit)

## What Site Kit will not do

- Pixel-clone an arbitrary website.
- Run third-party JavaScript, tracking snippets, iframes, or React components.
- Preserve custom CSS frameworks.
- Publish without a human review.
- Invent missing business facts or copy.

Those limits are the point. Imported sites stay safe, responsive, accessible,
and editable through SnabbSajt's normal section renderer.

## Contributing

Run the full local gate before opening a change:

```bash
bun run check
```

Report schema drift or importer mismatches as a GitHub issue with a minimal
`site.json`. Do not include customer secrets or personal data.
