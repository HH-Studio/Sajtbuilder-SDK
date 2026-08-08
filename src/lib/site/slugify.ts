// Shared URL-slug normalisation. Lives outside `convex/` so client components
// can preview the address a title/slug will produce WITHOUT importing Convex
// server code (backlog 0311). `convex/lib/slug.ts` re-exports this, so the
// editor preview and the server write can never drift apart.

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 48)
    // Trim AFTER slicing so a truncation that lands on a "-" boundary can't
    // leave a trailing dash (e.g. a long name cut mid-word → "studio-…-").
    .replace(/^-+|-+$/g, "");
  return base || "min-sida";
}
