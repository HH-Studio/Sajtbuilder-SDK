import { v, type Infer } from "convex/values";
import { GOOGLE_FONTS, findGoogleFont } from "../../lib/fonts/google";

// ---------------------------------------------------------------------------
// Custom fonts. A font is a reusable family a site owner brings from one of
// three sources: an uploaded file (woff2/woff/ttf/otf), a curated Google
// family, or an Adobe Fonts (Typekit) web project. The assignment of which
// family is used for headings vs body lives on `websites.fonts`; the family
// definitions live in the `fonts` table. Everything needed to LOAD a font at
// render time is denormalized into `resolvedSiteFonts` (snapshot + editor
// query) so the public route does zero font lookups - same idea as
// resolvedAssets. All family names are sanitized before they ever reach CSS,
// and Google/Adobe URLs are built server-side from validated inputs (a raw
// client-supplied URL is never trusted) to make CSS/URL injection unreachable.
// ---------------------------------------------------------------------------

export const FONT_SOURCES = ["upload", "google", "adobe"] as const;
export const fontSource = v.union(
  ...FONT_SOURCES.map((s) => v.literal(s)),
);
export type FontSource = Infer<typeof fontSource>;

export const FONT_FORMATS = ["woff2", "woff", "truetype", "opentype"] as const;
export type FontFormat = (typeof FONT_FORMATS)[number];

export const fontStyle = v.union(v.literal("normal"), v.literal("italic"));
export type FontStyle = Infer<typeof fontStyle>;

/** One uploaded file = a single weight/style cut of a family. */
export const fontFile = v.object({
  storageId: v.id("_storage"),
  weight: v.number(),
  style: fontStyle,
  format: v.string(), // one of FONT_FORMATS
  // Added after the initial custom-font launch. Optional keeps older rows
  // readable while every new upload stores the server-recorded byte count.
  bytes: v.optional(v.number()),
});
export type FontFile = Infer<typeof fontFile>;

/** A face resolved to a concrete URL (upload), ready for an @font-face rule. */
export const resolvedFace = v.object({
  url: v.string(),
  // Kept in the immutable snapshot alongside the URL so draft cleanup can
  // prove whether the currently live version still needs this storage blob.
  // Optional keeps snapshots published before this ownership rollout valid.
  storageId: v.optional(v.id("_storage")),
  weight: v.number(),
  style: fontStyle,
  format: v.string(),
});
export type ResolvedFace = Infer<typeof resolvedFace>;

/** A font resolved to everything needed to load it without a DB read. */
export const resolvedFont = v.object({
  family: v.string(),
  source: fontSource,
  href: v.optional(v.string()), // google/adobe stylesheet URL
  faces: v.optional(v.array(resolvedFace)), // uploaded faces
});
export type ResolvedFont = Infer<typeof resolvedFont>;

/** Render payload: which resolved font is heading vs body. */
export const resolvedSiteFonts = v.object({
  heading: v.optional(resolvedFont),
  body: v.optional(resolvedFont),
});
export type ResolvedSiteFonts = Infer<typeof resolvedSiteFonts>;

/** Stored on `websites.fonts`: the heading/body assignment (draft world). */
export const fontAssignment = v.object({
  headingFontId: v.optional(v.id("fonts")),
  bodyFontId: v.optional(v.id("fonts")),
});
export type FontAssignment = Infer<typeof fontAssignment>;

// --- Validation / safe builders --------------------------------------------

const FAMILY_MAX = 50;

/**
 * Reduce a family name to a CSS-safe token. Only letters, digits, spaces and
 * hyphens survive - so it can be dropped into an `@font-face { font-family }`
 * and a `font-family:` declaration without being able to break out of the
 * quoted string. Returns "" when nothing usable remains (callers reject that).
 */
export function sanitizeFamily(raw: string): string {
  return raw
    .replace(/[^A-Za-z0-9 -]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, FAMILY_MAX);
}

export function isValidWeight(w: number): boolean {
  return Number.isInteger(w) && w >= 1 && w <= 1000;
}

export function isValidFormat(f: string): f is FontFormat {
  return (FONT_FORMATS as readonly string[]).includes(f);
}

const ADOBE_KIT_RE = /^[a-z0-9]{4,20}$/;
export function isValidAdobeKitId(id: string): boolean {
  return ADOBE_KIT_RE.test(id);
}

/**
 * Build a Google Fonts css2 stylesheet URL for a curated family. Throws if the
 * family is not in the allow-list. Weights default to the family's curated set;
 * any caller-supplied weights are intersected with that set so an attacker
 * can't smuggle arbitrary query content.
 */
export function buildGoogleUrl(family: string, weights?: number[]): string {
  const font = findGoogleFont(family);
  if (!font) throw new Error(`Unknown Google font: ${family}`);
  const allowed = new Set(font.weights);
  const chosen = (weights ?? font.weights).filter((w) => allowed.has(w));
  const finalWeights = (chosen.length > 0 ? chosen : font.weights)
    .slice()
    .sort((a, b) => a - b);
  const fam = font.family.replace(/ /g, "+");
  return `https://fonts.googleapis.com/css2?family=${fam}:wght@${finalWeights.join(";")}&display=swap`;
}

/** Build the Typekit stylesheet URL for a validated Adobe project (kit) id. */
export function buildAdobeUrl(kitId: string): string {
  if (!isValidAdobeKitId(kitId)) throw new Error("Invalid Adobe kit id");
  return `https://use.typekit.net/${kitId}.css`;
}

export { GOOGLE_FONTS };
