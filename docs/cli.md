# CLI reference

The `snabbsajt` CLI is local-first. There is no API key to create, and no command
uploads or publishes anything as a side effect.

Credentials are split by namespace, and which is which matters more than anything
else on this page:

| Namespace | Credential | Can it change a site? |
| --- | --- | --- |
| `site *`, `skills *` | **None.** Runs entirely on your machine. | No |
| `connect`, `pull` | `SNABBSAJT_DELIVERY_TOKEN` — read-only, one site | No |
| `admin *` | `SNABBSAJT_ADMIN_TOKEN` — capability-scoped | Yes, within the scopes the owner granted |

## Import rendered HTML

```bash
snabbsajt site import html <public-url|file.html|site.zip> [-o package-dir] [--json]
```

This command safely inventories rendered HTML, CSS, images, forms, scripts,
embeds, analytics and supported booking links. It then writes an editable
`site.json` plus evidence, validation and import-report artifacts. Imported
JavaScript, inline handlers, arbitrary CSS and embeds never execute.

The output status is one of:

- `ready`: no review-required facts or losses were found.
- `review_required`: inspect `import-report.md` and the generated site.
- `blocked`: an input cap or known content loss prevents approval.

For `review_required`, inspect the report, edit `site.json` if needed, validate,
then explicitly record your decision:

```bash
snabbsajt site validate ./package-dir
snabbsajt site import approve ./package-dir --yes
snabbsajt site pack ./package-dir -o site.zip
```

Approval records a resolution on every remaining review finding and refreshes
the package provenance. It refuses blocked or schema-invalid packages. When an
installed agent skill adds proposals, approval also proves the deterministic
baseline is unchanged and accepts only additive, unresolved `ai_proposed`
findings with valid evidence citations.

## Connect an existing repository

```bash
snabbsajt connect [--api-url <url>] [--json]
snabbsajt pull [-o <file>] [--locale sv|en|pl] [--json]
```

