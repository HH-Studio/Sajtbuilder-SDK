# API reference

Import public APIs from `@snabbsajt/site-kit`.

## Authoring helpers

### `defineSite(site)`

Accepts a `SiteDefinition` and returns it unchanged. TypeScript ties every
section's outer `type` to the matching discriminated `content.type` and checks
the known fields of object literals. Runtime validation still remains required
for parsed JSON and dynamically assembled objects.

### `defineSection(section)`

Accepts one `TypedSiteKitSection` and returns it unchanged. Use it for reusable
section constants before composing a complete site.

### `createStarterSite(template?)`

Returns a valid one-page `PortableSiteV1` starter. `template` is `"nextjs"` or
`"html"` and defaults to `"nextjs"`. It only changes guidance copy; both source
workflows produce the same package format.

## Validation

### `validateSitePackage(payload, options?)`

Validates unknown input and returns:

```ts
type SiteKitReport = {
  ok: boolean;
  issues: Array<{
    level: "error" | "warning";
    path: string;
    message: string;
  }>;
};
```

Options can provide `assetFileNames` and `fontFileNames` as read-only sets. If
present, validation requires exactly one matching blob for every declaration.

Validation covers the strict v1 envelope, caps, ids, slugs, cross-references,
section content, type/content agreement, variants, asset references, and file
names. It also rejects self-hosted video, which portable import cannot preserve
in v0.1. Image byte safety and workspace limits are enforced later by SnabbSajt.

## Packing

### `packSitePackage(input)`

Validates and packs a self-contained import bundle.

```ts
type PackInput = {
  site: PortableSiteV1;
  assetFiles: Record<string, Uint8Array>;
  fontFiles?: Record<string, Uint8Array>;
  exportedAt?: string;
};
```

It resolves with `{ zip, manifest, missing }`. The public safe packer rejects an
invalid package or missing declared blobs, so `missing` is normally empty and is
kept only for format compatibility. It throws when validation fails, duplicate
blob candidates exist, or the total bundle exceeds the cap.

## Schema and registry exports

- `PortableSiteV1`, `PortableAsset`, `PortableFont`
- `SiteDefinition`, `TypedSiteKitSection`, `SectionContent`, `SectionType`
- `PortableSectionContent`, `SiteKitSection`, `PortableValue`, `ContentOf`
- `portableSiteV1`, `PORTABLE_FORMAT`, `PORTABLE_VERSION`
- `sectionContent`, `SECTION_TYPES`
- `SECTION_REGISTRY`, `isValidVariant`
- `DEFAULT_THEME`, `ThemeTokens`
- `PORTABLE_CAPS`, `checkCaps`

`SECTION_REGISTRY[type]` exposes labels, usage guidance, variant keys, default
variant/tone, allowed tones, and default content. It is the reference for the
current built-in section catalogue.

See the [schema reference](schema-reference.md) for every package field and the
complete section content catalogue.

## Important type boundary

TypeScript checks authored object literals. It cannot make parsed JSON safe.
Always call `validateSitePackage()` on data from a file, network, model, or
untyped build step before using or packing it.
