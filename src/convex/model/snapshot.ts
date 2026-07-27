import { v, type Infer } from "convex/values";
import { themeTokens } from "./theme";
import { resolvedSiteFonts } from "./fonts";
import { sectionContent, sectionTypeLiteral, sectionLayoutValidator } from "./sections";
import {
  address,
  assetRef,
  ctaTarget,
  sectionMotionValidator,
  sectionToneValidator,
  socialsValidator,
} from "./content";
import { CONTENT_TYPES } from "../../lib/content/contentTypes";
import { localeValidator } from "./business";
import { trackingConfig } from "./tracking";

// ---------------------------------------------------------------------------
// The PUBLISHED SNAPSHOT — mirrored from the app's convex/model/snapshot.ts.
//
// This is what `GET /v1/sites/<siteId>/published` returns, and therefore what
// a headless site actually renders. It is a single denormalized, immutable
// document capturing the whole renderable site at publish time: every asset
// reference is already resolved to a URL with dimensions, so a renderer needs
// no second request and no database of its own.
//
// Not to be confused with `PortableSiteV1` (./portable), which is the AUTHORING
// format — what you build and pack for import. Portable goes in, snapshot comes
// out. They deliberately differ: portable carries local asset paths and draft
// intent, a snapshot carries resolved URLs and nothing editable.
// ---------------------------------------------------------------------------

const contentTypeValidator = v.union(...CONTENT_TYPES.map((t) => v.literal(t)));

/** An asset resolved to a concrete URL + dimensions, keyed by assetId so the
 *  renderer can resolve an `assetRef` without a lookup of its own. */
export const resolvedAsset = v.object({
  url: v.string(),
  width: v.number(),
  height: v.number(),
  blurhash: v.optional(v.string()),
  // Stock-photo attribution. Present only for stock assets. Provider terms
  // require BOTH the photo page (`url`) and the photographer profile to be
  // linked, so a renderer that shows the credit must link both when they are
  // present, and degrade to an unlinked name when `photographerUrl` is absent
  // (snapshots published before 2026-07-25 carry none).
  credit: v.optional(
    v.object({
      name: v.optional(v.string()),
      url: v.optional(v.string()),
      photographerUrl: v.optional(v.string()),
      providerName: v.optional(v.string()),
    }),
  ),
});
export type ResolvedAsset = Infer<typeof resolvedAsset>;

export const snapshotSection = v.object({
  type: sectionTypeLiteral,
  variant: v.string(),
  tone: v.optional(sectionToneValidator),
  motion: v.optional(sectionMotionValidator),
  layout: v.optional(sectionLayoutValidator),
  anchorId: v.optional(v.string()),
  content: sectionContent,
});
export type SnapshotSection = Infer<typeof snapshotSection>;

export const snapshotPage = v.object({
  sourcePageId: v.optional(v.id("pages")),
  slug: v.string(), // "" for the home page
  title: v.string(),
  order: v.number(),
  showInNav: v.boolean(),
  // Absent => "page". A "post" renders under /news/<slug>, is listed on /news,
  // and is excluded from top-level routing and the nav.
  pageType: v.optional(v.union(v.literal("page"), v.literal("post"))),
  excerpt: v.optional(v.string()),
  author: v.optional(v.string()),
  featuredImage: v.optional(assetRef),
  publishedAt: v.optional(v.number()),
  contentType: v.optional(contentTypeValidator),
  plannedFor: v.optional(v.number()),
  seo: v.object({
    metaTitle: v.string(),
    metaDescription: v.string(),
    noindex: v.optional(v.boolean()),
    canonical: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
  }),
  sections: v.array(snapshotSection),
});
export type SnapshotPage = Infer<typeof snapshotPage>;

export const siteSnapshot = v.object({
  businessName: v.string(),
  logoUrl: v.optional(v.string()),
  logoMimeType: v.optional(v.string()),
  faviconUrl: v.optional(v.string()),
  language: localeValidator,
  // Every published language (primary first), so a renderer can offer a
  // language switcher and emit hreflang without a second request. Absent =>
  // single-language.
  languages: v.optional(v.array(localeValidator)),
  theme: themeTokens,
  customFonts: v.optional(resolvedSiteFonts),
  contact: v.object({
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(address),
  }),
  socials: v.optional(socialsValidator),
  tracking: v.optional(trackingConfig),
  vertical: v.string(),
  seo: v.object({
    titleTemplate: v.string(), // "{page} | {business}"
    defaultDescription: v.string(),
    ogImageUrl: v.optional(v.string()),
  }),
  pages: v.array(snapshotPage),
  // Header menu, already ordered. Prefer `target` (it carries owner-added
  // external / phone / email / booking links) and fall back to a page link on
  // `pageSlug`, which is all that older snapshots carry.
  nav: v.array(
    v.object({
      label: v.string(),
      pageSlug: v.string(),
      target: v.optional(ctaTarget),
    }),
  ),
  // assetId -> resolved url/dims for every assetRef referenced in `pages`.
  resolvedAssets: v.record(v.string(), resolvedAsset),
  // Old-URL redirects materialised at publish. A headless renderer that wants
  // to keep indexed URLs alive should serve a 308 for a matched `from` before
  // it 404s — SnabbSajt-hosted sites already do.
  redirects: v.optional(
    v.array(v.object({ from: v.string(), to: v.string() })),
  ),
  // Configuration for SnabbSajt's own public AI receptionist widget. Left
  // opaque here on purpose: it drives a first-party widget a headless renderer
  // does not host, so mirroring its full shape would create a maintenance
  // dependency for a field nobody outside our own renderer reads.
  visitorAssistant: v.optional(v.any()),
});
export type SiteSnapshot = Infer<typeof siteSnapshot>;
