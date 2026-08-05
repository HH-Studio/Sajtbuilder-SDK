# Publishing the npm packages

## Preferred path: tag it and let CI publish

Since 2026-07-27 the `Release` workflow publishes both packages with
**npm provenance** (`npm publish --provenance`), in the correct order, after
`bun run check` passes. Provenance is only possible from CI — the attestation is
signed with the workflow's OIDC identity, so a package published by hand from a
laptop can never carry one. Prefer this path.

```bash
# versions in package.json + packages/cli/package.json + skills/manifest.json
# must already agree, and the CLI must depend on the exact Site Kit version
git tag -a v0.3.0 -m "SnabbSajt Site Kit and CLI 0.3.0"
git push origin v0.3.0
```

> **⚠️ This path cannot currently succeed, and that is why 0.2.0 and 0.3.0 were
> both published by hand with no provenance.** The two jobs demand two different
> tags: `release` (`.github/workflows/release.yml:26`) requires the tag to equal
> `v${skills/manifest.json releaseVersion}`, today `v1.1.0`, while `npm`
> (`:86`, and it `needs: release`) requires `v${package version}`, today
> `v0.3.1`. No tag satisfies both, so the npm job never runs. Written up with
> the decision it needs — split the triggers, or make the manifest track the
> package version — in the app repo's backlog `1810`. Until that is settled,
> use the hand path below and accept the missing attestation.

The workflow verifies the tag against both package versions and the CLI's
dependency range, builds the skill archives, creates the GitHub release, then
publishes site-kit followed by cli. **It needs the `NPM_TOKEN` repository secret**
(an `@snabbsajt` automation token). Without it the npm job is skipped with a
warning and only the GitHub release ships.

Afterwards, confirm the provenance badge is present on both package pages.

## Fallback: publishing by hand

Use this only when CI cannot run. **A hand-published version has no provenance.**

Publish `@snabbsajt/site-kit` first. The CLI has an exact dependency on the
same Site Kit version, so reversing the order creates a broken install window.

The steps below read the version from `package.json` into `$VERSION` rather
than naming one. They used to spell `0.2.0` throughout, and by 0.3.0 the runbook
was verifying a release two versions old — the substitution was documented and
still nobody made it.

## One-time npm setup

1. Sign in at <https://www.npmjs.com/> and create or join the `snabbsajt`
   organization. The account must be allowed to publish public scoped packages.
2. Enable two-factor authentication for writes.
3. From this repository, authenticate with the same account:

   ```bash
   npm login --cache "$TMPDIR/npm-cache"
   npm whoami --cache "$TMPDIR/npm-cache"
   ```

The npm profile name and package scope are separate. Signing in as
`ludvighedin` does not grant access to `@snabbsajt`. Confirm the organization
exists and lists your account before publishing:

```bash
npm org ls snabbsajt --json --cache "$TMPDIR/npm-cache"
```

If that command or `npm publish` reports `E404 Scope not found`, create the
`snabbsajt` organization at <https://www.npmjs.com/org/create> while signed in
as `ludvighedin`, or have an existing owner add that account. Then rerun the
organization check. Do not rename the packages merely to bypass this setup.

If `npm publish` reports `E403` and says two-factor authentication is required,
the browser login succeeded but the account is not allowed to publish yet.
Enable **Authorization and writes** in npm Account → Two-Factor Authentication,
or run the interactive command below, then retry Site Kit:

```bash
npm profile enable-2fa auth-and-writes --cache "$TMPDIR/npm-cache"
```

Do not continue to the CLI after a failed Site Kit publication. The CLI has an
exact Site Kit dependency and cannot install correctly until Site Kit exists in
the registry.

Never put an npm token in this repository, `.npmrc`, a screenshot, or a command
that will be committed. A future CI release should use npm trusted publishing.

## Release gate

Run from the repository root on `main` with a clean tree:

```bash
git pull --ff-only
bun install --frozen-lockfile
# Every step below reads the version from the manifest instead of naming one,
# so this runbook cannot go stale between releases the way it did at 0.2.0.
VERSION="$(node -p "require('./package.json').version")"

bun run check
bun run release:assets
npm pack --dry-run --json --cache "$TMPDIR/npm-cache"
npm pack --dry-run --json --workspace packages/cli --cache "$TMPDIR/npm-cache"
```

Confirm both manifests say `$VERSION`, the CLI dependency is exactly
`@snabbsajt/site-kit: $VERSION`, and neither tarball contains fixtures, source
credentials, customer data, or local configuration.

## 1. Publish Site Kit

The publishable Site Kit package is the repository root. Do not publish the
private `packages/site-kit` workspace link.

```bash
npm publish --access public --cache "$TMPDIR/npm-cache"
npm view @snabbsajt/site-kit@$VERSION version dist.integrity --json --prefer-online --cache "$TMPDIR/npm-cache"
```

Stop if the registry verification does not return `$VERSION` and an integrity
hash. Do not publish the CLI against a missing dependency.

## 2. Publish the CLI

```bash
npm publish --workspace packages/cli --access public --cache "$TMPDIR/npm-cache"
npm view @snabbsajt/cli@$VERSION version dependencies bin dist.integrity --json --prefer-online --cache "$TMPDIR/npm-cache"
```

The response must show the `snabbsajt` binary and the exact Site Kit `$VERSION`
dependency.

`--prefer-online` matters immediately after the first publication. Without it,
npm can reuse a cached pre-publication `E404` even though the registry already
contains the package.

## Clean-machine verification

```bash
tmp="$(mktemp -d)"
cd "$tmp"
npm init -y --cache "$TMPDIR/npm-cache"
npm install @snabbsajt/site-kit@$VERSION @snabbsajt/cli@$VERSION --cache "$TMPDIR/npm-cache"
npx @snabbsajt/cli@$VERSION site doctor --json
npx @snabbsajt/cli@$VERSION site init ./example --template html
npx @snabbsajt/cli@$VERSION site validate ./example
npx @snabbsajt/cli@$VERSION skills install --agent codex
npx @snabbsajt/cli@$VERSION skills doctor --agent codex
```

Only after that passes, create and push the matching Git tag and GitHub release:

```bash
git tag -a "v$VERSION" -m "SnabbSajt Site Kit and CLI $VERSION"
git push origin "v$VERSION"
gh release create "v$VERSION" release-assets/*.zip release-assets/SHA256SUMS.txt \
  --title "SnabbSajt Site Kit and CLI $VERSION" --generate-notes
```

Do not reuse or move an existing tag. npm versions are immutable; a broken
release is fixed with a new patch version, never by overwriting one already on npm.
