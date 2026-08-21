# SnabbSajt CLI reference

Every command in the `site` and `skills` namespaces runs **entirely on the local
machine** and needs no credential. Only four commands talk to SnabbSajt:
`link`/`connect` (pair), `pull` (read), `push` (write a draft), and the `admin`
namespace (scoped writes).

Run `snabbsajt <command> --help` for anything not listed here. Every command
accepts `--json`; use it — the human-readable output is not a contract.

## Contents

- [Credential model](#credential-model) — which token can change a site
- [Command surface](#command-surface)
- [Local package workflow](#local-package-workflow)
- [Connecting a directory to a site](#connecting-a-directory-to-a-site)
- [Pushing a package into a draft](#pushing-a-package-into-a-draft)
- [Installing these skills](#installing-these-skills)
- [Failure modes](#failure-modes)

## Credential model

| Namespace | Credential | Can it change a site? |
| --- | --- | --- |
| `site *`, `skills *` | none — fully local | No |
| `link`, `connect`, `pull` | `SNABBSAJT_DELIVERY_TOKEN` — read-only, one site | No |
| `admin *`, `push` | `SNABBSAJT_ADMIN_TOKEN` — capability-scoped | Yes, within granted scopes |

The split is deliberate. Pairing for write access never escalates what `pull`
holds. Do not copy one token into the other variable.

`.snabbsajt.json` and `.snabbsajt-admin.json` are config and safe to commit.
`.env.local` holds the tokens and must stay gitignored — `pair` and `connect`
warn on stderr when it is not. Never print a token, not even under `--json`.

## Command surface

```bash
snabbsajt --version
snabbsajt upgrade [--yes] [--json]

# pair this directory with one site (read-only token)
snabbsajt link [--site <slug|id>] [--yes] [--relink] [--status] [--json]
snabbsajt unlink [--json]
snabbsajt connect [--api-url <url>] [--json]          # older browser-picked variant
snabbsajt pull [-o <file>] [--locale sv|en|pl] [--json]

# write access (capability-scoped token)
snabbsajt admin pair [--scopes a,b,c] [--api-url <url>] [--no-open] [--json]
snabbsajt admin tools [--app-url <url>] [--json]
snabbsajt admin run <tool> [--args '<json>'] [--app-url <url>] [--json]
snabbsajt push <site.json|dir> [--site <id>] [--dry-run] [--force-key <k>]... [--json]
                               [--register <declarations.json> | --no-register]

# local package work — no credentials, no network
snabbsajt site init <dir> [--template nextjs|html] [--json]
snabbsajt site import html <url|file.html|site.zip> [-o package-dir] [--json]
snabbsajt site import wordpress --url <public-url> --wxr <export.xml> --out <dir> [--json]
snabbsajt site import approve <package-dir> --yes [--json]
snabbsajt site inspect <site.json|dir> [--json]
snabbsajt site validate <site.json|dir> [--json]
snabbsajt site pack <dir> [-o bundle.zip] [--review-draft] [--json]
snabbsajt site doctor [--json]

# agent skills
snabbsajt skills install --agent auto|codex|claude|all [--global] [--force] [--json]
snabbsajt skills list   --agent auto|codex|claude|all [--global] [--json]
snabbsajt skills doctor --agent auto|codex|claude|all [--global] [--json]
```

## Local package workflow

```bash
snabbsajt site doctor --json                     # 1. compatibility gate, always first
snabbsajt site init ./acme --template html       # 2. scaffold
# edit site.json + assets/
snabbsajt site validate ./acme --json            # 3. after every meaningful change
snabbsajt site inspect ./acme --json             # 4. counts vs the brief/source
snabbsajt site pack ./acme -o acme.zip           # 5. only once validation is clean
```

`validate` failing is a hard stop, never a warning to note and move past.
`inspect` is how you prove counts — do not report page/section/asset numbers you
did not read out of it.

## Connecting a directory to a site

`link` is where most people start: it lists the sites the human owns and they
pick one at the terminal. `connect` is the older flow that picks in the browser.
Both end at the same read-only, single-site delivery token.

```bash
snabbsajt link --status --json        # state check BEFORE assuming a link exists
snabbsajt link --json                 # never prompts under --json
snabbsajt pull --json                 # writes snabbsajt/published.json
```

`link`/`connect` require a human at a browser. You cannot self-serve either —
print the URL and code, then stop and wait.

## Pushing a package into a draft

`push` merge-imports a validated package into an existing site's **draft**. It
publishes nothing.

```bash
snabbsajt admin pair --scopes site:read,content:write --json   # human approves in browser
snabbsajt push ./acme --dry-run --json                         # ALWAYS first
snabbsajt push ./acme --json
```

- Sections match on `externalKey`.
- Anything the customer already edited in the app returns as a **conflict** and
  is skipped. `--force-key <externalKey>` overrides one — never pass it on your
  own judgement, because a conflict is the customer's own work.
- `--dry-run` runs the real merge server-side and rolls it back. Run it before
  every real push and show the human the result.
- The delivery token is rejected here by design; `push` needs the admin token.
- **Your declarations ride along.** `push` reads `snabbsajt/blocks.ts` and
  `snabbsajt/collections.ts` and sends the blocks and lists they declare with
  the content, so the client's editor offers them. A package that already
  carries them wins, so a pulled repo never overwrites the client's rows.
  Node reads TypeScript itself from 22.18; on an older one write
  `{ blockSchemas, contentCollections }` to `snabbsajt/declarations.json`, or
  name a file with `--register`. `--no-register` sends the package untouched.

## Installing these skills

```bash
snabbsajt skills doctor --agent auto --json    # drift between installed and shipped
snabbsajt skills install --agent auto --json   # project-local unless --global
```

Installs are project-local by default. A skill file the human edited is
preserved unless `--force`, and a backup is written before any replacement.

## Failure modes

| Symptom | Cause | What to do |
| --- | --- | --- |
| `site doctor` reports an incompatible format | CLI older than the package/site contract | `snabbsajt upgrade` (or `npm i -g @snabbsajt/cli`), then re-run. Do not proceed on the old contract. |
| A command is not recognised | CLI predates the feature | Check `snabbsajt --version` against the skill's `minimum-cli-version`, then upgrade. |
| `push` refuses the token | delivery token in `SNABBSAJT_ADMIN_TOKEN`, or missing `content:write` | Re-run `admin pair` with the scope. Do not route around it. |
| `admin run` denies a tool | the owner unticked that scope at approval | Say what was refused and stop. A denial is a boundary. |
| `link`/`pair` never completes | nobody approved in the browser | Print the URL + code again and wait. You cannot approve for them. |
| Import status `review_required` | losses or facts needing a human | Read `import-report.md`, fix, then `site import approve … --yes` — the human records the approval. |
| Import status `blocked` | an input cap or known content loss | Cannot be approved. Report it; do not pack. |
