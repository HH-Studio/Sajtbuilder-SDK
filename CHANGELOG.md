# Changelog

All notable changes to `@snabbsajt/site-kit` and `@snabbsajt/cli`. The two
packages share one version number and are released together.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this
project adheres to [semantic versioning](https://semver.org/spec/v2.0.0.html).

`site.json` compatibility is tracked separately from the package version: the
package format is `sajt-site` v1 and has not changed since `0.1.0`. A package
that validated against an older CLI still validates against a newer one.

## [Unreleased]

### Changed

- **The `starter-smb` template renders its icons with Tabler, and no longer
  depends on Lucide.** SnabbSajt uses `@tabler/icons-react` as its only icon
  system, but the editable starter still declared `lucide-react` and imported a
  single `Star` from it, so anyone scaffolding from the template inherited an
  icon library the product had already dropped. The rating stars now come from
  `IconStarFilled`, which fills with `currentColor` and therefore needs only
  `text-primary` where the old markup needed `fill-primary text-primary`.

- **`snabbsajt site import html` now builds its sections with the app's own
  section mapper, mirrored into `src/mirror`.** The CLI carried a mapper of its
  own that emitted a fixed hero → rich-text → footer on every page and never
  read the source, so a nine-block page converted to three sections while the
  in-app import of the same page produced services, pricing, gallery and
  contact bands. One product, two answers, and the CLI had the wrong one.

  `scripts/mirror-import.ts` copies the app's pure detector modules and rewrites
  their imports onto the mirrors this package already carries, so there is
  exactly one `SECTION_REGISTRY` and one portable schema in the bundle. The
  mirror is generated: `bun run mirror:check` fails when a mirrored file is
  edited by hand, and CI additionally checks out the app at the pinned commit
  and fails when the app has moved on.

  What stays this package's job is what the app has no equivalent for: real
  blobs (an asset the mapper registered but the package cannot back is removed,
  along with the band that used it, rather than shipped pointing at nothing),
  real pixel dimensions read from those blobs, verified-only tracking ids, and
  the loss accounting in the report.

  Measured on a real client site (a Swedish single-page therapist site exported
  from Webflow): **3 sections → 6** (hero · rich-text · highlights · pricing ·
  contact · footer), **0 usable photographs → 2** with the owner's own picture
  in the hero, the price list imported instead of lost, phone and email
  extracted, and the report went from `ready` / publish-ready to
  `review_required` naming the 6 paragraphs and 1 heading that genuinely did not
  come across.

- **The report accounts for lost COPY, not only lost headings.** A page of
  unbroken paragraphs can lose every word of it without losing a heading, and
  the old accounting had nothing to say about that. Each page now compares its
  own paragraphs with what the imported sections render, and reports the ones
  that are missing.

### Fixed

- **A gallery the mapper had already built reported itself as unconvertible.**
  In zip mode a page is parsed against `https://archive.invalid/<path>` and its
  references are then localized to archive paths, so matching the two raw
  strings found nothing: the behaviour layer could not see that its gallery
  evidence was already a `gallery` section and filed a review item against it.
  Both lookups now go through the same normalizer, and a band the mapper built
  from the page's own structure cites the agreeing evidence instead of leaving
  it to the catch-all.

- **`playwright` is external to the build.** The optional browser dependency of
  `site measure` was being bundled, which broke `bun run build` wherever a
  partial `playwright-core` was resolvable.

### Added

- **Skills 1.3.0: an entry-point skill, and reference material that ships with
  them.** The four skills each described their own workflow well and told an
  agent nothing about how to get connected, so a session that opened with
  "koppla min sajt" or just "SnabbSajt" had no skill to land in and picked a
  layer by guessing. `snabbsajt-getting-started` is now that landing point: it
  state-checks the CLI and the link, picks between local package work, the
  read-only delivery token, and MCP, and routes to the skill that does the job.
  All five now also carry the reference material they need offline — the full
  CLI surface with its credential split and per-command failure modes, and the
  MCP tool catalogue with the scope each tool needs and what a denial means, and
  for the three that author or check a package, the whole `PortableSiteV1`
  schema, generated into `skills/shared/section-schema.md` from the same
  contract the validator reads. An agent writing `site.json` no longer infers a
  section type and discovers at `site validate` that it does not exist. All of
  it loads only when a task reaches it, so the descriptions stay cheap. The four
  existing descriptions were rewritten to say when to fire and how they differ
  from each other, in Swedish as well as English, since a description is the
  only thing an agent reads before choosing. The release workflow now stages
  skills and their shared references straight from the manifest, so the next
  skill ships without editing it.

- **`skills/manifest.json` is generated, and stale is now a red test.** Its
  per-file checksums are what let `skills install` tell "the CLI shipped a new
  version" apart from "the human edited this file", and they were maintained by
  hand — so a one-word fix to a `SKILL.md` left the manifest describing a file
  that no longer existed, and the mismatch only surfaced at install time on
  someone else's machine. With a generated reference among the bundled files
  that stopped being hypothetical. `bun scripts/gen-skill-manifest.ts` writes
  it, `--check` fails on drift, `bun run check` runs that, and the contract
  suite verifies every hash against its real source.

- **`admin pair` and `connect` open the approval page for you.** Device-code
  pairing asked you to move a URL from a terminal into a browser by hand, which
  was the slowest step of an otherwise one-command flow. Now the page opens when
  you are at an interactive terminal. The URL is still printed first and always
  — the browser we open may be the wrong one, or on the wrong machine over SSH —
  and nothing is opened without a TTY, with `CI` set, with `SNABBSAJT_NO_OPEN=1`,
  or when you pass `--no-open`. The URL is parsed and required to be `http(s)`
  before it reaches an opener, and is passed as a single argv entry with no
  shell involved.


- **The starter template can serve the site your client published.** Until now
  the template was a one-way street: you authored `src/site.ts`, packed it, and
  imported it. What your client then edited and published had nowhere to go —
  their words lived in SnabbSajt and your deployment kept rendering the file you
  wrote. Set `SNABBSAJT_SITE_ID` and `SNABBSAJT_DELIVERY_TOKEN` and the same
  components now render the published snapshot instead, fetched at build time;
  set neither and nothing changes. Setting exactly one fails the build on
  purpose, because half-configured would quietly deploy the template's demo
  content to a real domain.

  Two new exports do the normalising, and they are useful outside the template:
  `renderModelFromPackage` and `renderModelFromPublished` turn an authored
  `PortableSiteV1` and a published `PublishedSite` into one `RenderSite` — pages
  in order, sections in fractional-index order, hidden sections dropped the way a
  publish drops them, posts and job pages kept out of top-level routing, and
  images resolved. With `findPage` and `resolveAsset` alongside them, a headless
  app renders both sources through one component switch, so what a developer
  previews locally is what their client ships.

- **Lodging sites, and eight editorial layouts.** The mirrored contract now
  carries the `hotel` business type — hotell, pensionat, vandrarhem, B&B and
  stuguthyrning, whose product is a room priced per night rather than a service
  priced per visit — so a Site Kit package can declare it instead of falling back
  to `generic`. Alongside it, eight layouts harvested from a real studio site:
  `hero.slideshow` (photos that take turns filling the first view, with
  `hero.slides`), `bento.featured-work` (a selection of work with an optional
  "see all" link, via `bento.cta`) and `bento.work-index` (the same work behind
  category tabs), `gallery.lightbox`, `highlights.ruled-columns`,
  `highlights.credo`, `services.numbered-cells` and `certifications.ledger`.

  Both fields are optional and additive: a package written against the previous
  contract still validates unchanged.

- **Current site presentation contract.** Site Kit now mirrors route-native
  news and careers layouts, the latest section variants and media fields, and
  grouped site navigation with its floating-pill and floating-launcher
  presentations. This includes the manual `team.portrait-reveal`,
  `team.avatar-roster`, and `team.expanding-strips` layouts for authored team
  portraits, plus `testimonials.card-carousel` and
  `testimonials.vertical-stack` for authored review collections. Portable
  packages preserve these settings instead of dropping them during validation
  or multilingual conversion.

- **Authored multilingual packages.** `PortableSiteV1.localizations` pairs
  translated pages and section content to stable `tmpId`s, including per-locale
  page slugs. The app keeps the author's copy instead of replacing it with AI.
  Local validation rejects the same incomplete, structurally different, or
  route-conflicting locale payloads as the production importer.
  The contract mirror also catches up with the app's current locales, section
  variants and measured layout fields.

- **`snabbsajt link` — pick your site in the terminal, with the arrow keys.**
  `connect` sends you to the browser to choose a site; `link` sends you to the
  browser to approve the *terminal*, then lists the sites you own right here.
  It prints the directory it is about to write to before it writes anything,
  says how many workspaces it searched, shows `workspace / slug` with when each
  site was last published, and offers **"Not one of these sites"** as a normal
  answer that exits 0. Re-running in a linked directory offers keep / choose a
  different site / unlink. Flags: `--site <slug|id>`, `--yes`, `--relink`,
  `--status`, `--json`.

  The credential story is unchanged, which is the point: the server-side pairing
  row is a single-use ticket that lives ten minutes and can mint exactly one
  read-only, single-site delivery token — the same token `connect` has always
  produced. Nothing account-scoped is stored on the machine, and the two files
  written are the two `connect` already writes.

- **`snabbsajt unlink`** — revokes the delivery token (a delivery token may
  revoke *itself*, and nothing else), then removes `.snabbsajt.json` and only
  our line from `.env.local`. When the revoke call cannot reach the server it
  says the key may still be live rather than implying it is dead.

- **`snabbsajt upgrade`, and an update notice.** After a command — never before,
  never blocking — an out-of-date CLI prints `Update available … (vX → vY)` on
  **stderr**, cached 24 h in `~/.snabbsajt/update-check.json` behind a 1.5 s
  timeout that swallows every error. Silent under `--json`, without a TTY, in
  CI, with `SNABBSAJT_NO_UPDATE_CHECK=1`, and after a command that already
  failed. Versions are compared as semver, so `0.10.0` is newer than `0.9.0`.
  After `link` and `connect` it also offers to upgrade — **defaulting to no**,
  and printing the exact command either way. `upgrade` detects how the CLI was
  installed (npx, global npm/pnpm/yarn/bun, or a repo dependency) and never
  edits anyone's `package.json`.

- **`src/prompt.ts`** — `select()` and `confirm()` with no dependency: raw-mode
  arrow keys with a sliding ten-row window, a numbered-list fallback wherever
  raw mode is unavailable, terminal state restored in a `finally`, and exit
  code 130 on Ctrl-C with nothing written.

### Fixed

- **One image is one asset.** A `srcset` lists the same photograph at other
  widths, and the importer treated every entry as its own asset. A real
  two-photograph client page came in as 14 assets, 12 of them `-p-500`…`-p-2000`
  renditions that no section referenced — and the 12 resulting "never
  referenced" warnings buried the 3 that were real. The author's `src` now wins;
  a `<picture>` `<source>` with no `src` keeps its largest rendition. Every
  rendition is still classified for third-party host evidence.

  The same rule fixed a symptom nobody had reported: gallery detection counts
  distinct images, so a single image inside a `.gallery` wrapper could be
  detected as a three-image gallery on the strength of its own renditions.

- **The import report now says what the mapping cost.** Generic HTML maps to
  hero + one rich-text section + footer, so a nine-block page arrived as three
  sections — and the report called it `Ready` with **0 blocking findings**.
  Every skipped script was itemised; losing two thirds of the page's structure
  produced nothing at all. Behaviour did not vanish silently; layout did.

  Each page now carries a `merged` finding naming the source headings that
  became text inside one rich-text section instead of sections of their own, and
  a page that loses more than three named blocks also gets a `manual` item, so
  its status is `review_required` rather than publishable-as-is. The underlying
  mapper still emits a fixed sequence rather than reading the source; this makes
  that visible instead of quiet.

- **One unreadable file no longer throws away an entire real-site import.**
  Found by running `snabbsajt site import html` against two live customer sites
  on 2026-08-15. `barkk.se` rate-limits its own asset host, and a single
  `HTTP 429` on one script aborted the whole run with exit 1 — nothing imported,
  nothing reported. The URL lane treated every failed subordinate fetch as
  fatal, while the archive lane had always recorded a missing file as a warning
  and carried on. The two lanes now agree: an ordinary non-2xx status, or a
  read that ran out of its slice of the shared time budget, is recorded as
  `Skipped unreachable resource: …` and the import keeps going.

  **What stays fatal, deliberately:** the entry URL itself (a site we never read
  is not an import), every safe-fetch policy refusal including
  `UNSAFE_DESTINATION`, a resource redirected off the selected origin, and every
  ingestion cap — those are the reasons the crawl is bounded and safe at all.

- **Running out of time now truncates the import instead of discarding it.**
  The ingestion deadline is shared across the crawl, so on a site large enough
  to spend it, the last resources inherited a near-zero per-fetch budget, timed
  out, and took the whole import down — including pages already parsed. Hitting
  the deadline after the entry page now stops collection, sets `truncated`, and
  says so in the warnings, which is what `truncated` already meant for the page
  cap. `barkk.se` goes from exit 1 to 25 pages, 33 assets and 4,708 CSS rules
  with every skipped resource named.

- **A release can no longer half-ship while every command reports success.** On
  2026-08-13 `@snabbsajt/cli@0.4.0` went to npm against a still-`0.3.0`
  `@snabbsajt/site-kit`, so `npm install @snabbsajt/cli` — the first command an
  inbound developer types — died with `ETARGET` for about seven hours. The cause
  was `npm publish` run against `packages/site-kit/`, a `"private": true`
  workspace link: npm prints a full, convincing tarball notice, warns that it
  skipped the workspace, and **exits 0**. `scripts/publish-package.ts` now
  refuses a private manifest before npm can shrug it off, and confirms with the
  registry that the exact version actually landed before returning — npm's exit
  code is not evidence, and the registry is the only truth. Because the release
  workflow publishes Site Kit first and routes both packages through this
  script, the failure now stops the run before the CLI publishes, instead of
  being noticed by the final `npm audit signatures` after the broken pair is
  already public.

- **The skills contract test stopped failing on every version bump.** It pinned
  `1.1.0` as a literal for both the manifest's release version and the
  importer's, so shipping the skills at `1.2.0` left the suite red on `main`. It
  now requires stable semver and keeps asserting what the test is actually
  about: the one checksummed shared mapping reference.

- **`pair` no longer claims your token is unprotected when it is.** The
  `.gitignore` check gave up on *any* negation line and reported "not
  gitignored". The default `create-next-app` `.gitignore` negates four `.yarn/`
  paths, so the warning fired on essentially every Next.js project — about a
  file git was ignoring perfectly well via `.env*`. It now asks
  `git check-ignore`, which is the only thing that actually decides this (globs,
  negations, parent `.gitignore` files, `.git/info/exclude`), and falls back to
  literal parsing only when git cannot be asked: no git, or not a repository
  yet. Negations still force a surrender, but only ones that could plausibly
  match `.env.local`.

  The check deliberately does **not** pass `--no-index`: a `.env.local` that is
  already tracked still warns, ignore rule or not, because a committed token is
  the worst case here and the one most worth shouting about.

  A security warning that fires on healthy projects is one people learn to skip,
  which is the real bug.


- **`--json` errors were not JSON in a colour-capable terminal.** `snabbsajt
  skills … --json` writes its error object to stderr, and Bun's `console.error`
  wraps everything it prints in ANSI red (`\x1b[0m\x1b[31m{…`) whenever the
  environment allows colour. `--json` exists for exactly one audience — a script
  or a coding agent calling `JSON.parse` — and that audience got a string that
  does not parse, in a terminal and in any agent harness that allocates a pty.
  CI has no TTY, which is why 15 of this suite's tests failed locally and passed
  in CI, and why the bug survived into the published 0.2.0 and 0.3.0. The four
  command modules now share one `Output` definition (`packages/cli/src/output.ts`)
  whose default writes raw lines straight to the streams, so output is
  byte-identical under Bun and Node and no path can colour a machine-readable
  one again. Pinned by a test that forces `FORCE_COLOR=1` and asserts stderr
  contains no escape sequence at all.

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

## [0.3.0] — 2026-08-08

Published to npm without provenance. The release workflow was not usable for
this version, so no matching git tag exists.

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

### Changed

- **Release verification no longer needs a publishing tag.** Agents can dispatch
  the package or skills lane with an explicit version to run build and contract
  checks. Manual dispatches cannot publish npm packages or create a GitHub
  release; those actions still require their dedicated version tag. The SDK
  typecheck resolves starter-fixture imports against the local Site Kit source,
  so the release gate does not depend on an already-published future version.
  Package publishing prefers OIDC with a granular-token fallback, and retries
  skip an exact existing version only after its npm provenance is verified.

## [0.1.0] — 2026-07-13

First release. Typed authoring with `defineSite()`, the `sajt-site` v1 package
format, the validator and caps shared with the production importer, and
`site-kit init|validate|inspect|pack`.

[Unreleased]: https://github.com/HH-Studio/Sajtbuilder-SDK/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/HH-Studio/Sajtbuilder-SDK/releases/tag/v0.1.0
