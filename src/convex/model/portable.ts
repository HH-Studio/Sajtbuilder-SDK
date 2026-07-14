import { v, type Infer } from "convex/values";
import { themeTokens } from "./theme";
import { sectionTypeLiteral, sectionLayoutValidator } from "./sections";
import { address, sectionToneValidator, socialsValidator } from "./content";
import { trackingConfig } from "./tracking";
import {
  bookingConfigValidator,
  formField,
  openingDay,
  paymentModeValidator,
  priceModelValidator,
  serviceActionKind,
} from "./content";
import { fontSource, fontStyle } from "./fonts";
import { verticalValidator, goalValidator, localeValidator } from "./business";
import { CONTENT_TYPES } from "../../lib/content/contentTypes";

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
    language: localeValidator, // primary language
    // Full published-languages set, primary first (websites.languages).
    // Absent/[] carries the same "single-language ([language])" meaning as
    // the live schema. Without this, an export/import round-trip or
    // duplicate of a multilingual site silently downgraded it to
    // single-language (no switcher/hreflang) with no settings UI to restore
    // the list afterward.
    languages: v.optional(v.array(localeValidator)),
    theme: themeTokens,
    contact: v.object({
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
      address: v.optional(address),
    }),
    socials: v.optional(socialsValidator),
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

  // custom-font heading/body assignment, by font tmpId
  fontsAssignment: v.optional(
    v.object({
      headingTmpId: v.optional(v.string()),
      bodyTmpId: v.optional(v.string()),
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
      slug: v.string(),
      title: v.string(),
      order: v.number(),
      folderTmpId: v.optional(v.string()),
      showInNav: v.boolean(),
      // News/blog post fields. `featuredImage.assetId` is the export-local asset
      // id string (like content image refs), remapped to a fresh id on import -
      // never a `v.id` (would break cross-deployment import).
      pageType: v.optional(v.union(v.literal("page"), v.literal("post"))),
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
      excludeFromPublish: v.optional(v.boolean()),
      seo: portableSeo,
    }),
  ),

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
      pageTmpId: v.string(),
      type: sectionTypeLiteral,
      variant: v.string(),
      tone: v.optional(sectionToneValidator),
      layout: v.optional(sectionLayoutValidator),
      order: v.string(), // LexoRank, preserved verbatim
      hidden: v.optional(v.boolean()),
      anchorId: v.optional(v.string()),
      content: v.any(), // validated on insert (see header note)
    }),
  ),

  fonts: v.array(
    v.object({
      tmpId: v.string(),
      source: fontSource,
      family: v.string(),
      googleUrl: v.optional(v.string()),
      adobeKitId: v.optional(v.string()),
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
    }),
  ),
});

export type PortableSiteV1 = Infer<typeof portableSiteV1>;
export type PortableAsset = PortableSiteV1["assets"][number];
export type PortableFont = PortableSiteV1["fonts"][number];