These two and the [`admin` namespace](#edit-a-site-from-the-terminal--the-admin-namespace)
are the only commands that talk to SnabbSajt. Everything else in this reference
runs entirely locally.

`connect` pairs the current directory with **one** site: it prints a code, you
approve it in the browser, and it writes `.snabbsajt.json` (safe to commit) plus
`SNABBSAJT_DELIVERY_TOKEN` into `.env.local` (a secret — gitignore it). If
`.env.local` is not ignored, it warns on stderr in both output modes, because a
token in a tracked file is the one mistake worth interrupting for.

`pull` fetches that site's published content to `snabbsajt/published.json`.
Use `-o` for a different path and `--locale` for a translation.

**The token is read-only and scoped to one site**, so neither command can change
or publish anything. To read the site from application code instead of a file,
use `createDeliveryClient` from `@snabbsajt/site-kit` — see
[headless delivery](https://snabbsajt.com/docs/en/developer/site-kit/headless-delivery).

Do not confuse `connect` with `snabbsajt site init`, which scaffolds a site
*package* and touches no network.

## Edit a site from the terminal — the `admin` namespace

```bash
snabbsajt admin pair  [--scopes a,b,c] [--api-url <url>] [--no-open] [--json]
snabbsajt admin tools [--app-url <url>] [--json]
snabbsajt admin run <tool> [--args '<json>'] [--app-url <url>] [--json]
```

`admin` is the **only** namespace in this CLI that holds a credential able to
change a site. `snabbsajt site ...` stays local-first and keyless — it is never
given a token, and that is a boundary, not an accident. Read-only `pull` keeps its
own separate variable, so pairing for write access cannot silently escalate what
`pull` holds.

### `admin pair`

Device-code pairing, the same shape as `connect`: it prints a short code and a
URL, you approve it in a browser you are already signed in to, and the terminal
receives a capability-scoped token exactly once.

It **opens that page for you** when you are at an interactive terminal. The URL
is still printed first and always, because the browser it opens may be the wrong
one — or on the wrong machine, if you are over SSH. Pass `--no-open`, or set
`SNABBSAJT_NO_OPEN=1`, to keep it to the printed URL; it never opens anything
when there is no TTY or when `CI` is set.

It writes:

| File | Contains | Commit it? |
| --- | --- | --- |
| `.snabbsajt-admin.json` | app URL, site id, the granted scopes | **Yes.** Not a secret. |
| `.env.local` | `SNABBSAJT_ADMIN_TOKEN` | **No.** `pair` asks `git check-ignore` whether the file is covered and warns on stderr, in both output modes, when it is not. A file that is already *tracked* warns too, ignore rule or no ignore rule — that is the case worth catching. |

`--scopes` defaults to `site:read,content:write` — enough to read a site and edit
its draft, and nothing that publishes, spends AI credits, or reads customer data.
Ask for more only when you need it (`--scopes site:read,content:write,publish`).

**The owner decides, not the flag.** The approval page shows every requested
scope and the owner can untick any of them, so what you receive can be narrower
than what you asked for. `pair` prints the **granted** set for exactly that
reason; a developer who believes they hold `publish` and does not will otherwise
read the resulting refusal as a bug.

In CI, skip `pair`: commit `.snabbsajt-admin.json` and set `SNABBSAJT_ADMIN_TOKEN`
from your secret store. The environment always wins over `.env.local`. The token
is never printed — not by `--json`, not in an error — because `--json` output
lands in CI logs.

### `admin tools` and `admin run`

Both speak ordinary MCP JSON-RPC to `<appOrigin>/api/mcp`, the **same endpoint an
AI assistant connects to**. There is no REST-per-verb API.

```bash
snabbsajt admin tools                    # what this grant actually allows
snabbsajt admin run list_pages
snabbsajt admin run update_section_text --args '{"sectionId":"...","text":"..."}'
```

`run` is generic on purpose: `--args` is passed through as the tool's arguments,
so every capability the app gains is reachable immediately, with no CLI upgrade
and no new subcommand. `admin tools` is how you discover the current set — do not
work from a list in a document, including this one.

`--app-url` (or `SNABBSAJT_APP_URL`) overrides the origin recorded at pairing;
you need it only for a non-production deployment. Note it is the **app** origin,
not the API URL `connect` uses.

### What a paired terminal still cannot do

Scopes are not the last gate. The actions that are public or hard to undo —
**publishing, taking a site offline, emailing a customer an invoice or offer,
granting someone access to the site** — go through a prepare → approve → confirm
rail. The `prepare_*` tool only creates a review and hands back an approval URL;
the owner opens it and approves **at the moment it happens**, and the confirmation
is bound to the exact state they reviewed. So a paired terminal, or an agent
driving one, cannot publish or send anything unattended — whatever scopes it
holds.

Errors say what to do rather than what went wrong: a missing token points at
`admin pair`, a revoked or expired one points at pairing again, and a tool that
refuses (a missing scope, a stale review) reports the tool's own words and exits
non-zero.

## Create a package

```bash
snabbsajt site init <dir> [--template nextjs|html] [--json]
```

Creates a starter `site.json`, empty asset/font directories, and local guidance.
It refuses symlinks and non-empty target directories.

## Validate

```bash
snabbsajt site validate <site.json|dir> [--json]
```

Checks the versioned envelope, section content, variants, caps, references,
duplicate ids/slugs, and package file names. Schema validity does not mean an
HTML import has completed review; check `import-report.md` as well.

## Import WordPress

```bash
snabbsajt site import wordpress --url https://example.com --wxr export.xml --out ./converted
```

The public URL and WXR/XML export are both required. The command crawls the
public origin through the bounded HTML adapter, parses WXR without DTD/entity
support, reconciles conflicts, downloads safe media, and emits the same review
artifacts as HTML import. Local conversion needs no API key.

## Inspect

```bash
snabbsajt site inspect <site.json|dir> [--json]
```

Prints business name, language, page/section/asset counts and section types.

## Pack

```bash
snabbsajt site pack <dir> [-o bundle.zip] [--review-draft] [--json]
```

Validates, calculates SHA-256 checksums, and creates a SnabbSajt bundle. An
unresolved import is refused unless `--review-draft` is explicit. A review
draft contains the site under `REVIEW-DRAFT/` together with its report and
evidence, but deliberately has no root `site.json`, so it is not importable or
publish-ready.

## Doctor

```bash
snabbsajt site doctor [--json]
```

Reports installed CLI, Site Kit and format versions without a network request.
`snabbsajt --version` prints the CLI version alone, for scripts that only need
that.

## Agent skills

```bash
snabbsajt skills install --agent auto|codex|claude|all [--global] [--force] [--json]
snabbsajt skills list    --agent auto|codex|claude|all [--global] [--json]
snabbsajt skills doctor  --agent auto|codex|claude|all [--global] [--json]
```

Installs the agent skills into a coding agent's skill directory. `auto` detects
which agents the repository already uses.

- `snabbsajt-getting-started` — the entry point: picks the layer (local package
  work, read-only delivery, or MCP), connects it, and routes to the others.
- `import-website` — convert an existing site into a package.
- `build-snabbsajt-site` — author a new package from a brief.
- `review-site-package` — sign a package off before anyone imports it.
- `manage-snabbsajt-site` — run a live site over MCP, draft-first.

Each skill also carries the reference material it needs offline — the CLI
surface with its credential model and failure modes, the MCP tool catalogue with
scopes — so an agent never has to guess a flag or a tool name.

Installation is **project-local unless you pass `--global`**. A skill file you
have modified is preserved unless `--force` is explicit, and a backup is written
before any replacement. `doctor` reports drift between installed skills and the
versions this CLI ships.

## Legacy `site-kit` binary

`@snabbsajt/site-kit` also ships a `site-kit init|inspect|validate|pack` binary
for hand-authored packages. It still works, but it is the older surface and the
documentation no longer uses it — every workflow here is `snabbsajt site ...`
from `@snabbsajt/cli`. If you find `npx site-kit ...` in a guide, it is stale.
