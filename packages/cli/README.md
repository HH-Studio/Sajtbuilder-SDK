# @snabbsajt/cli

Local-first command line tools for [SnabbSajt](https://snabbsajt.com) sites.

**No API key to create. Every `site` and `skills` command runs on your machine** —
nothing is uploaded or published as a side effect. The commands that do talk to
SnabbSajt obtain their own credential by browser approval: `connect`/`pull` a
read-only one, `admin` a capability-scoped one you grant explicitly.

```bash
npm install -g @snabbsajt/cli
# or, without installing:
npx @snabbsajt/cli --help
```

## What it does

**Connect a repo you already have** so your team edits content in SnabbSajt while
the site keeps deploying from your own git and host:

```bash
npx @snabbsajt/cli connect   # prints a code, you approve it in the browser
npx @snabbsajt/cli pull      # fetch the published content
```

`connect` writes `.snabbsajt.json` (safe to commit) and
`SNABBSAJT_DELIVERY_TOKEN` into `.env.local` (a secret — gitignore it). The token
is **read-only and scoped to one site**, so neither command can change or publish
anything.

**Edit a site from the terminal**, when reading it is not enough:

```bash
npx @snabbsajt/cli admin pair    # approve the scopes in the browser
npx @snabbsajt/cli admin tools   # see what your grant allows
npx @snabbsajt/cli admin run get_site_overview
```

`admin` is the only namespace holding a credential that can change a site
(`SNABBSAJT_ADMIN_TOKEN` — a different variable from the read-only one). `site *`
stays keyless. `tools`/`run` speak MCP to the same endpoint an AI assistant uses,
so every capability the app gains is reachable without a CLI upgrade.

**Convert an existing website** into an editable SnabbSajt package:

```bash
snabbsajt site import html https://example.com -o ./converted
snabbsajt site import approve ./converted --yes
snabbsajt site pack ./converted -o site.zip
```

WordPress needs the live site plus a WXR export:

```bash
snabbsajt site import wordpress --url https://example.com --wxr export.xml --out ./converted
```

**Author a package by hand**, validate it, and pack it:

```bash
snabbsajt site init ./my-site --template nextjs
snabbsajt site validate ./my-site
snabbsajt site pack ./my-site -o my-site.zip
```

**Install the conversion skills** into your coding agent (project-local unless
you pass `--global`):

```bash
snabbsajt skills install --agent auto
```

Import the resulting zip in SnabbSajt under **Settings → Backup & move**. Import
always creates a new unpublished draft — it never overwrites or publishes a site.

Always read `import-report.md` before approving a conversion. Unsupported
behaviour is reported and stays inert, and a package with blocked content loss
cannot be approved.

## Every command

`--json` works on all of them; `--help` works on each subcommand.

```
snabbsajt --version
snabbsajt connect [--api-url <url>]
snabbsajt pull [-o <file>] [--locale sv|en|pl]
snabbsajt admin pair [--scopes a,b,c] [--api-url <url>]
snabbsajt admin tools [--app-url <url>]
snabbsajt admin run <tool> [--args '<json>'] [--app-url <url>]
snabbsajt site init <dir> [--template nextjs|html]
snabbsajt site import html <url|file.html|site.zip> [-o package-dir]
snabbsajt site import wordpress --url <url> --wxr <export.xml> --out <dir>
snabbsajt site import approve <package-dir> --yes
snabbsajt site inspect <site.json|dir>
snabbsajt site validate <site.json|dir>
snabbsajt site pack <dir> [-o bundle.zip] [--review-draft]
snabbsajt site doctor
snabbsajt skills install|list|doctor --agent auto|codex|claude|all [--global] [--force]
```

## What it will not do

It is not a code importer. It does not execute your React, PHP, plugins,
scripts, or arbitrary CSS — your site is evidence, never the runtime. Content is
mapped onto SnabbSajt's typed sections so the imported site stays responsive,
accessible and editable.

## Documentation

- [Developer docs](https://snabbsajt.com/docs/en/developer/site-kit)
- [CLI reference](https://snabbsajt.com/docs/en/developer/site-kit/cli)
- [Headless delivery](https://snabbsajt.com/docs/en/developer/site-kit/headless-delivery)
- [Changelog](https://github.com/HH-Studio/Sajtbuilder-SDK/blob/main/CHANGELOG.md)
- [Source and issues](https://github.com/HH-Studio/Sajtbuilder-SDK)

Programmatic authoring and validation live in the companion package,
[`@snabbsajt/site-kit`](https://www.npmjs.com/package/@snabbsajt/site-kit).

MIT licensed.
