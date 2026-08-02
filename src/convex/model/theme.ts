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
/** Owner-facing button fill styles. `pill` used to mean "solid + full round";
 *  radius now owns roundness, so the third option is underline instead. */
export const BUTTON_STYLE_KEYS = ["solid", "outline", "underline"] as const;
/** Still stored on older sites; treated as `solid` at render (see normalizeButtonStyle). */
export const LEGACY_BUTTON_STYLE_KEYS = ["pill"] as const;

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

// Casing of section headings. "none" is the letters as typed; "uppercase" is
// the tracked-caps look a lot of studio and editorial brands set in CSS. It is
// a display transform, so the stored text (and therefore search, SEO, the AI
// and every export) keeps the owner's real casing.
export const HEADING_CASE_KEYS = ["none", "uppercase"] as const;

// Where a section's heading block (eyebrow + heading + intro) sits on the page.
// This is the single strongest structural signal an art-direction family has:
// left-aligned section heads down a page and centered section heads down a page
// are two visibly different websites, and every generated site was previously
// stuck on whatever each section component hard-coded.
//
// It is a DEFAULT, not a command. A section whose own layout cannot honour it —
// a split composition where the heading sits in one column of a two-column grid
// — opts out explicitly (`<SectionHeading align="start">`), because a heading
// centered over a 4fr column is worse than either alignment.
//
// Optional, and ABSENT MEANS "start": every site created before this token
// existed keeps its exact current rendering with no migration.
//
// Set at GENERATION and IMPORT time only — deliberately not in `updateTheme`'s
// allow-list (convex/sections.ts) and with no editor control, exactly like
// `headingCase`. It is an art-direction decision the generator makes, not a
// knob the owner tunes; its absence from that allow-list is intentional, not a
// missed registration.
export const HEADING_ALIGN_KEYS = ["start", "center"] as const;

// Site-wide scroll motion. Sections fade-and-rise as they enter the viewport
// (see components/site-sections/shared/SectionMotion.tsx). Composite-only
// (opacity + transform), one-shot, and always off under
// `prefers-reduced-motion` - content is in the DOM either way, so SEO and
// screen readers are untouched.
//
// Optional, and ABSENT MEANS "none": every site created before this token
// existed keeps its exact current, still look with no migration. New sites get
// `subtle` written explicitly at generation time (convex/generation/build.ts),
// and an import sets it when the source page actually had motion - so a
// migrated site doesn't silently lose the animation it used to have.
export const MOTION_KEYS = ["none", "subtle", "full"] as const;

// Where the menu links sit in the site header. Purely positional: every
// variant renders the same logo, the same links and the same call button
// through the same <SiteNav>, so no choice here can produce a header that is
// missing something or fails contrast.
//
// Optional, and ABSENT MEANS "spread" — the layout every site shipped with
// before this token existed, so no migration is needed and no existing header
// moves. `spread` is `justify-between`: the links drift to wherever the logo
// and the call button leave room, which is why the other three exist.
// `brand-center` is the one that reorders rather than just re-aligns: the links
// sit FIRST, the wordmark is centred between them and the button. It is a very
// common editorial/boutique header, and it was the shape annahedin.com used —
// unreachable with the other four, which all keep the brand on the left.
export const NAV_LAYOUT_KEYS = [
  "spread",
  "left",
  "center",
  "right",
  "brand-center",
] as const;

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

// ---------------------------------------------------------------------------
// Measured design overrides (import-only). Everything above this line is an
// enumerated choice; these three are raw values, and they exist for exactly one
// reason: an import has to be able to reproduce the source site's own design,
// and a preset scale cannot express "80px, weight 700, tracking -2.4px". They
// sit beside `customPalette` / `customFonts`, which already break the
// preset-only rule for colour and typeface for the same reason.
//
// They are never authored in the editor. The owner's only control over them is
// one reset (see `convex/importRefine.ts` -> `resetMeasuredDesign`), which drops
// the whole block so the site falls back to its preset theme. That keeps the
// "unreachable by construction" promise for hand-built sites while letting an
// imported site keep the design it arrived with.
//
// ABSENT MEANS EXACTLY TODAY'S RENDERING for every field. The renderer emits
// the built-in value unless an override is present (lib/sections/theme.ts).
// ---------------------------------------------------------------------------

