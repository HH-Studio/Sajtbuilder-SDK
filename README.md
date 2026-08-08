# SnabbSajt Site Kit

Build a website in Next.js, React, plain HTML, or any other tool, then convert
its content into a structured package that stays editable inside SnabbSajt.

Site Kit is intentionally not a code importer. It does not execute your React,
CSS, JavaScript, or HTML inside SnabbSajt. You map the finished site to
SnabbSajt's typed sections, validate it locally, and pack it as a safe bundle.

## Status

| | Version |
| --- | --- |
| **Published on npm** (what `npm install` gives you) | **`0.3.0`** |
| This source tree | `0.4.0` — not yet published |

The package format, validator, HTML/WordPress converters, CLI, skills, and
bundle format match the production SnabbSajt importer.

**Everything listed next is on npm.** `npm install` gives you `0.3.0`, which
caught the mirrored contract up to the app, so that everything the importer
already accepted became expressible from Site Kit:

- **Your own brand.** `theme.customPalette` carries 13 raw CSS colours per
  light/dark surface, `customFonts` carries your typefaces, `customBrandHex`
  records the colour they came from. Use them when the eleven built-in palettes
  are not your brand.
- **Re-importable sites.** `externalKey` on pages and sections gives a merge
  import something stable to match on, so a second import updates a site instead
  of stacking up another draft.
- **Redirects.** `redirects[{ fromPath, toPath }]` keeps old URLs alive.
- **Self-hosted video and PDFs.** Assets take `kind: "video"` and
  `kind: "document"`; a video section may use `provider: "upload"`, and a hero
  may set `bgVideo`.
- **No hand-written order keys.** Section `order` is optional — omit it and the
  importer orders by array position.

`0.4.0` is **not** published yet. It includes the `--json` error fix plus the
multilingual contract, terminal site linking, scoped admin commands and update
flow listed under Unreleased in the changelog. Build from this tree if you need
those changes before the npm release.

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

Already have a repository and want your team editing content in SnabbSajt while
the site keeps deploying from your own git and host? That is
[Headless delivery](#headless-delivery--you-host-your-client-edits) below —
`snabbsajt connect` then `snabbsajt pull`. Do not confuse it with
`snabbsajt site init`, which scaffolds a site *package* and touches no network.

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

For authored multilingual sites, declare every locale in `site.languages`, give
each primary section a `tmpId`, and add `localizations[]` with the same pages and
sections keyed by `pageTmpId` and `sectionTmpId`. Localized entries may change
prose, page titles/SEO and page slugs; structure, asset ids and CTA kinds stay
identical. This works for creating a site. Locale-aware merge updates are
rejected instead of silently dropping a language. Local validation enforces the
same locale membership, identity, slug and structural rules as production.

## Starter template

Want a real, deployable website instead of a bare `site.ts`?
[`templates/starter-smb`](templates/starter-smb/) is a **Next.js + shadcn-style**
small-business site whose content is a single `defineSite()` file. The same file
renders the website **and** packs into an importable SnabbSajt bundle
(`npm run build:snabbsajt`) — deploy the site and hand the client an editable
SnabbSajt draft from one source of truth. See [docs/templates.md](docs/templates.md).

## Headless delivery — you host, your client edits

Site Kit packs content **in**. Headless delivery reads it back **out**, so the
site can live on your own infrastructure while the person who owns the words
keeps editing it in SnabbSajt.

Two commands wire a project up. No API key to create first:

```bash
snabbsajt connect     # prints a code, you approve it in the browser
snabbsajt pull        # writes the published content to snabbsajt/published.json
```

`connect` writes two files, split by secrecy so a token cannot ride into a
public repo by accident:

| File | Contains | Commit it? |
| --- | --- | --- |
| `.snabbsajt.json` | `siteId`, `apiUrl`, site name | **Yes.** A teammate who clones then only needs their own token. |
| `.env.local` | `SNABBSAJT_DELIVERY_TOKEN` | **No.** `connect` checks your `.gitignore` and warns loudly on stderr if it is not covered. |

In CI, skip `connect` entirely: commit `.snabbsajt.json` and set
`SNABBSAJT_DELIVERY_TOKEN` from your secret store. The environment always wins
over `.env.local`.

### Writing back — the `admin` namespace

`pull` reads. When you need to *change* a site from a terminal or a script, that
lives behind its own noun and its own credential:

```bash
snabbsajt admin pair    # approve the scopes in the browser
snabbsajt admin tools   # what this grant actually allows
snabbsajt admin run update_section_text --args '{"sectionId":"…","text":"…"}'
```

`admin pair` mints a **capability-scoped** token into `SNABBSAJT_ADMIN_TOKEN` — a
different variable from the read-only one, so pairing for write access cannot
escalate what `pull` holds. `snabbsajt site *` stays keyless and never sees either
token. `tools` and `run` speak MCP to the same endpoint an AI assistant uses, so
every capability the app gains is reachable with no CLI upgrade.

Publishing, emailing a customer a document, and granting site access still need
the owner to approve them **in the browser at the moment they happen**, so a
paired terminal cannot do them unattended. Details in
[docs/cli.md](docs/cli.md#edit-a-site-from-the-terminal--the-admin-namespace).

Or read it in code, which is what a framework's data layer usually wants:

```ts
import { createDeliveryClient } from "@snabbsajt/site-kit";

const sajt = createDeliveryClient({
  siteId: process.env.SNABBSAJT_SITE_ID!,
  token: process.env.SNABBSAJT_DELIVERY_TOKEN!,
});

const { snapshot, versionId } = await sajt.getPublishedSite();
// snapshot.pages[].sections[] — every asset already resolved to a URL.
```

The response is a `SiteSnapshot`: one immutable, fully denormalised document
describing the whole renderable site at the moment it was published. Assets are
already resolved to URLs with dimensions, so rendering needs no second request
and no database of your own.

`SiteSnapshot` is **not** `PortableSiteV1`. Portable is the authoring format you
build and pack; a snapshot is the frozen output of a publish and carries nothing
editable. Portable goes in, snapshot comes out.

**The token.** Read-only, scoped to one single site, and revocable from
SnabbSajt. It cannot read drafts, cannot reach another site in the same
workspace, and cannot write anything. It is still a credential — it grants one
site's published content to whoever holds it, so keep it in your CI secret store
and off the client bundle.

**Failures you can act on**, as `DeliveryError.reason`:

| reason | what it means |
| --- | --- |
| `unauthorized` | Wrong, revoked, or issued for a different site. Not retried — a wrong token does not become right. Deliberately indistinguishable from a deleted or suspended site, so nobody can probe which site ids exist. |
| `not_published` | Your wiring is correct; this site has simply never been published. Publish it once and the call starts returning content. |
| `rate_limited` | Too many reads. Retried automatically with backoff; if you see it in a build, cache between builds instead of fetching per request. |
| `network` / `malformed` | Could not reach the host, or the answer was not a snapshot. |

Build-time use is the intended shape. A published snapshot changes only when
someone publishes, and publishing can fire your deploy hook — so refetching per
request buys nothing. Point `baseUrl` (or `SNABBSAJT_API_URL`) at another
deployment for staging.

## Documentation

- [Quickstart](docs/quickstart.md)
- [CHANGELOG](CHANGELOG.md)
- [Headless delivery — connect your own repo/host](https://snabbsajt.com/docs/en/developer/site-kit/headless-delivery)
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
