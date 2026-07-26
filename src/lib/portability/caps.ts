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
  // Was 50, which was the only cap below the 500-row ceiling the publish,
  // draft, snapshot and redirect readers all already support. redirects.ts even
  // documents the mismatch ("cannot use the stricter 50-page portable-import
  // cap: ordinary sites may have hundreds of blog posts") - a real site with a
  // blog archive could not be imported at all.
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
   *  hosts (worst case `maxAssets × maxSingleAssetBytes` per call, see
   *  importPerWorkspacePerMin in convex/lib/rateLimit.ts). Raising it needs an
   *  aggregate byte budget on that download loop first. */
  maxAssets: 200,
  // A site realistically has 1-2 (Blog, News) - generous headroom over that.
  maxCollections: 20,
  // Matches the persisted redirect table/read boundary.
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
} as const;

export type CapCode =
  | "too_many_pages"
  | "too_many_sections"
  | "too_many_folders"
  | "too_many_fonts"
  | "too_many_services"
  | "too_many_assets"
  | "too_many_collections"
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
  if ((p.redirects?.length ?? 0) > PORTABLE_CAPS.maxRedirects) {
    return "too_many_redirects";
  }
  return null;
}
