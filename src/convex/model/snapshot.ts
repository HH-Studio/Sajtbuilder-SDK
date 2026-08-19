import { v, type Infer } from "convex/values";
import { themeTokens } from "./theme";
import { resolvedSiteFonts } from "./fonts";
import {
  sectionContent,
  sectionTypeLiteral,
  sectionLayoutValidator,
  sectionOptionsValidator,
} from "./sections";
import { sectionStyleOverrides } from "./slotStyle";
import {
  address,
  assetRef,
  careersIndexConfigValidator,
  ctaTarget,
  newsIndexConfigValidator,
  sectionMotionValidator,
  sectionToneValidator,
  socialsValidator,
} from "./content";
import { CONTENT_TYPES } from "../../lib/content/contentTypes";
import { siteLocaleValidator } from "./business";
import { publishedVisitorAssistantConfigValidator } from "./visitorAssistant";
import { jobOpeningFieldsValidator } from "./jobOpening";

const contentTypeValidator = v.union(...CONTENT_TYPES.map((t) => v.literal(t)));
import { trackingConfig } from "./tracking";
import { navMegaMenu } from "./navigation";

// ---------------------------------------------------------------------------
// The published snapshot: a single denormalized, immutable document capturing
// the whole renderable site at publish time. Asset references are pre-resolved
// to URLs + dimensions so the public route does ZERO asset lookups. Stored on
// `siteVersions.snapshot`; the public site reads exactly one of these.
// ---------------------------------------------------------------------------

/** An asset resolved to a concrete URL + dimensions, keyed by assetId in a
 *  per-section map so the renderer can resolve assetRefs without a DB read. */
export const resolvedAsset = v.object({
  url: v.string(),
  width: v.number(),
  height: v.number(),
  blurhash: v.optional(v.string()),
  // Stock-photo attribution (Unsplash), shown as a subtle credit on the public
  // site. Only set for source:"stock" assets; absent for uploads/AI.
  // `url` = the photo's page on the provider (the "Unsplash" link), and
  // `photographerUrl` = the photographer's profile - the provider's API terms
  // require BOTH to be linked. `photographerUrl` is optional and absent from
  // snapshots published before 2026-07-25; the renderer degrades to an unlinked
  // name in that case, and republishing fills it in.
  // `providerName` ("Unsplash"/"Pexels"/"Pixabay") is absent on snapshots
  // published before multi-provider support, which were all Unsplash.
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
  // Stable draft identity used to overlay an imported authored translation.
  // Stripped from public/headless delivery together with sourcePageId.
  sourceSectionId: v.optional(v.id("sections")),
  type: sectionTypeLiteral,
  variant: v.string(),
  tone: v.optional(sectionToneValidator),
  // Frozen at publish alongside tone/layout so a published site animates
  // exactly like the draft did. Absent = inherit the snapshot theme's motion.
  motion: v.optional(sectionMotionValidator),
  layout: v.optional(sectionLayoutValidator),
  styleOverrides: v.optional(sectionStyleOverrides),
  // Frozen at publish alongside layout/styleOverrides: the axes are part of how
  // the band looks, so a published site must render them exactly as the draft
  // did. Absent = the layout's own defaults, which is every older snapshot.
  options: v.optional(sectionOptionsValidator),
  hiddenContentPaths: v.optional(v.array(v.string())),
  anchorId: v.optional(v.string()),
  content: sectionContent,
});
export type SnapshotSection = Infer<typeof snapshotSection>;

