// ---------------------------------------------------------------------------
// Anti-abuse caps for site import. A legit small-business site is a handful of
// pages and a few dozen sections, well under these ceilings; they only stop a
// crafted payload from inflating a workspace or hammering storage. Bounds mirror
// the reader caps in convex/publish.ts (`.take(50)` pages, `.take(500)` sections)
// so an import can never produce a site the rest of the app refuses to load.
// Pure + dependency-free so it is shared by the action and unit tests.
// ---------------------------------------------------------------------------

export const PORTABLE_CAPS = {
  maxPages: 50,
  maxSections: 500,
  maxFolders: 100,
  maxFonts: 12,
  // Matches services.ts' create-time cap. Prevent a crafted backup from
  // creating a service table the editor itself refuses to manage.
  maxServices: 100,
  maxAssets: 200,
  // A site realistically has 1-2 (Blog, News) - generous headroom over that.
  maxCollections: 20,
  /** Per-image byte ceiling - matches IMAGE_LIMITS.maxBytes in lib/sections/limits.ts. */
  maxSingleAssetBytes: 15 * 1024 * 1024,
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
  | "too_many_collections";

/** First exceeded cap, or null when the payload is within every limit. */
export function checkCaps(p: {
  pages: readonly unknown[];
  sections: readonly unknown[];
  folders: readonly unknown[];
  fonts: readonly unknown[];
  services?: readonly unknown[];
  assets: readonly unknown[];
  contentCollections?: readonly unknown[];
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
  return null;
}
