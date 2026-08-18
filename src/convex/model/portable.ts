import { v, type Infer } from "convex/values";
import { themeTokens } from "./theme";
import {
  sectionTypeLiteral,
  sectionLayoutValidator,
  sectionOptionsValidator,
} from "./sections";
import { sectionStyleOverrides } from "./slotStyle";
import {
  address,
  careersIndexConfigValidator,
  navLink,
  newsIndexConfigValidator,
  sectionMotionValidator,
  sectionToneValidator,
  socialsValidator,
} from "./content";
import { trackingConfig } from "./tracking";
import {
  bookingConfigValidator,
  formField,
  openingDay,
  paymentModeValidator,
  priceModelValidator,
  serviceActionKind,
} from "./content";
import { fontSource, fontStyle, fontLicense } from "./fonts";
import { verticalValidator, goalValidator, siteLocaleValidator } from "./business";
import { trustMarksValidator } from "./trustMarks";
import { CONTENT_TYPES } from "../../lib/content/contentTypes";
import { navMegaMenu } from "./navigation";
import {
  jobOpeningDraftFieldsValidator,
  localizedJobOpeningFieldsValidator,
} from "./jobOpening";

const contentTypeValidator = v.union(...CONTENT_TYPES.map((t) => v.literal(t)));

// ---------------------------------------------------------------------------
// Portable site format (v1) - the lossless, re-importable backup file produced
// by `portability.exportSite` and consumed by `portability.importSite`.
//
// Design notes:
//  - NO `v.id(...)` fields anywhere. Cross-deployment/account import would fail
//    if foreign Convex ids were validated as local ids. Instead every cross-row
//    reference is an export-local `tmpId` string (pages/folders/fonts) and image
//    references inside `content` stay as their original id strings, remapped to
//    fresh local ids on import.
//  - `sections[].content` is `v.any()` here ON PURPOSE: it is validated
//    authoritatively by the Convex schema on `db.insert` (after asset-id remap),
//    so the discriminated-union / no-raw-HTML invariant is preserved and any
//    malformed content rolls the whole import back. Validating it at this
//    boundary would re-introduce the foreign-`v.id` problem above.
//  - `format` + `version` are literals so an unknown/incompatible file is
//    rejected at the function boundary with a clear validation error.
// ---------------------------------------------------------------------------

export const PORTABLE_FORMAT = "sajt-site" as const;
export const PORTABLE_VERSION = 1 as const;

const portableSeo = v.optional(
  v.object({
    metaTitle: v.optional(v.string()),
    metaDescription: v.optional(v.string()),
    noindex: v.optional(v.boolean()),
    canonical: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
  }),
);

const portableAssetKind = v.union(
  v.literal("image"),
  v.literal("logo"),
  v.literal("favicon"),
  // Custom Open Graph / social-share image. Carried like logo/favicon so a
  // backup / move / duplicate keeps the site's own share card instead of
  // silently falling back to the auto-generated one on import.
  v.literal("og"),
  // Self-hosted video (video section upload / hero bgVideo). Carried so a
  // backup/move/import keeps the clip instead of silently dropping the ref.
  // Import re-validates bytes (magic-byte sniff) and enforces the target
  // workspace's per-plan video + storage caps - an oversized clip is skipped,
  // never a hard failure.
  v.literal("video"),
  // Downloadable PDF (documents section, backlog 0817). Import sniffs the
  // %PDF- magic bytes; same per-asset byte ceiling as images.
  v.literal("document"),
);

/** Canonical service data carried separately from section projections. The
 * optional field keeps existing V1 backups importable while new exports retain
 * service and booking configuration. */
const portableService = v.object({
  tmpId: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  priceAmount: v.optional(v.number()),
  priceCurrency: v.optional(v.string()),
  priceModel: v.optional(priceModelValidator),
  priceText: v.optional(v.string()),
  durationMin: v.optional(v.number()),
  category: v.optional(v.string()),
  bookable: v.boolean(),
  primaryAction: v.optional(serviceActionKind),
  paymentMode: v.optional(paymentModeValidator),
  depositAmount: v.optional(v.number()),
  cancellationPolicy: v.optional(v.string()),
  confirmationMessage: v.optional(v.string()),
  intake: v.optional(v.array(formField)),
  availability: v.optional(v.array(openingDay)),
  timezone: v.optional(v.string()),
  leadTimeHours: v.optional(v.number()),
  windowDays: v.optional(v.number()),
  bufferMin: v.optional(v.number()),
  order: v.number(),
  hidden: v.optional(v.boolean()),
  archived: v.optional(v.boolean()),
});