/** The typographic roles the renderer exposes as CSS vars. One per `Heading`
 *  level plus the body/eyebrow sizes, so a measured source page can pin each
 *  independently instead of moving one global multiplier. */
export const TYPE_ROLE_KEYS = [
  "display",
  "h1",
  "h2",
  "h3",
  "lead",
  "body",
  "sm",
  "eyebrow",
  // The pull-quote (testimonials). Its own role because it is the one place a
  // site sets big type that is neither a heading nor prose - editorial brands
  // routinely give it a third size, a different weight and its own casing, and
  // borrowing the h2 tokens (which is what it did) meant a measured import
  // could not reproduce it without dragging every section heading with it.
  "quote",
] as const;
export type TypeRole = (typeof TYPE_ROLE_KEYS)[number];

export const TEXT_TRANSFORM_KEYS = [
  "none",
  "uppercase",
  "lowercase",
  "capitalize",
] as const;

/** Which loaded typeface a role is set in. Roles default to the family they use
 *  today (headings -> heading, body/lead/sm -> body); `display` lets a source
 *  that sets its hero and pull-quote in a third typeface say so. */
export const TYPE_FAMILY_KEYS = ["heading", "body", "display"] as const;

/** One role's measured type. Every field optional: an import fills in what it
 *  could actually measure and leaves the rest to the preset scale. Lengths are
 *  re-validated against a strict pattern before they reach CSS
 *  (`safeLength` in lib/sections/theme.ts) — this validator only bounds shape. */
export const customTypeRole = v.object({
  /** CSS length, e.g. "80px" / "3.5rem". Simple lengths only. The size at the
   *  widest measured breakpoint — the ceiling of the ramp below. */
  size: v.optional(v.string()),
  /** The other two ends of a measured RAMP. A source page does not set one
   *  size per role, it sets three or four across breakpoints: annahedin.com's
   *  hero runs 80 → 60 → 50 → 40px and its pull-quote 58 → 48 → 30px. Storing
   *  only `size` pinned a phone to the desktop number, which was the whole
   *  remaining mobile gap on that import (a 58px quote on a 375px screen).
   *
   *  Both present => the role renders `clamp(sizeMin, sizeFluid, size)`.
   *  Either missing => `size` alone, exactly as before. `sizeFluid` must be a
   *  container-relative length (`cqw`) — see safeLength's note on why `vw` is
   *  rejected: it would break the editor's scaled preview. */
  sizeMin: v.optional(v.string()),
  sizeFluid: v.optional(v.string()),
  weight: v.optional(v.number()),
  /** Unitless line-height ratio, e.g. 1.05. */
  lineHeight: v.optional(v.number()),
  /** CSS length, may be negative, e.g. "-2.4px" / "-0.03em". */
  tracking: v.optional(v.string()),
  transform: v.optional(
    v.union(...TEXT_TRANSFORM_KEYS.map((k) => v.literal(k))),
  ),
  family: v.optional(v.union(...TYPE_FAMILY_KEYS.map((k) => v.literal(k)))),
});
export type CustomTypeRole = Infer<typeof customTypeRole>;

export const customType = v.object(
  Object.fromEntries(
    TYPE_ROLE_KEYS.map((k) => [k, v.optional(customTypeRole)]),
  ) as Record<TypeRole, ReturnType<typeof v.optional<typeof customTypeRole>>>,
);
export type CustomType = Infer<typeof customType>;

/** Measured section rhythm + container widths. `sectionPy` replaces the 4.5rem
 *  base the density multiplier scales, so density and the Labs paddingY knob
 *  keep working on top of it. */
