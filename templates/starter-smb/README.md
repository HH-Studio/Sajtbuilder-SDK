# SnabbSajt starter — Next.js + shadcn

A small-business website template that **round-trips into SnabbSajt**. One typed
content file (`src/site.ts`) drives two things:

1. a real, deployable **Next.js + Tailwind (shadcn-style)** website, and
2. an importable **SnabbSajt site bundle** (`npm run build:snabbsajt`).

Because both read the same data, the site you deploy and the site your client
edits inside SnabbSajt stay in sync — no scraping, no guesswork.

```
src/site.ts ──┬──► Next.js + shadcn ........ deploy anywhere (Vercel, etc.)
              └──► build:snabbsajt ......... snabbsajt-bundle.zip → import → editable draft
```

## Quickstart

```bash
npm install
npm run dev            # preview the website at http://localhost:3000
```

Edit `src/site.ts` — headlines, services, pricing, pages, theme. The preview
updates live.

## Presets (themes + verticals)

The template ships six ready presets under `src/presets/`, each with a
vertical-fitting palette + font pair. Pick one with an env var:

```bash
NEXT_PUBLIC_SNABBSAJT_PRESET=salon npm run dev
NEXT_PUBLIC_SNABBSAJT_PRESET=salon npm run build:snabbsajt
```

| Preset | Vertical | Palette / font | Goal |
| --- | --- | --- | --- |
| `consultant` (default) | Consultant / agency | midnight · editorial | Show services |
| `salon` | Salon / beauty | rose · friendly (pill) | Get bookings |
| `cleaning` | Cleaning | forest · modern | Get calls |
| `clinic` | Dental / health | ocean · classic | Get bookings |
| `restaurant` | Restaurant / café | amber · premium (dark) | Get calls |
| `fitness` | Gym / coach | mono · grotesk (dark) | Get bookings |

Make your own: copy the closest preset to a new file in `src/presets/`, edit the
content, add it to `src/presets/index.ts`, and select it. Theme tokens
(`palette`, `fontPair`, `radius`, `buttonStyle`, `appearance`) are the full set of
SnabbSajt choices — see `src/app/globals.css` for the token → CSS-variable maps.

## Import into SnabbSajt

```bash
npm run build:snabbsajt   # validates + writes out/snabbsajt-bundle.zip
```

Then in SnabbSajt: **Settings → Backup & move → Import** the `.zip`. It creates a
new **unpublished** draft — nothing is overwritten. Your client edits text and
images in the normal editor and publishes when ready.

## How it stays clean (the rules)

This is a **blessed vocabulary**, not a free-form site. The round-trip only works
because every section maps 1:1 to a real SnabbSajt section type:

- Use only section `type`s and `variant`s from `@snabbsajt/site-kit`. Your editor
  autocompletes them, and `npm run build:snabbsajt` **fails** on anything invalid.
- `site.theme` uses tokens (`palette`, `fontPair`, `radius`, …), never raw hex.
  `src/app/globals.css` maps those tokens to CSS variables so the preview colours
  match the imported result.
- Add a new section: give it a case in `src/components/sections.tsx`. If you use a
  type this template doesn't render yet, it still **imports** fine — it just won't
  preview until you add a component.

Add real photos by dropping files in an `assets/` folder, referencing them as
`bundle://<id>` from `site.ts`, and passing them to `packSitePackage` in
`scripts/build-snabbsajt.ts`. Fonts use system stacks by default — swap in
`next/font` in `src/app/layout.tsx` for production-faithful typography.

## What renders today

`hero`, `services`, `about`, `team`, `testimonials`, `pricing`, `faq`, `contact`,
`cta-band`, `footer`. Everything else in the SnabbSajt registry imports fine and
is one component away from previewing.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Local preview |
| `npm run build` | Production Next.js build |
| `npm run build:snabbsajt` | Validate + pack `site.ts` → `out/snabbsajt-bundle.zip` |
| `npm run typecheck` | `tsc --noEmit` |
