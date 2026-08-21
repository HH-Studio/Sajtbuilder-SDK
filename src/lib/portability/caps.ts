// ---------------------------------------------------------------------------
// Anti-abuse caps for site import. A legit small-business site is a handful of
// pages and a few dozen sections, well under these ceilings; they only stop a
// crafted payload from inflating a workspace or hammering storage. Bounds mirror
// the reader caps every other surface already enforces at 500 rows -
// PUBLISH_PAGE_CAP / PUBLISH_SECTION_CAP / PUBLISH_FOLDER_CAP (convex/publish.ts),
// DRAFT_*_READ_CAP (convex/lib/draftCaps.ts), MAX_PAGES / MAX_SECTIONS
// (convex/model/draftSnapshot.ts), MAX_ROUTABLE_PAGES (convex/redirects.ts) and
// ASSET_URL_RESULT_CAP (convex/model/draftRead.ts) - so an import can never
// produce a site the rest of the app refuses to load.
// Pure + dependency-free so it is shared by the action and unit tests.
// ---------------------------------------------------------------------------

export const PORTABLE_CAPS = {
  // Was 50, the only cap below the 500-row ceiling the publish, draft, snapshot
  // and redirect readers all already support - so a real site with a blog
  // archive could not be imported at all even though it would publish fine.
  maxPages: 500,
  // At parity with PUBLISH_SECTION_CAP / DRAFT_SECTION_READ_CAP / draftSnapshot
  // MAX_SECTIONS. Raising this needs those four raised in step, and they bound
  // in-memory snapshot size - not a constant to move on its own.
  maxSections: 500,
  maxFolders: 500,
  maxFonts: 12,
  // Matches services.ts' create-time cap. Prevent a crafted backup from
  // creating a service table the editor itself refuses to manage.
  maxServices: 100,
  /** Deliberately below the 500-row ASSET_URL_RESULT_CAP: on the URL/HTML
   *  import path this also bounds the safeFetch fan-out against attacker-chosen
   *  hosts. The aggregate byte budget this used to ask for now exists
   *  (`maxTotalAssetBytes`), so the worst case per call is that budget rather
   *  than `maxAssets × maxSingleAssetBytes`. See importPerWorkspacePerMin in
   *  convex/lib/rateLimit.ts for the rate half of the same guard. */
  maxAssets: 200,
  /** AGGREGATE outbound-fetch budget for one import (abuse audit AB-05).
   *
   *  Without it, `maxAssets × maxSingleAssetBytes` = 3 GB of attacker-chosen
   *  remote content could be pulled per call, five calls a minute per
   *  workspace: a bandwidth bill and a reflected-fetch amplifier pointed at a
   *  third party of the caller's choosing. 200 MB comfortably covers a real
   *  small-business site (the largest plan's whole storage quota is 50 GB, but
   *  a single site's imagery is measured in tens of MB); past it the remaining
   *  assets are reported `over_budget` rather than the import failing. */
  maxTotalAssetBytes: 200 * 1024 * 1024,
  // A site realistically has 1-2 (Blog, News) - generous headroom over that.
  // Matches COLLECTIONS_PER_SITE_CAP in convex/model/collections.ts, which the
  // owner-defined collections are created under; the two are one ceiling seen
  // from two sides and must move together.
  maxCollections: 20,
  /** Rows across ALL owner-defined collections in one bundle
   *  (P1-2026-08-19-content-collections.md). `COLLECTION_ROW_CAP` (500) is the
   *  per-collection ceiling and `maxCollections` (20) is the collection
   *  ceiling, so this is their product: an import that would not fit in the
   *  database it is going into is refused at the boundary rather than halfway
   *  through the insert loop.
   *
   *  A bundle anywhere near it will not PUBLISH - `MAX_SITE_VERSION_BYTES` is
   *  900 kB, under a Convex document's own 1 MiB ceiling, and that limit cannot
   *  be raised by us at all. The publish path already turns that into the plain
   *  `site_too_large` blocker rather than a raw Convex error, and that is the
   *  real ceiling on how many rows a site can carry. This cap only stops a
   *  crafted payload from inflating a workspace on the way in. */
  maxCollectionRows: 10_000,
  /** Rows in the site's REDIRECT TABLE - matches the persisted read boundary.
   *
   *  NOT an HTTP redirect-hop limit. `maxRedirects` elsewhere in the codebase
   *  (lib/net/safeFetch, convex/netFetch, convex/import/provider) is the number
   *  of 3xx hops a server-side fetch will follow, and it is 4. The names are
   *  identical and the meanings are unrelated; wiring one to the other would
   *  open a redirect-chain hole (abuse audit AB-17). Renaming this key was
   *  considered and rejected: PORTABLE_CAPS is serialised verbatim into the
   *  PUBLISHED Site Kit contract (contract/site-kit-portable-v1.json), so the
   *  name is external API. The comment is the guard. */
  maxRedirects: 500,
  /** Per-image byte ceiling - matches IMAGE_LIMITS.maxBytes in lib/sections/limits.ts. */
  maxSingleAssetBytes: 15 * 1024 * 1024,
  /** Per-video byte ceiling (absolute backstop = the largest plan's
   *  `maxVideoMb`, convex/lib/plans.ts). The import additionally enforces the
   *  TARGET workspace's own per-plan cap - this constant only bounds the
   *  network fetch / staged blob before that check runs. */
  maxSingleVideoBytes: 300 * 1024 * 1024,
  /** Top-level JSON file size the client refuses to read. */
  maxJsonBytes: 5 * 1024 * 1024,
  /** Self-contained backup `.zip` ceiling - the whole archive is assembled and
   *  unpacked in memory (zipSync/unzipSync), so this bounds both the export
   *  build and the import unzip (backstop against a decompression bomb). */
  maxBundleBytes: 150 * 1024 * 1024,
  /** Entry-COUNT ceiling on that same `.zip`. `maxBundleBytes` bounds the
   *  inflated payload but not the number of members, and an archive of empty
   *  entries sums to zero bytes while still forcing one record key per entry
   *  (~46 bytes of central directory each, so ~3M of them fit in 150 MB).
   *  A real bundle is site.json + manifest.json + at most `maxPages` pages and
   *  `maxAssets` assets, so this is roughly five times the largest legitimate
   *  archive (backend security audit 2026-07-26, UP-4). */
  maxBundleEntries: 5_000,
} as const;

