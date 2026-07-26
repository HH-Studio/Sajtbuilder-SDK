# Schema reference

Site Kit uses one strict JSON envelope: `PortableSiteV1`. Unknown fields are
rejected. Fields marked `?` are optional; every other field is required.

## Top-level object

| Field | Type | Meaning |
| --- | --- | --- |
| `format` | `"sajt-site"` | Format discriminator. |
| `version` | `1` | Schema version. |
| `exportedAt` | ISO date string | Package creation time. |
| `site` | `Site` | Business, locale, theme, contact, and site-wide settings. |
| `fontsAssignment?` | `{ headingTmpId?: string; bodyTmpId?: string }` | References entries in `fonts`. |
| `services?` | `Service[]` | Canonical services referenced by service sections. |
| `folders` | `Folder[]` | Optional page hierarchy. Use `[]` when unused. |
| `contentCollections?` | `ContentCollection[]` | Blog or news collections. |
| `pages` | `Page[]` | Pages and posts. |
| `redirects?` | `{ fromPath: string; toPath: string }[]` | SEO-safe old-URL mappings. Validated against the page graph after pages exist. |
| `sections` | `Section[]` | Ordered, typed content sections. |
| `fonts` | `Font[]` | Google, Adobe, or bundled custom fonts. |
| `assets` | `Asset[]` | Bundled image/logo/favicon/OG/video/document declarations. |

## Site

`site` requires `businessName`, `vertical`, `goal`, `language`, `theme`, and
`contact`. It may also contain `languages`, `socials`, `tracking`,
`bookingConfig`, `logoAssetId`, `faviconAssetId`, and `ogImageAssetId`.

- `contact`: `{ phone?: string; email?: string; address?: Address }`
- `languages`: supported locale codes, primary locale first
- asset ID fields: an `assets[].exportId`, never a Convex/database ID
- `theme`: use `DEFAULT_THEME` or a valid `ThemeTokens` object
- runtime enums and nested settings are available through `portableSiteV1`

### Theme tokens

`palette`, `fontPair`, `density`, `radius`, `buttonStyle` are required;
`appearance` and `typeScale` are optional. Those are the values the owner picks
between in the editor.

