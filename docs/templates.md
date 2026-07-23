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

## Deploy

It is a standard Next.js App Router app. `npm run build` produces a static export
of every page in `site.ts` (`generateStaticParams`), deployable to Vercel or any
static host. Fonts use system stacks to stay offline-buildable; swap in `next/font`
in `src/app/layout.tsx` for production-faithful typography.
