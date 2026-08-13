# Starter template — Next.js + shadcn

`templates/starter-smb` is a real, deployable small-business website whose content
is a single typed `defineSite()` file. It exists to make the **inbound** path
concrete: instead of scraping an existing site, a developer builds from a blessed
component vocabulary that maps 1:1 to SnabbSajt section types, so the import is a
deterministic serialization — no HTML round-trip, no AI guessing.

```
templates/starter-smb/src/site.ts
   ├─► Next.js + Tailwind (shadcn-style)  → deployable website (Vercel, etc.)
   └─► npm run build:snabbsajt            → out/snabbsajt-bundle.zip → import → editable draft
```

## Why one source of truth

The section components take the **same typed props** as SnabbSajt section content
(`PortableSectionContent` from `@snabbsajt/site-kit`). So the website you deploy
and the draft your client edits inside SnabbSajt are generated from the same data.
Edit `site.ts` and both stay in sync.

## Use it

```bash
cd templates/starter-smb
npm install
npm run dev              # preview at localhost:3000
npm run build:snabbsajt  # validate + write out/snabbsajt-bundle.zip
```

Import the `.zip` in SnabbSajt: **Settings → Backup & move → Import**. It creates a
new unpublished draft; nothing is overwritten.

## Presets

Six presets ship under `src/presets/`, one per common vertical, each with a
fitting palette + font pair: `consultant` (default), `salon`, `cleaning`,
`clinic`, `restaurant`, `fitness`. Select one with
`NEXT_PUBLIC_SNABBSAJT_PRESET=<key>` for both `dev` and `build:snabbsajt`. They
exercise every rendered section type and the full range of theme tokens
(palettes, font pairs, radius, button style, light/dark), so they double as the
conformance corpus in `test/starter-template.test.ts`.

## The blessed-vocabulary rule

The round-trip only holds because the template restricts itself:

- **Sections**: only `type`/`variant` values from the SnabbSajt registry. Invalid
  ones fail `npm run build:snabbsajt` (it runs the production validators).
- **Theme**: tokens only (`palette`, `fontPair`, `radius`, `buttonStyle`), never
  raw hex. `src/app/globals.css` maps them to CSS variables so preview colour ≈
  imported colour. The imported, SnabbSajt-rendered site is the canonical look.
- **Adding a section type**: add a `case` in `src/components/sections.tsx`. A type
  with no case still imports fine — it just doesn't preview until you add one.

## Conformance fixture

`test/starter-template.test.ts` validates and packs the template's `site.ts` on
every SDK test run (the package name is aliased to local source in
`vitest.config.ts`). If the portable format, section schemas, or theme tokens
drift, the template breaks loudly — it is a living contract, not just an example.

## Headless mode — render what the client published

The template reads its content from one of two places, through one set of
components:

```
                     no env vars set
src/site.ts ─────────────────────────────────► renderModelFromPackage ──┐
                                                                        ├─► your components
GET /v1/sites/{id}/published ───────────────► renderModelFromPublished ─┘
      SNABBSAJT_SITE_ID + SNABBSAJT_DELIVERY_TOKEN
```

`src/lib/site-source.ts` owns that switch. Set the two variables in your host's
server environment (copy `.env.example`), paste the host's deploy hook into
SnabbSajt under **Settings → Developers → Var hemsidan visas**, and the loop
closes: your client publishes, SnabbSajt calls the hook, the build fetches their
snapshot, your components render it.

Content is fetched at **build time** (`cache: "force-cache"`), so routes stay
statically prerendered. Setting only one of the two variables fails the build
rather than silently deploying the template's demo content. The build log names
the version it rendered (`[snabbsajt] rendering published version <id> of <name>`),
which is the line to check when a deployment shows content nobody recognises.

Published images arrive as resolved URLs and render; locally the same sections
show the placeholder box, because `bundle://` refs have no URL until the site has
been imported and published.

Requires `@snabbsajt/site-kit` ≥ 0.4.0.

## Deploy

It is a standard Next.js App Router app. `npm run build` produces a static export
of every page in `site.ts` — or of every published page, in headless mode —
via `generateStaticParams`, deployable to Vercel or any static host. Fonts use system stacks to stay offline-buildable; swap in `next/font`
in `src/app/layout.tsx` for production-faithful typography.