Three optional fields let a developer carry a brand verbatim instead of snapping
to the nearest built-in: `customPalette` (`{ light: SurfaceTokens, dark:
SurfaceTokens }`, 13 raw CSS colours per mode), `customFonts`
(`{ heading, body }`), and `customBrandHex`. Set `palette`/`fontPair` to the
closest built-in anyway — they are the fallback if the owner clears the custom
look. Custom palettes skip the authored-contrast gate, so check your own pairs.
See [package format](package-format.md#theme) for the surface token list.

## Pages, folders, and collections

```ts
type Folder = {
  tmpId: string;
  name: string;
  order: number;
  parentTmpId?: string;
  collapsed?: boolean;
};

type ContentCollection = {
  tmpId: string;
  kind: "blog" | "news";
  name: string;
  slugPrefix: string;
  order: number;
};

type Page = {
  tmpId: string;
  slug: string;             // "" is the home page
  title: string;
  order: number;
  externalKey?: string;     // your stable key; a merge import matches on it
  folderTmpId?: string;
  showInNav: boolean;
  pageType?: "page" | "post";
  collectionTmpId?: string;
  excerpt?: string;
  author?: string;
  featuredImage?: AssetRef;
  firstPublishedAt?: number;
  contentType?: string;
  plannedFor?: number;
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
    noindex?: boolean;
    canonical?: string;
    sourceUrl?: string;
  };
};
```

Every `tmpId` is local to the package. References must resolve inside the same
package. Sibling page slugs must be unique.

## Sections

```ts
type Section = {
  pageTmpId: string;
  type: SectionType;
  variant: string;
  tone?: "light" | "clear" | "dark";
  layout?: unknown;
  order?: string;           // omit it; the importer orders by array position
  externalKey?: string;     // your stable key; a merge import matches on it
  hidden?: boolean;
  anchorId?: string;
  content: PortableSectionContent;
};
```

`content.type` must equal the outer `type`. Use
`SECTION_REGISTRY[type].variants` for valid variant names and
`SECTION_REGISTRY[type].defaultContent` as a complete starter. In the catalogue
below, fields before `?` are required. Nested item fields are shown in braces.
Leave `order` out of a hand-authored package. The importer derives keys from
array position, which is what you want. A key you do supply is preserved
verbatim and must use the `fractional-indexing` grammar — validation rejects
lookalikes such as `a000`.

| Type | Content fields after `type` |
| --- | --- |
| `hero` | `headline`; `eyebrow?`, `subheadline?`, `media?`, `primaryCta?`, `secondaryCta?` |
| `services` | `heading`, `items[{ title, description, priceText?, icon?, media?, cta?, serviceId? }]`; `intro?`, `source?`, `footerCta?` |
| `service-detail` | `title`, `body`; `bullets?`, `media?`, `cta?` |
| `about` | `heading`, `body`; `media?`, `signatureName?` |
| `team` | `heading`, `members[{ name, role?, photo?, bio? }]`; `intro?`, `footerHeading?`, `footerDescription?`, `footerCta?` |
| `testimonials` | `quotes[{ text, author, role?, rating?, avatar? }]`; `heading?` |
| `gallery` | `images[AssetRef]`; `heading?` |
| `before-after` | `pairs[{ before, after, label? }]`; `heading?` |
| `pricing` | `heading`, `currency`, `tiers[{ name, price, features, period?, cta?, highlighted? }]`; `intro?` |
| `faq` | `items[{ question, answer }]`; `heading?`, `footerHeading?`, `footerDescription?`, `footerCta?` |
| `process` | `heading`, `steps[{ title, description, icon? }]` |
| `service-areas` | `heading`, `areas[string]`; `intro?` |
| `contact` | `heading`, `fields[FormField]`, `submitLabel`, `successMessage`; `intro?`, `showMap?`, `address?`, `infoItems?` |
| `opening-hours` | `days[OpeningDay]`; `heading?`, `note?` |
| `location` | `address`; `heading?`, `zoom?` |
| `certifications` | `items[{ label, logo? }]`; `heading?` |
| `social-proof` | `stats[{ value, label }]`; `heading?` |
| `instagram` | `images[AssetRef]`; `heading?`, `handle?` |
| `cta-band` | `headline`, `primaryCta`; `subtext?`, `secondaryCta?` |
| `booking` | `heading?`, `intro?`, `cta?`, `source?` |
| `lead-form` | `heading`, `fields[FormField]`, `submitLabel`, `successMessage`; `intro?` |
| `quote-flow` | `heading`, `steps[QuoteStep]`, `pricing`, `successMessage`, `submitLabel`; pricing and helper fields are optional |
| `footer` | `businessName`; `tagline?`, `contactLine?`, `columns?`, `legalText?` |
| `legal` | `heading`, `blocks[{ kind: "h" | "p", text }]` |
| `logos` | `items[{ label, logo? }]`; `heading?`, `intro?` |
| `highlights` | `heading`, `items[{ title, description, icon?, media? }]`; `intro?` |
| `bento` | `cells[{ title, description?, media?, span? }]`; `heading?`, `intro?` |
| `banner` | `text`; `cta?` |
| `video` | `provider: "youtube" | "vimeo"`; `heading?`, `caption?`, `videoId?` |
| `comparison` | `columns[{ label, highlighted? }]`, `rows[{ label, cells }]`; `heading?`, `intro?` |
| `newsletter` | `heading`, `placeholder`, `submitLabel`, `successMessage`; `intro?`, `consentText?` |
| `statement` | `text`; `attribution?`, `cta?` |
| `rich-text` | `blocks[h | p | ul]`; `heading?` |
| `image` | `image?`, `caption?` |
| `featured-product` | `heading?`, `intro?`, `siteSlug?`, `products?` |
| `product-grid` | `heading?`, `intro?`, `siteSlug?`, `products?` |

For TypeScript, import `PortableSectionContent`, `SiteKitSection`,
`SECTION_TYPES`, and `sectionContent`. The exported validator is the exact
runtime source of truth for nested fields.

## Shared content shapes

```ts
type AssetRef = {
  assetId: string;          // assets[].exportId
  alt: string;
  focalX?: number;          // 0..1
  focalY?: number;          // 0..1
};

type CtaRef = {
  label: string;
  target:
    | { kind: "page"; pageSlug: string }
    | { kind: "anchor"; anchorId: string }
    | { kind: "phone"; value: string }
    | { kind: "email"; value: string }
    | { kind: "external"; url: string }
    | { kind: "booking" };
  style?: "primary" | "secondary" | "ghost";
};

type Address = {
  street?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  lat?: number;
  lng?: number;
};
```

`FormField`, `OpeningDay`, booking sources, quote steps, icon keys, and theme
tokens are strongly typed by the package exports. Start from registry defaults
instead of hand-authoring those larger nested structures.

## Services

Each service requires `tmpId`, `name`, `bookable`, and `order`. Optional fields
are `description`, pricing fields, `durationMin`, `category`, action/payment
settings, `cancellationPolicy`, `confirmationMessage`, `intake`, `availability`,
`timezone`, scheduling limits, `hidden`, and `archived`. Section `serviceId` and
`serviceIds` values reference this `tmpId` as a plain string.

## Assets and fonts

```ts
type Asset = {
  exportId: string;
  url: string;              // bundle://<exportId> for bundled files
  width: number;
  height: number;
  blurhash?: string;
  mimeType: string;
  kind: "image" | "logo" | "favicon" | "og" | "video" | "document";
  durationSec?: number;     // kind:"video" only, best-effort
  alt?: string;
};

type Font = {
  tmpId: string;
  source: "upload" | "google" | "adobe";
  family: string;
  googleUrl?: string;
  adobeKitId?: string;
  files?: Array<{
    url: string;
    weight: number;
    style: "normal" | "italic";
    format: string;
  }>;
};
```

The CLI matches each bundled asset/font declaration to exactly one file by its
ID and extension. Run `snabbsajt site validate` before packing; never rely on types
alone for parsed JSON.

Self-hosted video is supported. Declare the clip as a `kind: "video"` asset and
point at it from a `video` section with `provider: "upload"`, or from a hero's
`bgVideo`. The validator rejects `provider: "upload"` without a clip, and a clip
on a YouTube/Vimeo section, so a package cannot import as a player with nothing
to play. The importer re-checks the bytes and enforces the target workspace's
per-plan video and storage caps; an oversized clip is skipped, not fatal.

Fonts carry an optional `license` (`"licensed"` or `"trial"`). A trial face keeps
working in the draft but blocks publishing until a licensed file replaces it.
