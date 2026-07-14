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
| `sections` | `Section[]` | Ordered, typed content sections. |
| `fonts` | `Font[]` | Google, Adobe, or bundled custom fonts. |
| `assets` | `Asset[]` | Bundled image/logo/favicon/OG declarations. |

## Site

`site` requires `businessName`, `vertical`, `goal`, `language`, `theme`, and
`contact`. It may also contain `languages`, `socials`, `tracking`,
`bookingConfig`, `logoAssetId`, `faviconAssetId`, and `ogImageAssetId`.

- `contact`: `{ phone?: string; email?: string; address?: Address }`
- `languages`: supported locale codes, primary locale first
- asset ID fields: an `assets[].exportId`, never a Convex/database ID
- `theme`: use `DEFAULT_THEME` or a valid `ThemeTokens` object
- runtime enums and nested settings are available through `portableSiteV1`

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
  order: string;
  hidden?: boolean;
  anchorId?: string;
  content: PortableSectionContent;
};
```

`content.type` must equal the outer `type`. Use
`SECTION_REGISTRY[type].variants` for valid variant names and
`SECTION_REGISTRY[type].defaultContent` as a complete starter. In the catalogue
below, fields before `?` are required. Nested item fields are shown in braces.
Section `order` values must use the `fractional-indexing` key grammar; use `a0`,
`a1`, `a2` for simple hand-authored packages and let Site Kit validation catch
invalid keys before import.

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
  kind: "image" | "logo" | "favicon" | "og";
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
ID and extension. Run `site-kit validate` before packing; never rely on types
alone for parsed JSON.

Self-hosted video is intentionally unsupported in Site Kit v0.1 because the
production portable importer only preserves image assets. Use a YouTube or
Vimeo video section. The validator rejects `hero.bgVideo`, `provider: "upload"`,
and video-file references instead of creating a package that imports partially.