export const portableSiteV1 = v.object({
  format: v.literal(PORTABLE_FORMAT),
  version: v.literal(PORTABLE_VERSION),
  exportedAt: v.string(),

  site: v.object({
    businessName: v.string(),
    vertical: verticalValidator,
    goal: goalValidator,
    language: siteLocaleValidator, // primary language
    // Full published-languages set, primary first (websites.languages).
    // Absent/[] carries the same "single-language ([language])" meaning as
    // the live schema. Without this, an export/import round-trip or
    // duplicate of a multilingual site silently downgraded it to
    // single-language (no switcher/hreflang) with no settings UI to restore
    // the list afterward.
    languages: v.optional(v.array(siteLocaleValidator)),
    // Route-level `/news` presentation. Optional keeps every pre-layout V1
    // bundle valid and imports it as the existing media grid.
    newsIndex: v.optional(newsIndexConfigValidator),
    // Structural `/careers` presentation. Optional keeps older V1 bundles
    // valid and imports them with the established cards layout.
    careersIndex: v.optional(careersIndexConfigValidator),
    theme: themeTokens,
    /** Where this bundle was authored FROM, when there is a live page to point
     *  at. Optional and additive: a bundle without it imports exactly as it
     *  does today.
     *
     *  With it, the importer renders that page and lays the measurement
     *  UNDERNEATH `theme` — everything the developer stated wins, the
     *  measurement only fills gaps (`lib/import/measuredTheme.ts`). Without it,
     *  the bundle lane was the one import that never measured anything, so a
     *  developer who did not hand-write a `customPalette` got our preset while
     *  pasting the same page's URL into the import box got the page's real
     *  colours. The better path produced the worse result. */
    provenance: v.optional(
      v.object({
        sourceUrl: v.optional(v.string()),
      }),
    ),
    contact: v.object({
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
      address: v.optional(address),
    }),
    socials: v.optional(socialsValidator),
    /** The two website-level facts the discovery work added, and both are
     *  EVIDENCE rather than presentation, which is why they travel.
     *
     *  `trustMarks` is what the owner ticked about their own firm, and it is the
     *  only thing that makes a guarantee or credentials claim sayable
     *  (`generation/honesty.ts`). `serviceAreas` is the towns they travel to,
     *  and it feeds `areaServed` in the published LocalBusiness markup plus the
     *  town pages an owner can ask for.
     *
     *  Without them here, a backup or a duplicate carried sections that still
     *  displayed the badges and listed the towns while the website row knew
     *  neither: the prepublish check reported the marks missing, town-page
     *  management had no candidates, and the next snapshot emitted no
     *  `areaServed`. Optional and additive, so every V1 bundle written before
     *  this imports exactly as it did. */
    trustMarks: v.optional(trustMarksValidator),
    serviceAreas: v.optional(v.array(v.string())),
    // The header menu the owner built on top of the page list: extra links
    // that are not pages (`navLinks`) and the order both kinds sit in
    // (`navOrder`). Without these a round-trip — and every import of a site
    // whose real menu is anchors into one long page — came back with a menu
    // derived purely from `showInNav` pages, which is not the menu the source
    // site had. `navOrder`'s page keys are exported as `page:<page tmpId>`
    // (not a foreign Convex id) and remapped on import, like every other
    // cross-row reference in this file.
    navLinks: v.optional(v.array(navLink)),
    navOrder: v.optional(v.array(v.string())),
    navCta: v.optional(
      v.union(
        v.literal("off"),
        v.object({
          label: v.string(),
          target: v.union(
            v.object({ kind: v.literal("page"), pageSlug: v.string() }),
            v.object({ kind: v.literal("phone"), value: v.string() }),
            v.object({ kind: v.literal("email"), value: v.string() }),
            v.object({ kind: v.literal("external"), url: v.string() }),
            v.object({ kind: v.literal("booking") }),
          ),
        }),
      ),
    ),
    navMegaMenu: v.optional(navMegaMenu),
    tracking: v.optional(trackingConfig),
    // Shared native-booking defaults. Optional so older V1 backups retain
    // their existing inline-booking behavior on import.
    bookingConfig: v.optional(bookingConfigValidator),
    // Export-local asset id strings (like content image refs), remapped to a
    // fresh local asset id on import. NOT a v.id() - see the file-level note.
    logoAssetId: v.optional(v.string()),
    faviconAssetId: v.optional(v.string()),
    // Custom OG/social-share image, same export-local-id remap as logo/favicon.
    ogImageAssetId: v.optional(v.string()),
  }),

  // custom-font heading/body/display assignment, by font tmpId
  fontsAssignment: v.optional(
    v.object({
      headingTmpId: v.optional(v.string()),
      bodyTmpId: v.optional(v.string()),
      // Third role (hero headline / pull-quote). Absent on every bundle
      // exported before it existed, and on every two-font site.
      displayTmpId: v.optional(v.string()),
    }),
  ),

  // Canonical services are independent from the section cards that project
  // them. `tmpId` lets section `serviceId`/`serviceIds` references be remapped
  // to fresh local ids during import.
  services: v.optional(v.array(portableService)),

  folders: v.array(
    v.object({
      tmpId: v.string(),
      name: v.string(),
      order: v.number(),
      parentTmpId: v.optional(v.string()),
      collapsed: v.optional(v.boolean()),
    }),
  ),

  // Blog/News collections a post page can belong to. Export-local tmpId, like
  // folders/fonts - remapped to a fresh id on import so a post page's
  // `collectionTmpId` below can be resolved to the newly-created row instead
  // of silently losing its collection membership (a duplicated/re-imported
  // site's posts becoming invisible in the Pages panel, which hides posts
  // with no collectionId).
  contentCollections: v.optional(
    v.array(
      v.object({
        tmpId: v.string(),
        kind: v.union(v.literal("blog"), v.literal("news")),
        name: v.string(),
        slugPrefix: v.string(),
        order: v.number(),
      }),
    ),
  ),

  pages: v.array(
    v.object({
      tmpId: v.string(),
      // Incremental import: the author's stable key for this page (e.g.
      // "home", "business"). Written to pages.externalKey on import; merge
      // imports match on it. Optional - a create import works without it.
      externalKey: v.optional(v.string()),
      slug: v.string(),
      title: v.string(),
      order: v.number(),
      folderTmpId: v.optional(v.string()),
      showInNav: v.boolean(),
      // The town a generated town page was written for. Carried so a duplicated
      // or re-imported site keeps the marker: without it the town-page card
      // offers the same towns again and writes duplicates beside the pages that
      // came across.
      sourceTown: v.optional(v.string()),
      // Menu text when it differs from the page's own title (websites' menu
      // editor writes this). Part of the same menu-fidelity set as the site's
      // `navLinks`/`navOrder` above.
      navLabel: v.optional(v.string()),
      // News/blog post fields. `featuredImage.assetId` is the export-local asset
      // id string (like content image refs), remapped to a fresh id on import -
      // never a `v.id` (would break cross-deployment import).
      pageType: v.optional(
        v.union(v.literal("page"), v.literal("post"), v.literal("job")),
      ),
      job: v.optional(jobOpeningDraftFieldsValidator),
      // Which contentCollections entry (by tmpId, above) this post belongs to.
      // Undefined = not in any collection, same meaning as the live schema.
      collectionTmpId: v.optional(v.string()),
      excerpt: v.optional(v.string()),
      author: v.optional(v.string()),
      featuredImage: v.optional(
        v.object({
          assetId: v.string(),
          alt: v.string(),
          focalX: v.optional(v.number()),
          focalY: v.optional(v.number()),
        }),
      ),
      firstPublishedAt: v.optional(v.number()),
      contentType: v.optional(contentTypeValidator),
      plannedFor: v.optional(v.number()),
      // Draft/held pages must survive agency migrations without becoming live
      // on the customer's first "publish all" operation.
      excludeFromPublish: v.optional(v.boolean()),
      // Which town this page was written for, when the owner asked for one page
      // per town they work in. Carried because the marker is what stops the
      // town-page card offering to write a page the copy already has: without
      // it, a duplicated or imported site reports every town as pending and a
      // second page about the same town can be generated over the first.
      sourceTown: v.optional(v.string()),
      seo: portableSeo,
    }),
  ),

  // SEO-safe old URL mappings. Optional keeps every pre-redirect V1 bundle
  // valid; the importer validates the complete graph after pages exist.
  redirects: v.optional(
    v.array(
      v.object({
        fromPath: v.string(),
        toPath: v.string(),
      }),
    ),
  ),

  sections: v.array(
    v.object({
      // Stable export-local identity used by authored locale payloads. Optional
      // keeps every older V1 bundle valid; a localization may only target a
      // section that declares it.
      tmpId: v.optional(v.string()),
      pageTmpId: v.string(),
      // Incremental import: stable per-section key, unique within the bundle
      // (e.g. "home/hero"). Required for a section to be UPDATABLE by a later
      // merge import; without it a merge treats the row as insert-only.
      externalKey: v.optional(v.string()),
      type: sectionTypeLiteral,
      variant: v.string(),
      tone: v.optional(sectionToneValidator),
      // Per-section scroll-motion override. Optional keeps every pre-motion V1
      // bundle valid; absent = inherit the site's theme.motion on import.
      motion: v.optional(sectionMotionValidator),
      layout: v.optional(sectionLayoutValidator),
      styleOverrides: v.optional(sectionStyleOverrides),
      // Bounded presentation axes on the layout. Optional keeps every older
      // bundle valid; import re-validates against the registry before storage.
      options: v.optional(sectionOptionsValidator),
      // Non-destructive optional-element visibility. Optional keeps older
      // bundles valid; import normalizes the bounded path list before storage.
      hiddenContentPaths: v.optional(v.array(v.string())),
      // Fractional-indexing key, preserved verbatim when present. OPTIONAL
      // (SDK feedback #4): hand-authoring these keys is a footgun — omit it
      // and the import assigns valid keys in array position.
      order: v.optional(v.string()),
      hidden: v.optional(v.boolean()),
      anchorId: v.optional(v.string()),
      content: v.any(), // validated on insert (see header note)
    }),
  ),

  // Authored secondary-language content. This is intentionally separate from
  // the ordinary draft: import stores it as a publish seed, then the first
  // publish materialises a complete localized snapshot. Structure stays
  // identical to the primary site; only page copy/slug and section content may
  // differ. Optional keeps pre-localization V1 bundles fully compatible.
  localizations: v.optional(
    v.array(
      v.object({
        locale: siteLocaleValidator,
        // Authored translation for site.newsIndex.intro. Layout is structural
        // and remains on `site.newsIndex`, never inside locale overlays.
        newsIndexIntro: v.optional(v.string()),
        pages: v.array(
          v.object({
            pageTmpId: v.string(),
            slug: v.string(),
            title: v.string(),
            navLabel: v.optional(v.string()),
            excerpt: v.optional(v.string()),
            author: v.optional(v.string()),
            job: v.optional(localizedJobOpeningFieldsValidator),
            seo: portableSeo,
          }),
        ),
        sections: v.array(
          v.object({
            sectionTmpId: v.string(),
            content: v.any(),
          }),
        ),
      }),
    ),
  ),

  fonts: v.array(
    v.object({
      tmpId: v.string(),
      source: fontSource,
      family: v.string(),
      googleUrl: v.optional(v.string()),
      adobeKitId: v.optional(v.string()),
      // upload only. "trial" (or a family/file name that looks like a trial
      // cut - auto-flagged on import) keeps working in the draft but blocks
      // publish until licensed files replace it.
      license: v.optional(fontLicense),
      files: v.optional(
        v.array(
          v.object({
            url: v.string(),
            weight: v.number(),
            style: fontStyle,
            format: v.string(),
          }),
        ),
      ),
    }),
  ),

  assets: v.array(
    v.object({
      exportId: v.string(),
      url: v.string(),
      width: v.number(),
      height: v.number(),
      blurhash: v.optional(v.string()),
      mimeType: v.string(),
      kind: portableAssetKind,
      alt: v.optional(v.string()),
      // kind:"video" only - best-effort declared duration (browsers can't
      // always read it; the server can't decode it). Gated per-plan on import.
      durationSec: v.optional(v.number()),
    }),
  ),
});

export type PortableSiteV1 = Infer<typeof portableSiteV1>;
export type PortableAsset = PortableSiteV1["assets"][number];
export type PortableFont = PortableSiteV1["fonts"][number];
