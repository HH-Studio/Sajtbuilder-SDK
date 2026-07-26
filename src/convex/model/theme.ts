import { v, type Infer } from "convex/values";

// ---------------------------------------------------------------------------
// Theme tokens - a small, constrained set of choices. Users never pick raw
// hex; they pick from these enumerated, pre-validated options. The renderer
// maps these to CSS custom properties (see lib/sections/theme.ts), so an
// off-palette or low-contrast result is unreachable by construction.
// This validator is shared by the live `websites.theme` field and the
// published `siteVersions` snapshot.
// ---------------------------------------------------------------------------

export const PALETTE_KEYS = [
  "slate", // neutral, professional
  "ocean", // calm blue (clinics, trust)
  "forest", // natural green (cleaning, outdoor)
  "clay", // warm terracotta (salons, personal)
  "sand", // soft beige (premium, editorial)
  "mono", // near-black & white (bold, minimal)
  "rose", // warm pink (beauty, personal)
  "sage", // muted green (calm, natural, wellness)
  "plum", // deep aubergine (elegant, refined)
  "midnight", // deep navy (premium, trustworthy)
  "amber", // warm gold (craft, hospitality)
] as const;

export const FONT_PAIR_KEYS = [
  "modern", // grotesk heading + clean sans body
  "classic", // serif heading + sans body
  "friendly", // rounded humanist
  "premium", // high-contrast serif display + sans
  "editorial", // serif heading + grotesk body
  "grotesk", // grotesk heading + grotesk body (bold)
] as const;

export const DENSITY_KEYS = ["compact", "comfortable", "spacious"] as const;
export const RADIUS_KEYS = ["sharp", "soft", "round"] as const;
export const BUTTON_STYLE_KEYS = ["solid", "outline", "pill"] as const;

// Site-wide light/dark mode. "system" follows the visitor's device preference.
// Optional + defaults to "light" so existing sites (stored without the field)
// keep their exact current look - no migration needed.
export const APPEARANCE_KEYS = ["light", "dark", "system"] as const;

// Site-wide text size. Multiplies the whole fluid type scale via
// `--site-type-scale` (see lib/sections/theme.ts), so headings and body move
// together and stay in proportion - never a per-element font-size override.
// Optional + defaults to "normal" (scale 1) so every existing site keeps its
// exact current look with no migration.
export const TYPE_SCALE_KEYS = ["normal", "large"] as const;

// One tone surface as raw CSS colour strings. Used only by `customPalette`
// (site import): a colour set generated from an imported site's own brand,
// carried verbatim so the migrated site reads as "my site" instead of snapping
// to one of the 11 built-in palettes. The generator (lib/import/designExtract)
// targets WCAG AA; unlike the built-in palettes this is not gated by the
// authored-palette contrast test, so treat it as a best-effort match the owner
// can override in the editor. All values are CSS colours (oklch/hsl/rgb/hex).
export const surfaceTokens = v.object({
  bg: v.string(),
  fg: v.string(),
  muted: v.string(),
  mutedFg: v.string(),
  primary: v.string(),
  primaryFg: v.string(),
  primaryText: v.optional(v.string()),
  accent: v.string(),
  accentFg: v.string(),
  border: v.string(),
  card: v.string(),
  cardFg: v.string(),
  cardBorder: v.string(),
});

export const themeTokens = v.object({
  palette: v.union(...PALETTE_KEYS.map((k) => v.literal(k))),
  fontPair: v.union(...FONT_PAIR_KEYS.map((k) => v.literal(k))),
  density: v.union(...DENSITY_KEYS.map((k) => v.literal(k))),
  radius: v.union(...RADIUS_KEYS.map((k) => v.literal(k))),
  buttonStyle: v.union(...BUTTON_STYLE_KEYS.map((k) => v.literal(k))),
  appearance: v.optional(v.union(...APPEARANCE_KEYS.map((k) => v.literal(k)))),
  typeScale: v.optional(v.union(...TYPE_SCALE_KEYS.map((k) => v.literal(k)))),
  // Optional import-only overrides. Absent on every hand-built site (they keep
  // `palette`/`fontPair`). When present, the renderer uses these instead so an
  // imported site keeps its original brand colour + typefaces.
  customPalette: v.optional(v.object({ light: surfaceTokens, dark: surfaceTokens })),
  customFonts: v.optional(
    v.object({ heading: v.string(), body: v.string() }),
  ),
  // The single brand colour `customPalette` was generated from. Kept so the
  // post-import refine panel can show (and re-derive from) the owner's actual
  // colour instead of reverse-engineering it out of thirteen surface tokens.
  customBrandHex: v.optional(v.string()),
});

export type ThemeTokens = Infer<typeof themeTokens>;
export type SurfaceTokens = Infer<typeof surfaceTokens>;
export type Appearance = (typeof APPEARANCE_KEYS)[number];

export const DEFAULT_THEME: ThemeTokens = {
  palette: "slate",
  fontPair: "modern",
  density: "comfortable",
  radius: "soft",
  buttonStyle: "solid",
  appearance: "light",
};
