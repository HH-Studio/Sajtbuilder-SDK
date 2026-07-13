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

export const themeTokens = v.object({
  palette: v.union(...PALETTE_KEYS.map((k) => v.literal(k))),
  fontPair: v.union(...FONT_PAIR_KEYS.map((k) => v.literal(k))),
  density: v.union(...DENSITY_KEYS.map((k) => v.literal(k))),
  radius: v.union(...RADIUS_KEYS.map((k) => v.literal(k))),
  buttonStyle: v.union(...BUTTON_STYLE_KEYS.map((k) => v.literal(k))),
  appearance: v.optional(v.union(...APPEARANCE_KEYS.map((k) => v.literal(k)))),
});

export type ThemeTokens = Infer<typeof themeTokens>;
export type Appearance = (typeof APPEARANCE_KEYS)[number];

export const DEFAULT_THEME: ThemeTokens = {
  palette: "slate",
  fontPair: "modern",
  density: "comfortable",
  radius: "soft",
  buttonStyle: "solid",
  appearance: "light",
};