/** Running check for the bundle unpack loop: has this archive already exceeded
 *  what we are willing to inflate? Both dimensions matter and neither implies
 *  the other - a few huge members blow the byte budget, millions of empty ones
 *  blow the entry budget while summing to zero bytes. Pure so the boundary is
 *  testable without a real zip (backend security audit 2026-07-26, UP-4). */
export function exceedsBundleUnpackLimits(
  entries: number,
  inflatedBytes: number,
): boolean {
  return (
    inflatedBytes > PORTABLE_CAPS.maxBundleBytes ||
    entries > PORTABLE_CAPS.maxBundleEntries
  );
}

export type CapCode =
  | "too_many_pages"
  | "too_many_sections"
  | "too_many_folders"
  | "too_many_fonts"
  | "too_many_services"
  | "too_many_assets"
  | "too_many_collections"
  | "too_many_collection_rows"
  | "too_many_redirects";

/** First exceeded cap, or null when the payload is within every limit. */
export function checkCaps(p: {
  pages: readonly unknown[];
  sections: readonly unknown[];
  folders: readonly unknown[];
  fonts: readonly unknown[];
  services?: readonly unknown[];
  assets: readonly unknown[];
  contentCollections?: readonly unknown[];
  collectionRows?: readonly unknown[];
  redirects?: readonly unknown[];
}): CapCode | null {
  if (p.pages.length > PORTABLE_CAPS.maxPages) return "too_many_pages";
  if (p.sections.length > PORTABLE_CAPS.maxSections) return "too_many_sections";
  if (p.folders.length > PORTABLE_CAPS.maxFolders) return "too_many_folders";
  if (p.fonts.length > PORTABLE_CAPS.maxFonts) return "too_many_fonts";
  if ((p.services?.length ?? 0) > PORTABLE_CAPS.maxServices) {
    return "too_many_services";
  }
  if (p.assets.length > PORTABLE_CAPS.maxAssets) return "too_many_assets";
  if ((p.contentCollections?.length ?? 0) > PORTABLE_CAPS.maxCollections) {
    return "too_many_collections";
  }
  if ((p.collectionRows?.length ?? 0) > PORTABLE_CAPS.maxCollectionRows) {
    return "too_many_collection_rows";
  }
  if ((p.redirects?.length ?? 0) > PORTABLE_CAPS.maxRedirects) {
    return "too_many_redirects";
  }
  return null;
}
