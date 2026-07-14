# Publishing the npm packages

Publish `@snabbsajt/site-kit` first. The CLI has an exact dependency on the
same Site Kit version, so reversing the order creates a broken install window.

## One-time npm setup

1. Sign in at <https://www.npmjs.com/> and create or join the `snabbsajt`
   organization. The account must be allowed to publish public scoped packages.
2. Enable two-factor authentication for writes.
3. From this repository, authenticate with the same account:

   ```bash
   npm login --cache "$TMPDIR/npm-cache"
   npm whoami --cache "$TMPDIR/npm-cache"
   ```

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
bun run check
bun run release:assets
npm pack --dry-run --json --cache "$TMPDIR/npm-cache"
npm pack --dry-run --json --workspace packages/cli --cache "$TMPDIR/npm-cache"
```

Confirm both manifests say `0.2.0`, the CLI dependency is exactly
`@snabbsajt/site-kit: 0.2.0`, and neither tarball contains fixtures, source
credentials, customer data, or local configuration.

## 1. Publish Site Kit

The publishable Site Kit package is the repository root. Do not publish the
private `packages/site-kit` workspace link.

```bash
npm publish --access public --cache "$TMPDIR/npm-cache"
npm view @snabbsajt/site-kit@0.2.0 version dist.integrity --json --cache "$TMPDIR/npm-cache"
```

Stop if the registry verification does not return `0.2.0` and an integrity
hash. Do not publish the CLI against a missing dependency.

## 2. Publish the CLI

```bash
npm publish --workspace packages/cli --access public --cache "$TMPDIR/npm-cache"
npm view @snabbsajt/cli@0.2.0 version dependencies bin dist.integrity --json --cache "$TMPDIR/npm-cache"
```

The response must show the `snabbsajt` binary and the exact Site Kit `0.2.0`
dependency.

## Clean-machine verification

```bash
tmp="$(mktemp -d)"
cd "$tmp"
npm init -y --cache "$TMPDIR/npm-cache"
npm install @snabbsajt/site-kit@0.2.0 @snabbsajt/cli@0.2.0 --cache "$TMPDIR/npm-cache"
npx @snabbsajt/cli@0.2.0 site doctor --json
npx @snabbsajt/cli@0.2.0 site init ./example --template html
npx @snabbsajt/cli@0.2.0 site validate ./example
npx @snabbsajt/cli@0.2.0 skills install --agent codex
npx @snabbsajt/cli@0.2.0 skills doctor --agent codex
```

Only after that passes, create and push the matching Git tag and GitHub release:

```bash
git tag -a v0.2.0 -m "SnabbSajt Site Kit and CLI 0.2.0"
git push origin v0.2.0
gh release create v0.2.0 release-assets/*.zip release-assets/SHA256SUMS.txt \
  --title "SnabbSajt Site Kit and CLI 0.2.0" --generate-notes
```

Do not reuse or move an existing tag. npm versions are immutable; a broken
release is fixed with a new patch version, never by overwriting `0.2.0`.
