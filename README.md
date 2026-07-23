# SnabbSajt Site Kit

Build a website in Next.js, React, plain HTML, or any other tool, then convert
its content into a structured package that stays editable inside SnabbSajt.

Site Kit is intentionally not a code importer. It does not execute your React,
CSS, JavaScript, or HTML inside SnabbSajt. You map the finished site to
SnabbSajt's typed sections, validate it locally, and pack it as a safe bundle.

## Status

`0.2.0` is published. `@snabbsajt/site-kit` and `@snabbsajt/cli` are both on npm.
The package format, validator, HTML/WordPress converters, CLI, skills, and bundle
format match the production SnabbSajt importer.

## Install

```bash
npm install @snabbsajt/cli
```

Or run it without installing — every example below works with
`npx @snabbsajt/cli` in place of `snabbsajt`.

To work on the SDK itself, clone and build with Bun:

```bash
git clone https://github.com/HH-Studio/Sajtbuilder-SDK.git
cd Sajtbuilder-SDK
bun install
bun run build
```

Installing straight from git (`npm install github:HH-Studio/Sajtbuilder-SDK#main`)
is **not** supported: the root `prepare` script builds `packages/cli`, which
depends on `@snabbsajt/site-kit` before the workspace is linked, so the install
fails. Use npm — it is the published package, not a preview.

## Quickstart

Run `init` inside an empty directory that already has a `package.json`; without
one, npm walks up the tree looking for a project root.

```bash
snabbsajt site init ./my-site --template nextjs
snabbsajt site validate ./my-site
snabbsajt site pack ./my-site -o my-site.zip
```

Import `my-site.zip` in SnabbSajt under **Settings > Backup & move**. The import
creates a new unpublished draft. It never overwrites or publishes a site.

No API key is needed. Every command runs locally.

To convert rendered HTML:

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
and rejects unknown object-literal fields in TypeScript. `snabbsajt site validate`
then runs the same runtime validators and caps used by the production importer.

## Starter template

Want a real, deployable website instead of a bare `site.ts`?
[`templates/starter-smb`](templates/starter-smb/) is a **Next.js + shadcn-style**
small-business site whose content is a single `defineSite()` file. The same file
renders the website **and** packs into an importable SnabbSajt bundle
(`npm run build:snabbsajt`) — deploy the site and hand the client an editable
SnabbSajt draft from one source of truth. See [docs/templates.md](docs/templates.md).

## Documentation

- [Quickstart](docs/quickstart.md)
- [Convert a Next.js site](docs/nextjs.md)
- [Starter template (Next.js + shadcn)](docs/templates.md)
- [Convert a plain HTML site](docs/html.md)
- [Convert a WordPress site](docs/wordpress.md)
- [Package format](docs/package-format.md)
- [CLI reference](docs/cli.md)
- [API reference](docs/api-reference.md)
- [Schema reference](docs/schema-reference.md)
- [Security and limits](docs/security.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Publish `@snabbsajt/site-kit`, then `@snabbsajt/cli`](docs/publishing.md)
- [Versioned skill archives and checksums](release-assets/)
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