export const customLayout = v.object({
  sectionPy: v.optional(v.string()),
  containerNarrow: v.optional(v.string()),
  containerDefault: v.optional(v.string()),
  containerWide: v.optional(v.string()),
  // Photo-band height, for a source page whose hero is "as tall as its photo,
  // within limits" rather than "as tall as its text". Our overlay hero is
  // text-sized (padding only), which on an imported site collapsed a 700px
  // picture band to ~350px — the single most visible thing a migration gets
  // wrong, and unreachable from the preset tokens.
  //
  // The ASPECT is not stored: it comes from the hero's own image, so the two
  // can never disagree. These are the clamp's two ends:
  //   heroMinVh     — floor, as a % of viewport height (a phone, where the
  //                   photo's own aspect would leave a letterbox strip)
  //   heroMaxHeight — ceiling, a length (a wide desktop, where the aspect
  //                   would otherwise run past one screen)
  // Absent (either one) => the hero keeps its text-sized padding exactly.
  heroMinVh: v.optional(v.number()),
  heroMaxHeight: v.optional(v.string()),
  // Same idea for a full-bleed IMAGE band. `image/full` means "one screenful"
  // by design; a measured source page instead runs the picture at its own
  // aspect and caps it. Present => that behaviour, capped at this length.
  // Absent => `image/full` stays exactly one screen.
  mediaBandMaxHeight: v.optional(v.string()),
});
export type CustomLayout = Infer<typeof customLayout>;

/** The named easing curves an import may ask for. A CLOSED SET on purpose: the
 *  value lands in `animation-timing-function`, so accepting a raw string would
 *  make a bundle able to write arbitrary CSS into the declaration. Every real
 *  source curve we have seen (GSAP `power2.out`, Webflow's "ease out quart",
 *  a bare `ease-out`) lands on one of these, and one that does not degrades to
 *  `linear` — which is what the reveal has always used. */
export const MOTION_EASING_KEYS = [
  "linear",
  "ease-out",
  "power2-out",
  "power3-out",
  "expo-out",
  "back-out",
] as const;
export type MotionEasing = (typeof MOTION_EASING_KEYS)[number];

/** Measured scroll/load motion, in the same spirit as `customType` /
 *  `customLayout`: the three preset `motion` steps cannot express "rise 24px,
 *  blur 10px, over 1s, 0.2s apart", and that is the whole vocabulary a Webflow
 *  or GSAP source page animates with.
 *
 *  Every field is optional and ABSENT MEANS TODAY'S RENDERING, byte for byte:
 *  the renderer emits nothing at all when the block is empty, and each CSS var
 *  it does emit is read with the current value as its `var()` fallback
 *  (app/globals.css). `motion` still decides WHETHER a section reveals; this
 *  only reshapes the reveal that token already asked for. */
export const customMotion = v.object({
  /** How far content rises as it enters, e.g. "24px". A simple CSS length,
   *  re-validated by `safeLength` before it reaches a declaration. */
  enterY: v.optional(v.string()),
  /** Blur it starts from, e.g. "10px". Absent => no blur, which is what the
   *  reveal has always done — and deliberately so: an always-on `filter` would
   *  make every revealing band a containing block for its fixed children. */
  enterBlur: v.optional(v.string()),
  /** Page-LOAD reveal length in ms (the first section only; everything below
   *  the fold is scroll-driven and has no duration). Bounded at render. */
  duration: v.optional(v.number()),
  easing: v.optional(v.union(...MOTION_EASING_KEYS.map((k) => v.literal(k)))),
  /** Milliseconds between sibling elements in the load reveal. */
  stagger: v.optional(v.number()),
  /** Where in the band's ENTRY the reveal starts, as a percentage. 0 = the
   *  moment its top edge crosses the bottom of the screen (GSAP's
   *  `start: "top bottom"`), which is also today's default. */
  startAt: v.optional(v.number()),
});
export type CustomMotion = Infer<typeof customMotion>;

