# Changelog

All notable changes to `@snabbsajt/site-kit` and `@snabbsajt/cli`. The two
packages share one version number and are released together.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this
project adheres to [semantic versioning](https://semver.org/spec/v2.0.0.html).

`site.json` compatibility is tracked separately from the package version: the
package format is `sajt-site` v1 and has not changed since `0.1.0`. A package
that validated against an older CLI still validates against a newer one.

## [Unreleased]

### Fixed

- **The mirrored app model had drifted 40%, and everything an author could not
  express was downstream of that.** `src/convex/model/theme.ts` was 13 kB
  against the app's 22 kB: no `customMotion` at all (nor its `enterY`,
  `enterBlur`, `duration`, `easing`, `stagger`, `startAt`), no `headingAlign`,
  no per-role `sizeMin` / `sizeFluid`, no `heroMinVh` / `heroMaxHeight` /
  `mediaBandMaxHeight`, and a `navLayout` union missing two of the app's keys.
  The app has accepted every one of those fields since they landed —
  `commitImport` writes `theme` verbatim — so the only thing stopping a
  developer from authoring them was this file. Ten mirrors are now
  byte-identical to the app again (`convex/model/{business,content,portable,
  sections,snapshot,theme}`, `lib/sections/{registry,theme}`,
  `lib/site-kit/validate`, `import/{report,jsonContract}`), plus two new ones
  the app now depends on (`lib/i18n/site-locales`, `lib/palettes`).

- **`ImportReportItemV1.resolution` existed in this repo and nowhere else.**
  `snabbsajt site review --approve` (packages/cli) and the REVIEW-DRAFT bundle
  both write a `resolution`, but the canonical model had no such field and no
  rule about it — so the CLI failed to typecheck against its own mirror, and a
  report could call itself `ready` with every `manual` / `missing` / `unsafe` /
  `ai_proposed` item still undecided. The field and both invariants now live in
  the app and mirror down.

- **A bundle declaring `provider: "upload"` with no clip now fails
  validation.** `src/index.ts` documented that `validateSitePackage` checked
  this; it did not, and the bundle imported as an empty player.

### Added

- **`snabbsajt admin` — the CLI can now change a site, in its own namespace.**
  `admin pair` obtains a **capability-scoped** token by device-code approval
  (`POST /v1/cli/pair/{start,poll}`) and writes it as `SNABBSAJT_ADMIN_TOKEN` —
  deliberately a different variable from `connect`'s read-only
  `SNABBSAJT_DELIVERY_TOKEN`, so pairing for write access cannot silently
  escalate what `pull` holds. `--scopes` defaults to `site:read,content:write`;
  the owner approves scope by scope and may grant fewer, so `pair` prints the
  **granted** set rather than the request. `admin tools` (`tools/list`) and
  `admin run <tool> --args '<json>'` (`tools/call`) then speak ordinary MCP
  JSON-RPC to `<appOrigin>/api/mcp` — the same endpoint an AI assistant uses —
  so `run` is generic and every capability the app gains stays reachable with no
  CLI change. `snabbsajt site *` remains local-first and keyless, and is never
  given a token. Publishing, emailing a customer a document and granting site
  access still require the owner to approve them in the browser at the moment
  they happen, so a paired terminal cannot do them unattended. Non-secret
  pairing metadata (app URL, site id, granted scopes) lands in
  `.snabbsajt-admin.json`, kept separate from `connect`'s `.snabbsajt.json`. The
  token is never printed — not in `--json`, not in an error.
- `snabbsajt --version` (also `-v`), reporting the CLI version alone.
  `snabbsajt site doctor` still reports CLI, Site Kit and both format versions.

### Documentation

- `snabbsajt connect` and `snabbsajt pull` are in the CLI reference, which had
  never listed them — the README's headless-delivery section was their only prose.
  The reference is the page people check for flags, and it was silent on the two
  commands that talk to SnabbSajt at all.
- The CLI reference gained an `## Agent skills` section for the `skills`
  namespace, which only the SnabbSajt-hosted copy of the docs described.
- The README's status section now distinguishes the **published** version on npm
  from this source tree, because it previously listed unreleased 0.3.0 features
  directly above an `npm install` that resolves 0.2.0.

## [0.3.0] — unreleased

Catches the mirrored contract up to the app: everything the production importer
already accepted became expressible from Site Kit.

### Added

- **Custom brand.** `theme.customPalette` (13 raw CSS colours per light/dark
  surface), `customFonts`, and `customBrandHex` for when none of the eleven
  built-in palettes is the brand.
- **Re-importable sites.** `externalKey` on pages and sections, so a second
  import updates a site instead of stacking another draft.
- **Redirects.** `redirects[{ fromPath, toPath }]`.
- **Self-hosted video and PDFs.** Assets accept `kind: "video"` and
  `kind: "document"`; a video section may use `provider: "upload"`, and a hero
  may set `bgVideo`.
- **Next.js + shadcn starter template** (`templates/starter-smb`) whose content
  is a single `defineSite()` file: the same file renders the site and packs into
  an importable bundle. Six vertical presets.
- **`snabbsajt connect` and `snabbsajt pull`** — pair a repository you already
  have with one SnabbSajt site via browser device-code approval (writing
  `.snabbsajt.json` and `SNABBSAJT_DELIVERY_TOKEN` into `.env.local`), then fetch
  its published content to `snabbsajt/published.json`. The token is read-only and
  single-site, so a build can hold it safely.
- **`createDeliveryClient()`** — read a published site from your own app or
  build, with typed errors and locale selection.
- Five additional section variants mirrored from the app.
- `AGENT-QUICKSTART.md`, a one-paste onboarding prompt for coding agents.

### Changed

- Section `order` is optional. Omit it and the importer orders by array position;
  hand-written fractional order keys are no longer required.

## [0.2.0] — 2026-07-14

Published to npm. **Not git-tagged** — `v0.1.0` is the only tag in this
repository, which is why this file exists.

### Added

- **HTML import.** Bounded inventory of rendered HTML, CSS, images, forms,
  scripts, embeds, analytics and supported booking links, converted to an
  editable `site.json` with evidence and an import report. Imported JavaScript,
  inline handlers, arbitrary CSS and embeds never execute.
- **WordPress import.** Bounded WXR/XML parsing (no DTD or entity support)
  reconciled against the live public site, with safe media download.
- **The `snabbsajt` CLI** (`@snabbsajt/cli`) as the primary binary, with the
  `site` and `skills` namespaces. `site-kit` remains as a compatibility alias.
- **Versioned agent skills** — `import-website`, `build-snabbsajt-site`,
  `review-site-package` — shipped as checksummed release archives and
  installable with `snabbsajt skills install`.
- The honest import-report contract: `ready` / `review_required` / `blocked`,
  with an explicit `site import approve` step that refuses blocked packages.
- Redirect support and canonical app-contract sync.

### Fixed

- Editor-safe section order keys. Previously generated keys could be rejected by
  the app's editor.

### Security

- The canonical app contract is pinned to a full commit SHA and verified in CI,
  so a contract can never drift silently against the app it mirrors.

## [0.1.0] — 2026-07-13

First release. Typed authoring with `defineSite()`, the `sajt-site` v1 package
format, the validator and caps shared with the production importer, and
`site-kit init|validate|inspect|pack`.

[Unreleased]: https://github.com/HH-Studio/Sajtbuilder-SDK/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/HH-Studio/Sajtbuilder-SDK/releases/tag/v0.1.0