export const snapshotPage = v.object({
  // Stable draft identity used only to safely reconcile carried translations.
  // Optional keeps snapshots published before this field backward-compatible;
  // pages without an identity are never carried into a newer version.
  sourcePageId: v.optional(v.id("pages")),
  slug: v.string(), // "" for home
  title: v.string(),
  order: v.number(),
  showInNav: v.boolean(),
  // Page kind, frozen at publish. Absent => "page" (back-compat with snapshots
  // written before news/blog existed). "post" pages render under /news/<slug>,
  // are listed on /news, and are excluded from top-level page routing + nav.
  pageType: v.optional(
    v.union(v.literal("page"), v.literal("post"), v.literal("job")),
  ),
  job: v.optional(jobOpeningFieldsValidator),
  // Post-only, frozen at publish: list/article summary, lead image (resolved via
  // resolvedAssets like any assetRef), and the stable publication date (sort +
  // JSON-LD datePublished).
  excerpt: v.optional(v.string()),
  author: v.optional(v.string()),
  featuredImage: v.optional(assetRef),
  publishedAt: v.optional(v.number()),
  contentType: v.optional(contentTypeValidator),
  // Owner's planned date (calendar). Carried through publish as inert data; no
  // publish logic reads it (Phase 2).
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
  // Brand logo, pre-resolved to a url at publish time. Absent => the header
  // falls back to the business-name wordmark.
  logoUrl: v.optional(v.string()),
  // The logo's content type, so the OG card can refuse to hand Satori an SVG
  // (backlog 0144). Optional: snapshots published before this field carry none.
  logoMimeType: v.optional(v.string()),
  // The logo's intrinsic pixel size, so the nav can reserve its width before
  // the image decodes. Without these the brand slot is 0px wide and then jumps
  // to the logo's natural width — a horizontal shift on every `left` and
  // `spread` nav layout, on every published site, on every cold load.
  //
  // They have to be REAL. The nav renders `h-8 w-auto`, so the browser derives
  // the reserved width from this ratio; an invented pair reserves the wrong box
  // and turns a 0→W growth into a |guess − W| shrink, which is worse for a
  // square icon logo. `assets` already stores both (convex/schema.ts), and
  // `resolveSnapshotBrandUrls` already reads that doc — it simply discarded
  // them until now.
  //
  // Optional because snapshots published before this field exist and must keep
  // rendering exactly as they do today: absent → no attributes → the old
  // behaviour, no migration, nothing changes for a site until it republishes.
  logoWidth: v.optional(v.number()),
  logoHeight: v.optional(v.number()),
  // Favicon (browser-tab icon), pre-resolved to a url at publish time. Absent =>
  // the platform's default favicon.
  faviconUrl: v.optional(v.string()),
  language: siteLocaleValidator,
  // All published languages of this site (primary first), copied onto every
  // locale's snapshot so the public renderer can show a language switcher +
  // emit hreflang without an extra read. Absent => single-language.
  languages: v.optional(v.array(siteLocaleValidator)),
  // primary slug -> locale slug. Routing metadata needs this map on every locale's
  // snapshot so a language switch can preserve page identity when `/kursen`
  // becomes `/en/course`.
  localizedPageSlugs: v.optional(
    v.record(v.string(), v.record(v.string(), v.string())),
  ),
  // Frozen route-level presentation for `/news`. Optional preserves all
  // snapshots published before the editorial-card layout existed.
  newsIndex: v.optional(newsIndexConfigValidator),
  // Frozen route-level presentation for `/careers`. Absent means cards.
  careersIndex: v.optional(careersIndexConfigValidator),
  theme: themeTokens,
  // Resolved custom fonts (heading/body) - present only when assigned; absent
  // snapshots simply render the theme's built-in fontPair.
  customFonts: v.optional(resolvedSiteFonts),
  contact: v.object({
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(address),
  }),
  socials: v.optional(socialsValidator),
  // Third-party tracking ids, copied from the draft at publish. The public
  // route reads these to (consent-gate and) inject analytics/marketing tags.
  tracking: v.optional(trackingConfig),
  vertical: v.string(),
  // Site-level SEO defaults + the OG image url (resolved).
  seo: v.object({
    titleTemplate: v.string(), // "{page} | {business}"
    defaultDescription: v.string(),
    ogImageUrl: v.optional(v.string()),
  }),
  pages: v.array(snapshotPage),
  // Header menu, already ordered. `target` carries owner-added links (external
  // / phone / email / booking) and is what the renderer resolves. `pageSlug`
  // predates it and stays for snapshots written before targets existed — and
  // for page entries, where it still names the destination; it is "" on an
  // owner-added link. Renderers must prefer `target` and fall back to a page
  // link on `pageSlug`.
  nav: v.array(
    v.object({
      label: v.string(),
      pageSlug: v.string(),
      target: v.optional(ctaTarget),
    }),
  ),
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
  // assetId -> resolved url/dims for every assetRef referenced anywhere in pages.
  resolvedAssets: v.record(v.string(), resolvedAsset),
  // Old-URL redirects (from a previous site or an internal page rename),
  // materialised at publish. The public route serves a 308 for a matched
  // `from` path before it 404s, so a migrated/restructured site keeps the URLs
  // Google indexed. Absent on snapshots written before this field existed.
  redirects: v.optional(
    v.array(v.object({ from: v.string(), to: v.string() })),
  ),
  // Public AI receptionist configuration. Absent/disabled snapshots render no
  // widget; selected source ids are immutable per published version.
  visitorAssistant: v.optional(publishedVisitorAssistantConfigValidator),
});
export type SiteSnapshot = Infer<typeof siteSnapshot>;