export const themeTokens = v.object({
  palette: v.union(...PALETTE_KEYS.map((k) => v.literal(k))),
  fontPair: v.union(...FONT_PAIR_KEYS.map((k) => v.literal(k))),
  density: v.union(...DENSITY_KEYS.map((k) => v.literal(k))),
  radius: v.union(...RADIUS_KEYS.map((k) => v.literal(k))),
  buttonStyle: v.union(
    ...BUTTON_STYLE_KEYS.map((k) => v.literal(k)),
    ...LEGACY_BUTTON_STYLE_KEYS.map((k) => v.literal(k)),
  ),
  appearance: v.optional(v.union(...APPEARANCE_KEYS.map((k) => v.literal(k)))),
  typeScale: v.optional(v.union(...TYPE_SCALE_KEYS.map((k) => v.literal(k)))),
  motion: v.optional(v.union(...MOTION_KEYS.map((k) => v.literal(k)))),
  navLayout: v.optional(v.union(...NAV_LAYOUT_KEYS.map((k) => v.literal(k)))),
  // Optional import-only overrides. Absent on every hand-built site (they keep
  // `palette`/`fontPair`). When present, the renderer uses these instead so an
  // imported site keeps its original brand colour + typefaces.
  customPalette: v.optional(v.object({ light: surfaceTokens, dark: surfaceTokens })),
  customFonts: v.optional(
    v.object({
      heading: v.string(),
      body: v.string(),
      // A third role. Real sites routinely use three typefaces — a display cut
      // for the hero and pull-quotes, a condensed cut for section headings, a
      // text face for prose — and an import that can only carry two has to
      // collapse one of them onto another, which is immediately visible.
      // Absent on every site that has only two.
      display: v.optional(v.string()),
    }),
  ),
  // The single brand colour `customPalette` was generated from. Kept so the
  // post-import refine panel can show (and re-derive from) the owner's actual
  // colour instead of reverse-engineering it out of thirteen surface tokens.
  customBrandHex: v.optional(v.string()),
  // Section headings in caps. A whole family of real brands sets
  // `text-transform: uppercase` on its headings in CSS, and an import that
  // cannot carry that has to bake the caps into the text — which then traps the
  // owner into typing in caps forever to keep the page consistent. Absent means
  // "none", so no existing site changes. The HERO headline is deliberately
  // exempt (see components/site-sections/hero/Hero.tsx): it is the page's
  // sentence, not a label, and the sites that use caps headings almost never
  // shout their own name.
  headingCase: v.optional(v.union(...HEADING_CASE_KEYS.map((k) => v.literal(k)))),
  // Section-heading alignment (see HEADING_ALIGN_KEYS). Absent means "start",
  // which is what every section rendered before the token existed.
  headingAlign: v.optional(
    v.union(...HEADING_ALIGN_KEYS.map((k) => v.literal(k))),
  ),
  // Measured type + layout (see the block above `themeTokens`). Import-only,
  // absent means today's preset rendering, reset drops them wholesale.
  customType: v.optional(customType),
  customLayout: v.optional(customLayout),
  customMotion: v.optional(customMotion),
});

export type ThemeTokens = Infer<typeof themeTokens>;
export type SurfaceTokens = Infer<typeof surfaceTokens>;
export type Appearance = (typeof APPEARANCE_KEYS)[number];
export type Motion = (typeof MOTION_KEYS)[number];
export type HeadingCase = (typeof HEADING_CASE_KEYS)[number];
export type HeadingAlign = (typeof HEADING_ALIGN_KEYS)[number];
export type NavLayout = (typeof NAV_LAYOUT_KEYS)[number];
export type ButtonStyle = (typeof BUTTON_STYLE_KEYS)[number];

/** Map legacy `pill` (solid + full round) onto today's solid fill — radius is
 *  chosen separately now. Pure. */
export function normalizeButtonStyle(
  style: ThemeTokens["buttonStyle"],
): ButtonStyle {
  return style === "pill" ? "solid" : style;
}

/** What a site created TODAY gets. Written explicitly (never inferred) so the
 *  absent-means-"none" rule above keeps every older site still. */
export const NEW_SITE_MOTION: Motion = "subtle";

export const DEFAULT_THEME: ThemeTokens = {
  palette: "slate",
  fontPair: "modern",
  density: "comfortable",
  radius: "soft",
  buttonStyle: "solid",
  appearance: "light",
  motion: NEW_SITE_MOTION,
};
