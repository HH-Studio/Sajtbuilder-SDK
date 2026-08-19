import type { CSSProperties } from "react";
import {
  normalizeButtonStyle,
  TYPE_ROLE_KEYS,
  type ThemeTokens,
  type Appearance,
  type CustomTypeRole,
  type TypeRole,
} from "../../convex/model/theme";
import { SITE_LOGO_CLASS } from "../appearance/logoImage";
import { PALETTES, brandSurface, type Surface } from "../palettes";

// ---------------------------------------------------------------------------
// Maps constrained theme tokens to CSS custom properties consumed by the site
// section components. The site renderer puts root-level vars (fonts, radius,
// density, default light surface) on a `.site-root` wrapper; each Section then
// applies a tone-specific surface (light / clear / dark) onto itself.
// ---------------------------------------------------------------------------

/** Three steps of one canvas — `light` (the page), `clear` (a neutral step),
 *  `dark` (the inverse) — plus `brand`: the palette's accent used as a FIELD.
 *  See the header of `lib/palettes.ts` for why the first three are neutral and
 *  the fourth is where a site's colour actually lives. */
export type SectionTone = "light" | "clear" | "dark" | "brand";

/** Typeface family of the heading font - drives optical line-height / tracking /
 *  weight so serif and grotesk headings each read correctly (sizes stay shared).
 *  `displaySerif` = the elegant display cut (Playfair Display) - editorial
 *  gravitas, tight leading; `groteskBold` = the loud trades/gym cut of Inter -
 *  heavy weight, tight tracking, tracked-caps eyebrow. */
type FontCategory =
  | "grotesk"
  | "groteskBold"
  | "serif"
  | "displaySerif"
  | "humanist";

const FONT_PAIRS: Record<
  ThemeTokens["fontPair"],
  { heading: string; body: string; category: FontCategory }
> = {
  // Bodies name `--font-geist-sans` directly, never `--font-sans`. They used to
  // say `var(--font-sans)` and globals.css re-pointed that variable to Geist
  // under [data-site-root] — which also meant `font-sans` on editor chrome
  // rendered inside the canvas resolved to the SITE's font instead of the app's
  // (owner report 2026-08-02: the "Lägg till sektion" pill went serif). Same
  // rendered typeface as before; one less variable with two meanings.
  modern: {
    heading: "var(--font-site-grotesk)",
    body: "var(--font-geist-sans)",
    category: "grotesk",
  },
  classic: {
    heading: "var(--font-site-serif)",
    body: "var(--font-geist-sans)",
    category: "serif",
  },
  friendly: {
    heading: "var(--font-site-humanist)",
    body: "var(--font-site-humanist)",
    category: "humanist",
  },
  // Stored key kept for existing sites. The owner-facing name is now Elegant,
  // and Playfair replaces the overly delicate Cormorant cut.
  premium: {
    heading: "var(--font-site-serif-display)",
    body: "var(--font-geist-sans)",
    category: "displaySerif",
  },
  editorial: {
    heading: "var(--font-site-serif)",
    body: "var(--font-site-grotesk)",
    category: "serif",
  },
  // Same family as `modern` but a deliberately louder cut - without this the
  // two pairs shared identical heading optics and differed only in body font.
  grotesk: {
    heading: "var(--font-site-grotesk)",
    body: "var(--font-site-grotesk)",
    category: "groteskBold",
  },
  clean: {
    heading: "var(--font-site-clean)",
    body: "var(--font-site-clean)",
    category: "grotesk",
  },
  soft: {
    heading: "var(--font-site-soft-serif)",
    body: "var(--font-geist-sans)",
    category: "serif",
  },
  condensed: {
    heading: "var(--font-site-condensed)",
    body: "var(--font-geist-sans)",
    category: "groteskBold",
  },
  timeless: {
    heading: "var(--font-site-soft-serif)",
    body: "var(--font-site-soft-serif)",
    category: "serif",
  },
};

/** The five fluid sizes a category owns, plus its two reading measures. A
 *  category is a typographic personality, so the SIZE RAMP belongs to it too:
 *  A display serif at 40px reads smaller than Inter at 40px, and an editorial serif
 *  site and a grotesk site should not share one metric scale (that is what made
 *  two generated sites look like the same template). */
type CategorySizes = {
  display: string;
  h1: string;
  h2: string;
  h3: string;
  lead: string;
  /** Body reading measure, in `ch` of the element's own font — the 60-75
   *  character band. Resolved at the USE site (unregistered custom properties
   *  substitute their token stream), so `ch` tracks the paragraph's font. */
  measure: string;
  /** Heading measure. A section head wraps at ~22-24 characters per line; a
   *  bigger cut wraps sooner so a two-line head stays two lines. */
  measureHeading: string;
};

/** Per-category heading optics + size ramp. Leading / tracking / weight shift
 *  so each typeface reads correctly, and the sizes shift so each typeface holds
 *  its column. */
const CATEGORY_TYPE: Record<
  FontCategory,
  {
    leadingHeading: string;
    leadingDisplay: string;
    trackingDisplay: string;
    weightHeading: string;
    /** Eyebrow/kicker treatment: grotesk & humanist read as a tracked
     *  uppercase label; serif pairs read as an editorial sentence-case
     *  kicker (uppercase + wide tracking fights a serif's shapes). */
    eyebrowTransform: "uppercase" | "none";
    trackingEyebrow: string;
    sizes: CategorySizes;
  }
> = {
  grotesk: {
    leadingHeading: "1.12",
    leadingDisplay: "1.05",
    trackingDisplay: "-0.025em",
    weightHeading: "600",
    eyebrowTransform: "uppercase",
    trackingEyebrow: "0.06em",
    sizes: {
      display: "clamp(2.5rem, 1.34rem + 4.75cqw, 5.5rem)", // 40 -> 88
      h1: "clamp(2rem, 1.6rem + 1.8cqw, 3rem)", // 32 -> 48
      h2: "clamp(1.75rem, 1.35rem + 1.6cqw, 2.5rem)", // 28 -> 40
      h3: "clamp(1.1875rem, 1.1rem + 0.35cqw, 1.375rem)", // 19 -> 22
      lead: "clamp(1.125rem, 1.05rem + 0.35cqw, 1.3125rem)", // 18 -> 21
      measure: "64ch",
      measureHeading: "24ch",
    },
  },
  // Loud cut: heavier weight + tighter display tracking + wider tracked-caps
  // eyebrow, and the biggest ramp of the five. Gyms and trades with attitude,
  // not a second "modern".
  groteskBold: {
    leadingHeading: "1.08",
    leadingDisplay: "1.02",
    trackingDisplay: "-0.035em",
    weightHeading: "700",
    eyebrowTransform: "uppercase",
    trackingEyebrow: "0.09em",
    sizes: {
      display: "clamp(2.625rem, 1.225rem + 5.74cqw, 6.25rem)", // 42 -> 100
      h1: "clamp(2.125rem, 1.65rem + 2.1cqw, 3.25rem)", // 34 -> 52
      h2: "clamp(1.875rem, 1.4rem + 1.9cqw, 2.75rem)", // 30 -> 44
      h3: "clamp(1.1875rem, 1.1rem + 0.35cqw, 1.375rem)",
      lead: "clamp(1.125rem, 1.05rem + 0.35cqw, 1.3125rem)",
      measure: "62ch",
      measureHeading: "22ch",
    },
  },
  serif: {
    leadingHeading: "1.16",
    leadingDisplay: "1.08",
    trackingDisplay: "-0.02em",
    weightHeading: "400",
    eyebrowTransform: "none",
    trackingEyebrow: "0.01em",
    sizes: {
      display: "clamp(2.5rem, 1.34rem + 4.75cqw, 5.5rem)", // 40 -> 88
      h1: "clamp(2rem, 1.55rem + 2cqw, 3.25rem)", // 32 -> 52
      h2: "clamp(1.75rem, 1.3rem + 1.8cqw, 2.625rem)", // 28 -> 42
      h3: "clamp(1.25rem, 1.15rem + 0.4cqw, 1.4375rem)", // 20 -> 23
      lead: "clamp(1.1875rem, 1.1rem + 0.35cqw, 1.375rem)", // 19 -> 22
      measure: "68ch",
      measureHeading: "24ch",
    },
  },
  // Display serif: larger than a grotesk at the same role, with tight
  // editorial leading and a sentence-case kicker.
  displaySerif: {
    leadingHeading: "1.1",
    leadingDisplay: "1.04",
    trackingDisplay: "-0.012em",
    weightHeading: "600",
    eyebrowTransform: "none",
    trackingEyebrow: "0.02em",
    sizes: {
      display: "clamp(2.875rem, 1.475rem + 5.74cqw, 6.5rem)", // 46 -> 104
      h1: "clamp(2.25rem, 1.7rem + 2.4cqw, 3.75rem)", // 36 -> 60
      h2: "clamp(1.9375rem, 1.45rem + 2.1cqw, 3rem)", // 31 -> 48
      h3: "clamp(1.3125rem, 1.2rem + 0.45cqw, 1.5rem)", // 21 -> 24
      lead: "clamp(1.1875rem, 1.1rem + 0.35cqw, 1.375rem)",
      measure: "70ch",
      measureHeading: "22ch",
    },
  },
  humanist: {
    leadingHeading: "1.2",
    leadingDisplay: "1.12",
    trackingDisplay: "-0.01em",
    weightHeading: "500",
    eyebrowTransform: "uppercase",
    trackingEyebrow: "0.05em",
    sizes: {
      display: "clamp(2.375rem, 1.458rem + 3.76cqw, 4.75rem)", // 38 -> 76
      h1: "clamp(1.9375rem, 1.55rem + 1.7cqw, 2.75rem)", // 31 -> 44
      h2: "clamp(1.625rem, 1.3rem + 1.4cqw, 2.25rem)", // 26 -> 36
      h3: "clamp(1.1875rem, 1.1rem + 0.3cqw, 1.3125rem)", // 19 -> 21
      lead: "clamp(1.125rem, 1.05rem + 0.3cqw, 1.25rem)", // 18 -> 20
      measure: "64ch",
      measureHeading: "24ch",
    },
  },
};

const RADIUS_REM: Record<ThemeTokens["radius"], string> = {
  sharp: "0rem",
  soft: "0.625rem",
  round: "1.1rem",
};

const DENSITY_SCALE: Record<ThemeTokens["density"], string> = {
  compact: "0.85",
  comfortable: "1",
  spacious: "1.18",
};

/** Fluid typographic scale, exposed as CSS vars consumed by the shared Heading /
 *  Body / Eyebrow components.
 *
 *  The fluid term is `cqw`, NEVER `vw`. `ThemeProvider` puts `@container`
 *  (`container-type: inline-size`) on the site root, so `cqw` measures the width
 *  the site is actually rendered into. `vw` measures the browser window, which
 *  is the same thing on a public site and a LIE everywhere the site is rendered
 *  into a narrower box: the editor's phone/tablet frame is a fixed-width `<div>`
 *  (`md:w-[390px]` in EditorCanvas), not an iframe, so with `vw` a "Mobil"
 *  preview on a 1440px screen rendered its H1 at the clamp max (48px) where the
 *  real phone gives 32.6px. "Preview == production" is a non-negotiable; these
 *  units are how it is kept. `scripts/design-audit.ts` (`site-viewport-unit`)
 *  flags any viewport unit that comes back into this file or the renderer tree.
 *
 *  Sizes are a single shared scale (fluid `clamp`, so
 *  the per-section `sm:` breakpoint jumps disappear); each size is multiplied by
 *  `--site-type-scale` (default 1 - a single future "large type" lever). Only the
 *  heading leading / tracking / weight vary, by font category. */
/** The multiplier behind each `typeScale` token. "large" is a deliberate, small
 *  step (+12.5%): enough to read as bigger text site-wide, small enough that no
 *  heading clamp overflows its section on mobile. */
const TYPE_SCALE_VALUE: Record<
  NonNullable<ThemeTokens["typeScale"]>,
  string
> = { normal: "1", large: "1.125" };

// ---------------------------------------------------------------------------
// Measured design overrides (`theme.customType` / `customLayout`).
//
// These carry raw CSS lengths from an imported site, so every value is
// re-validated here before it reaches a declaration — same posture as
// `SAFE_COLOR` for `customPalette` and `safeFamily` for `customFonts`. A value
// that does not match is dropped and the built-in one is used, so a bad or
// hostile bundle degrades to the preset design rather than injecting CSS.
// ---------------------------------------------------------------------------

/** A simple CSS length: optional sign, up to 4 integer digits, 3 decimals, and
 *  one of five units. Deliberately does NOT allow `calc()`, `var()`, functions,
 *  or multiple values — a measured computed style is always a single length, so
 *  nothing legitimate needs more, and this leaves no room for a payload.
 *
 *  `cqw`, not `vw`: an imported site that measured a fluid `vw` size would
 *  otherwise re-introduce the preview-fidelity bug through `customType` (see the
 *  type-scale comment above). A measured `vw` value is now rejected and the
 *  preset size is used instead. */
const SAFE_LENGTH = /^-?\d{1,4}(\.\d{1,3})?(px|rem|em|cqw|%)$/;

export function safeLength(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return SAFE_LENGTH.test(trimmed) ? trimmed : undefined;
}

/** A CSS font-weight: 1..1000, integers only.
 *
 *  Exported so the WRITE path (`lib/sections/themeDesign.ts`, the advanced
 *  editor's design panel) refuses exactly what this renderer would drop. A
 *  value stored here but rejected there is a knob that silently does nothing. */
export function safeWeight(value: number | undefined): string | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  return value >= 1 && value <= 1000 ? String(value) : undefined;
}

/** A unitless line-height ratio. Bounded so a measured outlier (or a hostile
 *  bundle) cannot produce a page kilometres tall. */
export function safeRatio(value: number | undefined): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value >= 0.5 && value <= 4 ? String(Number(value.toFixed(3))) : undefined;
}

const TRANSFORMS = new Set(["none", "uppercase", "lowercase", "capitalize"]);
function safeTransform(value: string | undefined): string | undefined {
  return value && TRANSFORMS.has(value) ? value : undefined;
}

/** Map a role's `family` choice onto the root family var. Unknown => undefined,
 *  so the role keeps the family it uses today. */
function familyVar(value: string | undefined): string | undefined {
  if (value === "heading") return "var(--site-font-heading)";
  if (value === "body") return "var(--site-font-body)";
  if (value === "display") return "var(--site-font-display)";
  return undefined;
}

/** Per-role defaults: the exact values each role renders with today, expressed
 *  once so the override layer can replace individual entries without any role
 *  silently changing. `leading` is omitted for the body-ish roles because their
 *  line-height is responsive (`--site-leading-body-mobile` / `-body`) and stays
 *  driven by those two vars. */
function roleDefaults(
  c: (typeof CATEGORY_TYPE)[FontCategory],
): Record<
  TypeRole,
  {
    leading?: string;
    weight: string;
    tracking: string;
    transform: string;
    family: string;
  }
> {
  const headingTransform = "var(--site-heading-transform, none)";
  const headingFamily = "var(--site-font-heading)";
  const bodyFamily = "var(--site-font-body)";
  const heading = {
    leading: c.leadingHeading,
    weight: c.weightHeading,
    tracking: "-0.01em",
    transform: headingTransform,
    family: headingFamily,
  };
  // Literal, never `var(--site-weight-body)`: the `body` ROLE emits that very
  // name, so a var() default would be self-referential and drop to
  // invalid-at-computed-value-time (i.e. inherited weight) on every paragraph.
  //
  // `0em` and NOT the `normal` keyword, for the same class of reason: the
  // primitives now read this var inside `calc(var(--site-tracking-body) +
  // var(--slot-tracking,0em))`, and `calc(normal + 0em)` is invalid. An invalid
  // declaration is discarded, and `letter-spacing` INHERITS — so every
  // paragraph on every published page silently took its ancestor's tracking
  // instead of resetting, and the slot tracking control was inert on body text.
  // `0em` is what `normal` computes to for these faces, so no page moves.
  // `safeLength` already rejects keywords, which means every emitted
  // `--site-tracking-<role>` is now a real length by construction.
  const bodyish = {
    weight: "400",
    tracking: "0em",
    transform: "none",
    family: bodyFamily,
  };
  return {
    display: {
      leading: c.leadingDisplay,
      weight: c.weightHeading,
      tracking: c.trackingDisplay,
      transform: headingTransform,
      family: headingFamily,
    },
    h1: heading,
    h2: heading,
    h3: { ...heading, leading: "1.4" },
    lead: bodyish,
    body: bodyish,
    sm: bodyish,
    eyebrow: {
      weight: "500", // = --site-weight-medium, inlined for the same reason
      tracking: c.trackingEyebrow,
      transform: c.eyebrowTransform,
      family: bodyFamily,
    },
    // The pull-quote's defaults are exactly the tokens the blockquote in
    // Testimonials.tsx used inline before it had a role: heading family, h2
    // size, medium weight, heading leading + tracking. Its transform is "none"
    // and NOT the headingCase token, because a caps-headings site never applied
    // caps to its quotes.
    quote: {
      leading: c.leadingHeading,
      weight: "500",
      tracking: "-0.01em",
      transform: "none",
      family: headingFamily,
    },
  };
}

/** The per-role `--site-{leading,weight,tracking,transform,family}-<role>` vars,
 *  each defaulting to the value that role renders with today and each
 *  individually replaceable by a measured `customType` entry. */
function roleVars(
  category: FontCategory,
  custom: ThemeTokens["customType"],
): Record<string, string> {
  const defaults = roleDefaults(CATEGORY_TYPE[category]);
  const out: Record<string, string> = {};
  for (const role of TYPE_ROLE_KEYS) {
    const d = defaults[role];
    const o: CustomTypeRole | undefined = custom?.[role];
    if (d.leading !== undefined) {
      out[`--site-leading-${role}`] = safeRatio(o?.lineHeight) ?? d.leading;
    }
    out[`--site-weight-${role}`] = safeWeight(o?.weight) ?? d.weight;
    out[`--site-tracking-${role}`] = safeLength(o?.tracking) ?? d.tracking;
    out[`--site-transform-${role}`] = safeTransform(o?.transform) ?? d.transform;
    out[`--site-family-${role}`] = familyVar(o?.family) ?? d.family;
    // A role's own ink, when the source page set one. Emitted ONLY when a
    // colour was measured and survived validation: each role's renderer falls
    // back to what it has always used (`currentColor` for a heading, the muted
    // token for an eyebrow or muted body), and those fallbacks differ. Pinning
    // an unmeasured role to `currentColor` — which this did until 2026-08-08 —
    // is not a no-op for the muted roles, so the var has to be ABSENT rather
    // than neutral for the `var(--x, fallback)` chain to mean anything.
    const ink = safeColor(o?.color);
    if (ink) out[`--site-ink-${role}`] = ink;
  }
  return out;
}

/** Section rhythm + container widths, from `customLayout`. Absent (or rejected)
 *  values fall back to the numbers below.
 *
 *  `default` and `wide` were 64rem/72rem (max-w-5xl / 6xl, the classes `Section`
 *  used before these were vars). On a large monitor that put a 1024px column of
 *  content in the middle of a 1920px screen with the rest empty — the site read
 *  as squeezed rather than as designed (owner directive 2026-08-12). They are
 *  now 90rem/100rem: 1440px for ordinary content, 1600px for the image-led
 *  bands that ask for `wide` (galleries, bento, photo grids).
 *
 *  `narrow` deliberately stays 48rem. It is the PROSE measure — the container a
 *  text band asks for so a paragraph does not run 200 characters wide — and
 *  widening it would make the one band that exists for readability less
 *  readable.
 *
 *  An imported site that measured its own container still wins over all three
 *  (`theme.customLayout`), so this changes generated sites, not imported ones. */
function layoutVars(custom: ThemeTokens["customLayout"]): Record<string, string> {
  const out: Record<string, string> = {
    "--site-py-base": safeLength(custom?.sectionPy) ?? "4.5rem",
    "--site-w-narrow": safeLength(custom?.containerNarrow) ?? "48rem",
    "--site-w-default": safeLength(custom?.containerDefault) ?? "64rem",
    "--site-w-wide": safeLength(custom?.containerWide) ?? "72rem",
  };
  // Only emitted when measured: unlike the four above there is no single
  // "today's value" to default to here - each band keeps its own gap.
  const gap = safeLength(custom?.gridGap);
  if (gap) out["--site-grid-gap"] = gap;
  return out;
}

/** The named curves `customMotion.easing` may select, as concrete CSS. A closed
 *  map, not a passthrough: the value is substituted into
 *  `animation-timing-function`, so a raw string would be an injection surface
 *  and nothing legitimate needs one. `power2-out` is GSAP's `power2.out`. */
const MOTION_EASING_CSS: Record<string, string> = {
  linear: "linear",
  "ease-out": "cubic-bezier(0, 0, 0.58, 1)",
  "power2-out": "cubic-bezier(0.215, 0.61, 0.355, 1)",
  "power3-out": "cubic-bezier(0.165, 0.84, 0.44, 1)",
  "expo-out": "cubic-bezier(0.19, 1, 0.22, 1)",
  "back-out": "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
};

/** A measured millisecond count, bounded. A source page that reported 90000
 *  (or a hostile bundle that says so) must clamp, not ship a minute-long fade. */
export function safeMs(
  value: number | undefined,
  min: number,
  max: number,
): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const clamped = Math.min(max, Math.max(min, Math.round(value)));
  return `${clamped}ms`;
}

/** A measured percentage 0..90, for where in a band's entry the reveal starts. */
export function safePercent(value: number | undefined): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value < 0 || value > 90) return undefined;
  return `${Number(value.toFixed(2))}%`;
}

/** Measured scroll/load motion (`theme.customMotion`) as CSS vars.
 *
 *  Returns an EMPTY object when nothing measured cleanly, which is the whole
 *  contract: every consuming declaration in app/globals.css reads these with
 *  today's value as its `var()` fallback, so a theme without `customMotion`
 *  (every hand-built site) emits exactly the vars it always did and renders
 *  exactly as it always did. Asserted in lib/sections/motionVars.test.ts. */
export function motionVars(
  custom: ThemeTokens["customMotion"],
): Record<string, string> {
  if (!custom) return {};
  const out: Record<string, string> = {};
  const y = safeLength(custom.enterY);
  if (y) out["--site-motion-y"] = y;
  // Blur swaps in a second keyframe set rather than adding `filter` to the one
  // every site uses: an always-declared filter (even `blur(0)`) makes the
  // element a containing block for `position: fixed` descendants, and turns a
  // composite-only reveal into one that rasterises. Opt-in, per imported site.
  const blur = safeLength(custom.enterBlur);
  if (blur) {
    out["--site-motion-blur"] = blur;
    out["--site-motion-anim"] = "site-reveal-in-blur";
  }
  const ease = custom.easing ? MOTION_EASING_CSS[custom.easing] : undefined;
  if (ease) out["--site-motion-ease"] = ease;
  // 80ms floor: below that a "duration" is a cut, and the source almost
  // certainly meant seconds. 3s ceiling: longer than any real page-load fade.
  const duration = safeMs(custom.duration, 80, 3000);
  if (duration) out["--site-motion-duration"] = duration;
  const stagger = safeMs(custom.stagger, 0, 600);
  if (stagger) out["--site-motion-stagger"] = stagger;
  const start = safePercent(custom.startAt);
  if (start) out["--site-motion-start"] = start;
  return out;
}

/** A section's measured parallax drift (`section.layout.parallax`) as the two
 *  vars `.site-parallax` reads. Returns undefined unless at least one axis
 *  survived `safeLength`, so a band with no parallax (every band today) gets no
 *  extra element and no extra declaration. */
export function parallaxVars(
  parallax: { x?: string; y?: string } | undefined,
): CSSProperties | undefined {
  const x = safeLength(parallax?.x);
  const y = safeLength(parallax?.y);
  if (!x && !y) return undefined;
  return {
    ...(x ? { "--site-parallax-x": x } : {}),
    ...(y ? { "--site-parallax-y": y } : {}),
  } as CSSProperties;
}

/** Whether this theme asks for a page-LOAD reveal on the first section. The
 *  scroll reveal cannot produce one: a band that is already in view at load has
 *  a completed view() progress, so it renders settled — which is why an
 *  imported hero arrived static while its source faded in. */
export function hasLoadReveal(tokens: ThemeTokens): boolean {
  return !!safeMs(tokens.customMotion?.duration, 80, 3000);
}

/** The measured hero photo-band clamp (see `customLayout.heroMinVh` /
 *  `heroMaxHeight`). Returns undefined unless BOTH ends measured cleanly and
 *  the hero has a usable image aspect — a half-specified band is worse than
 *  the text-sized default, because it changes the layout without matching the
 *  source either.
 *
 *  The middle term is `cqw`, for the same reason the type scale above uses it:
 *  `vw` measures the browser WINDOW, and the editor's device frame is a fixed-
 *  width `<div>`, not an iframe. On a 1440px screen the "Mobil" preview sized
 *  an imported hero's band from 1440px while the real phone gives 390px — the
 *  preview lying about the first thing on the page. `cqw` resolves against
 *  `ThemeProvider`'s `@container` root, so the frame and the phone agree. On a
 *  public site the root spans the viewport, so `cqw === vw` and nothing about
 *  the live page changes.
 *
 *  The `vh` floor stays: `@container` is `container-type: inline-size`, so
 *  there is no container HEIGHT unit to express it with (`cqh` would resolve
 *  against nothing). It is allowlisted in `scripts/design-audit.ts` for exactly
 *  that reason. `vh` over `svh` is also deliberate — the source rules these are
 *  measured from are written in `vh`. */
export function heroBandMinHeight(
  custom: ThemeTokens["customLayout"],
  media: { width: number; height: number } | null | undefined,
): string | undefined {
  const max = safeLength(custom?.heroMaxHeight);
  const minVh = custom?.heroMinVh;
  if (!max) return undefined;
  if (typeof minVh !== "number" || !(minVh > 0) || minVh > 100) return undefined;
  if (!media || !(media.width > 0) || !(media.height > 0)) return undefined;
  const ratio = Math.min(3, Math.max(0.2, media.height / media.width));
  return `clamp(${minVh}vh, calc(100cqw * ${ratio.toFixed(4)}), ${max})`;
}

/** One role's measured size: a plain length, or the full `clamp()` ramp when
 *  the import measured all three ends. `sizeFluid` must be container-relative
 *  (`cqw`) — a `vw` middle would re-introduce the preview-fidelity bug the
 *  type-scale comment above describes, so it is rejected and the ramp degrades
 *  to the single measured size rather than rendering something wrong. */
export function measuredSize(role: CustomTypeRole | undefined): string | undefined {
  const size = safeLength(role?.size);
  if (!size) return undefined;
  const min = safeLength(role?.sizeMin);
  const fluid = safeLength(role?.sizeFluid);
  if (!min || !fluid || !fluid.endsWith("cqw")) return size;
  return `clamp(${min}, ${fluid}, ${size})`;
}

function typeScaleVars(
  category: FontCategory,
  typeScale: ThemeTokens["typeScale"],
  custom?: ThemeTokens["customType"],
): CSSProperties {
  const c = CATEGORY_TYPE[category];
  const scale = (clamp: string) => `calc(var(--site-type-scale) * ${clamp})`;
  /** A measured size is an absolute length and must NOT be multiplied by
   *  `--site-type-scale`: the whole point is that it is the source page's own
   *  size. The scale keeps applying to every role that was not measured. */
  const size = (role: TypeRole, clamp: string) =>
    measuredSize(custom?.[role]) ?? scale(clamp);
  return {
    // Absent => "normal" (1), so sites stored before this lever keep their exact
    // current sizes without a migration.
    "--site-type-scale": TYPE_SCALE_VALUE[typeScale ?? "normal"],
    // Sizes come from the font category's own ramp (see `CategorySizes`), so
    // the typographic personality tracks the theme's fontPair instead of five
    // pairs sharing one metric scale.
    "--site-text-display": size("display", c.sizes.display),
    "--site-text-h1": size("h1", c.sizes.h1),
    "--site-text-h2": size("h2", c.sizes.h2),
    "--site-text-h3": size("h3", c.sizes.h3),
    "--site-text-lead": size("lead", c.sizes.lead),
    "--site-text-body": size("body", "1rem"),
    "--site-text-sm": size("sm", "0.875rem"),
    "--site-text-eyebrow": size("eyebrow", "0.8125rem"),
    // Same size as h2, which is what the pull-quote borrowed before it had a
    // role of its own.
    "--site-text-quote": size("quote", c.sizes.h2),
    // Reading measures. Deliberately NOT multiplied by `--site-type-scale`:
    // they are in `ch`, so they already grow with the text.
    "--site-measure": c.sizes.measure,
    "--site-measure-heading": c.sizes.measureHeading,
    // line-heights - body shared, heading/display per category
    "--site-leading-heading": c.leadingHeading,
    "--site-leading-snug": "1.4",
    // Body leading stays responsive (mobile 1.4 -> 1.6 at 768px). A measured
    // body line-height pins both, because the source page had one value.
    "--site-leading-body-mobile": safeRatio(custom?.body?.lineHeight) ?? "1.4",
    "--site-leading-body": safeRatio(custom?.body?.lineHeight) ?? "1.6",
    // weights
    "--site-weight-heading": c.weightHeading,
    "--site-weight-medium": "500",
    "--site-weight-body": "400",
    // tracking - display + eyebrow per category, heading shared
    "--site-tracking-heading": "-0.01em",
    "--site-eyebrow-transform": c.eyebrowTransform,
    // Per-role type. Each of these defaults to the shared value above, so a
    // theme with no `customType` emits the same numbers it always did; a
    // measured import replaces individual roles. Some reference vars declared
    // elsewhere on the same element (`--site-heading-transform`, set by
    // `rootChromeVars`) — custom properties resolve at computed-value time, so
    // declaration order between them does not matter.
    ...roleVars(category, custom),
  } as CSSProperties;
}

/** Spacing scale, scaled by density. Generalizes the section's one-off
 *  `--site-section-py: calc(4.5rem*var(--site-density))` so internal gaps and
 *  padding also breathe under "spacious" and tighten under "compact". The
 *  `calc()` references `--site-density` at CSS time, so it tracks density with
 *  no JS. Base unit 0.25rem mirrors Tailwind's scale for familiar values. */
function spacingVars(): CSSProperties {
  return {
    "--site-space-2xs": "calc(0.25rem * var(--site-density))",
    "--site-space-xs": "calc(0.375rem * var(--site-density))",
    "--site-space-sm": "calc(0.5rem * var(--site-density))",
    "--site-space-md": "calc(0.75rem * var(--site-density))",
    "--site-space-lg": "calc(1rem * var(--site-density))",
    "--site-space-xl": "calc(1.25rem * var(--site-density))",
    "--site-space-2xl": "calc(1.75rem * var(--site-density))",
    "--site-space-3xl": "calc(2.5rem * var(--site-density))",
  } as CSSProperties;
}

/** Resolve the concrete Surface for a section tone (light appearance). Kept for
 *  any caller that needs a single concrete surface; the renderer uses the
 *  appearance-aware indirection below. */
export function getToneSurface(
  tokens: ThemeTokens,
  tone: SectionTone,
): Surface {
  return appearanceToneSurfaces(tokens.palette, "light", tokens.customPalette)[tone];
}

/** Resolve the appearance ("light" | "dark" | "system"), defaulting to "light"
 *  for sites stored before the field existed. */
export function appearanceOf(tokens: ThemeTokens): Appearance {
  return tokens.appearance ?? "light";
}

// A single CSS colour value we are willing to emit into the scoped scheme
// <style>. Allows oklch()/rgb()/hsl()/hex and the "oklch(0 0 0 / 5%)" alpha
// form used by borders. Anything with CSS-breaking characters (`;{}<>`, quotes,
// url(), etc.) is rejected so an imported `customPalette` can't inject rules.
const SAFE_COLOR =
  /^(#[0-9a-fA-F]{3,8}|(oklch|rgba?|hsla?)\([0-9a-zA-Z.,%/\s-]+\))$/;

/** One measured colour we are willing to emit (a `customType` role's own ink).
 *  Same gate as `customPalette`: anything with CSS-breaking characters is
 *  dropped and the role inherits its section's text colour instead. */
export function safeColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return SAFE_COLOR.test(trimmed) ? trimmed : undefined;
}

/** A `customPalette` surface pair is trusted only if EVERY colour on both
 *  surfaces is a safe CSS colour token; otherwise we ignore it and fall back to
 *  the built-in palette (never render a half-sanitized custom palette). */
function safeCustomPalette(
  custom: { light: Surface; dark: Surface } | undefined,
): { light: Surface; dark: Surface } | undefined {
  if (!custom) return undefined;
  const ok = ([custom.light, custom.dark] as Surface[]).every((s) =>
    Object.values(s).every((v) => typeof v === "string" && SAFE_COLOR.test(v.trim())),
  );
  return ok ? custom : undefined;
}

/** The three tone surfaces (light / clear / dark) resolved for a given
 *  appearance. In a DARK site the base flips to the palette's dark surface and a
 *  "dark"-toned emphasis band becomes light (so it still reads as a contrast
 *  band). Both built-in surfaces are pre-validated AA. An optional `custom`
 *  palette (site import) is used verbatim when present AND fully sanitized. */
export function appearanceToneSurfaces(
  palette: ThemeTokens["palette"],
  appearance: "light" | "dark",
  custom?: { light: Surface; dark: Surface },
): Record<SectionTone, Surface> {
  const p = safeCustomPalette(custom) ?? PALETTES[palette];
  // `brand` does NOT flip with appearance. It is the site's colour, and a dark
  // site's coloured band is the same coloured band — flipping it would make the
  // one place the palette is visible disappear in dark mode. An imported custom
  // palette has no authored brand fill, so it falls back to the built-in
  // palette's; that keeps a brand band legible rather than dropping it.
  const brand = brandSurface(PALETTES[palette].brand);
  if (appearance === "dark") {
    return {
      light: p.dark, // base surface
      clear: { ...p.dark, bg: p.dark.muted, card: p.dark.bg }, // neutral dark step
      dark: p.light, // emphasis band → light, for contrast
      brand,
    };
  }
  return {
    light: p.light,
    clear: { ...p.light, bg: p.light.muted, card: p.light.bg },
    dark: p.dark,
    brand,
  };
}

/** CSS variables for a surface (applied to a Section element). */
export function surfaceVars(surface: Surface): CSSProperties {
  return {
    "--site-bg": surface.bg,
    "--site-fg": surface.fg,
    "--site-muted": surface.muted,
    "--site-muted-fg": surface.mutedFg,
    "--site-primary": surface.primary,
    "--site-primary-fg": surface.primaryFg,
    // primary used as TEXT (eyebrows, inline links). Same as --site-primary for
    // every palette whose primary is already AA on the page; palettes with a
    // LIGHT primary fill override it (see Surface.primaryText).
    "--site-primary-text": surface.primaryText ?? surface.primary,
    "--site-accent": surface.accent,
    "--site-accent-fg": surface.accentFg,
    "--site-border": surface.border,
    "--site-card": surface.card,
    "--site-card-fg": surface.cardFg,
    "--site-card-border": surface.cardBorder,
  } as CSSProperties;
}

// ---------------------------------------------------------------------------
// Appearance (light / dark / system) plumbing.
//
// Sections used to bake their tone surface into INLINE styles, which a
// `prefers-color-scheme` media query can't override - so "system" wouldn't work.
// Instead the site root emits ONE scoped <style> that defines, per tone, the
// surface vars (`--s-light-*`, `--s-clear-*`, `--s-dark-*`); each Section then
// sets `--site-*: var(--s-<tone>-*)` (still inline, but a reference). For
// "system" the root's <style> swaps those `--s-*` values under a dark media
// query, so every section + the root background follow the device - with zero
// runtime JS and identical output in editor / preview / public / snapshot.
// ---------------------------------------------------------------------------

const SURFACE_VARS: ReadonlyArray<readonly [keyof Surface, string]> = [
  ["bg", "bg"],
  ["fg", "fg"],
  ["muted", "muted"],
  ["mutedFg", "muted-fg"],
  ["primary", "primary"],
  ["primaryFg", "primary-fg"],
  ["accent", "accent"],
  ["accentFg", "accent-fg"],
  ["border", "border"],
  ["card", "card"],
  ["cardFg", "card-fg"],
  ["cardBorder", "card-border"],
  // `primaryText` is optional on a palette (it exists only where `primary` is a
  // light FILL and so cannot double as legible text); it falls back to
  // `primary`, exactly as the root var does. It has to be emitted PER TONE for
  // the same reason the button values are: an eyebrow or a link CTA on a
  // dark-tone band otherwise inherits the root's light-surface value, which is
  // a light-on-light text colour.
  ["primaryText", "primary-text"],
];

/** Emit `--<prefix>-<name>:<value>;` declarations for one surface. */
function surfaceCss(prefix: string, s: Surface): string {
  return SURFACE_VARS.map(
    ([k, name]) => `--${prefix}-${name}:${s[k] ?? s.primary};`,
  ).join("");
}

/** Concrete primary-button values for ONE surface. These must be emitted as
 *  literal colours per tone (never as `var(--site-primary)` references from
 *  the root): an inline custom property substitutes its var() references at
 *  the element that DECLARES it, so a root-declared `var(--site-primary)`
 *  freezes to the light surface's primary and every button on a dark band
 *  inherits light-surface colours - on slate/mono that meant a near-invisible
 *  dark button on a dark band (2026-07-16 benchmark). */
function buttonValues(
  surface: Pick<Surface, "primary" | "primaryFg">,
  buttonStyle: ThemeTokens["buttonStyle"],
): Record<string, string> {
  const style = normalizeButtonStyle(buttonStyle);
  const outline = style === "outline";
  const underline = style === "underline";
  return {
    "btn-bg": outline || underline ? "transparent" : surface.primary,
    "btn-fg": outline || underline ? surface.primary : surface.primaryFg,
    "btn-border": outline ? surface.primary : "transparent",
    // Solid darkens on hover; outline fills in; underline stays text-like.
    "btn-hover-bg": underline
      ? "transparent"
      : outline
        ? surface.primary
        : `color-mix(in oklch, ${surface.primary}, black 10%)`,
    "btn-hover-fg": underline
      ? surface.primary
      : surface.primaryFg,
    "btn-decoration": underline ? "underline" : "none",
    "btn-hover-shadow": underline ? "none" : "var(--site-shadow-xs)",
  };
}

/** Surface vars for content drawn ON a scrimmed photo (the hero overlay
 *  variants). The scrim is always dark and the copy is always white, but the
 *  section's TONE surface flips with the site appearance: in a dark site the
 *  "dark" tone resolves to the palette's LIGHT surface, so an outline/underline
 *  CTA took `--site-btn-fg: <dark ink>` and disappeared into the photo. Pinning
 *  the button + secondary tokens to on-media values keeps every buttonStyle
 *  readable in both appearances. Raw colours are allowed here: this file is a
 *  token definition (design rule 2). */
export function onMediaVars(
  buttonStyle: ThemeTokens["buttonStyle"],
): CSSProperties {
  const out: Record<string, string> = {
    "--site-fg": "#ffffff",
    "--site-primary": "#ffffff",
    "--site-primary-text": "#ffffff",
    "--site-muted-fg": "#ffffff",
    "--site-muted": "rgb(0 0 0 / 72%)",
    "--site-card": "rgb(0 0 0 / 72%)",
    "--site-card-fg": "#ffffff",
    "--site-border": "rgb(255 255 255 / 70%)",
    "--site-accent": "rgb(0 0 0 / 82%)",
    "--site-accent-fg": "#ffffff",
  };
  // Imported/measured typography may carry its own role ink. Photo overlays
  // are the one surface where those colours cannot remain authoritative: the
  // owner can replace the image at any time, so every text role uses the
  // contrast-safe on-media ink instead.
  for (const role of TYPE_ROLE_KEYS) out[`--site-ink-${role}`] = "#ffffff";
  for (const [name, value] of Object.entries(
    buttonValues({ primary: "#ffffff", primaryFg: "#111111" }, buttonStyle),
  )) {
    out[`--site-${name}`] = value;
  }
  return out as CSSProperties;
}

function buttonCss(
  prefix: string,
  surface: Surface,
  buttonStyle: ThemeTokens["buttonStyle"],
): string {
  return Object.entries(buttonValues(surface, buttonStyle))
    .map(([name, value]) => `--${prefix}-${name}:${value};`)
    .join("");
}

const BUTTON_VAR_NAMES = [
  "btn-bg",
  "btn-fg",
  "btn-border",
  "btn-hover-bg",
  "btn-hover-fg",
  "btn-decoration",
  "btn-hover-shadow",
] as const;

/** Section-level color vars, pointing each `--site-*` at the matching tone
 *  indirection var so the active appearance (incl. "system") decides the
 *  concrete value. Includes the button tokens: they carry concrete per-tone
 *  colours (see `buttonValues`), so a button on a dark band uses the dark
 *  surface's primary. */
export function sectionToneVars(tone: SectionTone): CSSProperties {
  const out: Record<string, string> = {};
  for (const [, name] of SURFACE_VARS) {
    out[`--site-${name}`] = `var(--s-${tone}-${name})`;
  }
  for (const name of BUTTON_VAR_NAMES) {
    out[`--site-${name}`] = `var(--s-${tone}-${name})`;
  }
  return out as CSSProperties;
}

/** The per-tone surface vars (`--s-*`) plus the base `--site-*` (= light tone)
 *  for one resolved appearance, as a single CSS declaration string. */
function schemeBlock(
  tones: Record<SectionTone, Surface>,
  buttonStyle: ThemeTokens["buttonStyle"],
): string {
  return (
    surfaceCss("s-light", tones.light) +
    surfaceCss("s-clear", tones.clear) +
    surfaceCss("s-dark", tones.dark) +
    surfaceCss("s-brand", tones.brand) +
    buttonCss("s-light", tones.light, buttonStyle) +
    buttonCss("s-clear", tones.clear, buttonStyle) +
    buttonCss("s-dark", tones.dark, buttonStyle) +
    // On a brand field the primary action is always a SOLID near-white plate.
    // `outline` and `underline` are legible choices on a neutral canvas and
    // near-invisible on a saturated one — a hairline outline on a blue band is
    // the page-builder default this whole surface exists to replace. The site's
    // buttonStyle is honoured everywhere else.
    buttonCss("s-brand", tones.brand, "solid") +
    // base surface used by the root element itself (sections override it)
    surfaceCss("site", tones.light) +
    buttonCss("site", tones.light, buttonStyle)
  );
}

/** The scoped stylesheet for a site root: defines the tone indirection vars for
 *  the chosen appearance. For "system" it defaults to light and swaps to dark
 *  under `prefers-color-scheme: dark`. Scoped by palette + scheme so multiple
 *  site roots on one page never bleed into each other. Values come only from our
 *  pre-validated palette constants - never user input - so it is injection-safe. */
/** Logo blend + halo rules scoped to a site root. Light sites keep multiply so
 *  near-white logo exports don't read as cards; dark sites drop multiply (it
 *  darkens marks into the surface) and add a soft halo so dark marks stay legible. */
export function logoTreatmentCss(sel: string, appearance: Appearance): string {
  const logo = `.${SITE_LOGO_CLASS}`;
  const lightRule = `${sel} ${logo}{mix-blend-mode:multiply}`;
  const darkRule = `${sel} ${logo}{mix-blend-mode:normal;filter:drop-shadow(0 0 1px oklch(1 0 0/.28))}`;
  if (appearance === "dark") return darkRule;
  if (appearance === "system") {
    return `${lightRule}@media (prefers-color-scheme:dark){${darkRule}}`;
  }
  return lightRule;
}

export function siteSchemeCss(tokens: ThemeTokens): string {
  const appearance = appearanceOf(tokens);
  const sel = `[data-site-root][data-site-pal="${tokens.palette}"][data-site-scheme="${appearance}"]`;
  return schemeCssForSelector(sel, tokens) + logoTreatmentCss(sel, appearance);
}

/** Same scoped scheme stylesheet as `siteSchemeCss`, but for an ARBITRARY
 *  selector — for standalone chrome that renders OUTSIDE the site root and so
 *  can't read the root's scoped vars (the cookie banner). Critically it keeps
 *  the "system" `prefers-color-scheme` swap, so a night-mode system site never
 *  shows a light banner (backlog 0303). Palette constants only — injection-safe. */
export function schemeCssForSelector(sel: string, tokens: ThemeTokens): string {
  const palette = tokens.palette;
  const custom = tokens.customPalette;
  const appearance = appearanceOf(tokens);
  if (appearance === "system") {
    const light = appearanceToneSurfaces(palette, "light", custom);
    const dark = appearanceToneSurfaces(palette, "dark", custom);
    return (
      `${sel}{${schemeBlock(light, tokens.buttonStyle)}}` +
      `@media (prefers-color-scheme:dark){${sel}{${schemeBlock(dark, tokens.buttonStyle)}}}`
    );
  }
  return `${sel}{${schemeBlock(appearanceToneSurfaces(palette, appearance, custom), tokens.buttonStyle)}}`;
}

/** Optional custom-font family names (already sanitized) overriding the
 *  fontPair-derived families for heading, body and/or display. `display` is the
 *  third role (hero headline, pull-quote); when absent it falls back to the
 *  heading family, so every existing two-font site is unchanged. */
export type CustomFontFamilies = {
  heading?: string;
  body?: string;
  display?: string;
};

/** A font-family name we are willing to place in a style value: letters,
 *  numbers, spaces and hyphens only (covers every real Google/Adobe family) so
 *  an imported `customFonts` value can't break out of the declaration. */
function safeFamily(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const trimmed = name.trim();
  return /^[A-Za-z0-9 -]{1,48}$/.test(trimmed) ? trimmed : undefined;
}

/** Wrap a sanitized custom family in quotes and append the built-in pair font
 *  as a fallback, so a failed font load never yields unstyled/invisible text. */
/** Tail appended to every site font stack so Arabic and Persian text has a
 *  DECIDED fallback instead of whatever the browser reaches for first.
 *
 *  Costs nothing: a font stack is consulted per CODEPOINT, so a Swedish site
 *  never touches these — its Latin glyphs are found in the families ahead of
 *  them — and no extra file is downloaded, because every name here is a font
 *  the reader's own device already has. Ordered by platform: Apple, then
 *  Windows, then the Noto families Android and most Linux ship.
 *
 *  This is a floor, not the answer. The site's chosen typeface is still Latin
 *  only, so an Arabic page is set in the system face and does not carry the
 *  brand's letterforms. Shipping a branded Arabic face means loading,
 *  subsetting and licensing one — see `docs/i18n-rtl.md`. */
const RTL_SYSTEM_FALLBACKS =
  '"SF Arabic", "Geeza Pro", "Segoe UI", "Noto Sans Arabic", "Noto Naskh Arabic", "Vazirmatn", "Tahoma"';

function fontStack(custom: string | undefined, fallback: string): string {
  const safe = safeFamily(custom);
  return safe ? `"${safe}", ${fallback}` : fallback;
}

/** A stack with the script fallbacks appended. Applied to the two ROOT roles
 *  only. The display role resolves through `--site-font-heading`, so it inherits
 *  the tail already — appending a second copy there would also have broken the
 *  "an unsafe display family falls back to exactly the heading var" guarantee
 *  that `measuredDesign.test.ts` pins, which is a sanitiser test, not cosmetics. */
const withScriptFallbacks = (stack: string): string =>
  `${stack}, ${RTL_SYSTEM_FALLBACKS}`;

/** Non-color root vars (fonts, radius, density, type + spacing scales). The site
 *  root applies these inline; its COLORS come from the scoped scheme stylesheet
 *  (`siteSchemeCss`) so "system" mode can swap them via a media query. */
export function rootChromeVars(
  tokens: ThemeTokens,
  customFonts?: CustomFontFamilies,
): CSSProperties {
  const fonts = FONT_PAIRS[tokens.fontPair];
  // Fall back to the theme's own imported fonts when a caller doesn't pass an
  // explicit override, so an imported site keeps its typefaces automatically.
  const cf = customFonts ?? tokens.customFonts;
  return {
    ...typeScaleVars(fonts.category, tokens.typeScale, tokens.customType),
    ...spacingVars(),
    ...layoutVars(tokens.customLayout),
    // Empty for every theme without `customMotion`, so the emitted var set is
    // unchanged for every site that has one measured (see `motionVars`).
    ...motionVars(tokens.customMotion),
    "--site-font-heading": withScriptFallbacks(fontStack(cf?.heading, fonts.heading)),
    "--site-font-body": withScriptFallbacks(fontStack(cf?.body, fonts.body)),
    // Third role. Falls back to the heading stack (not the pair's heading font)
    // so a site with no display face renders its display role exactly as before.
    "--site-font-display": cf?.display
      ? fontStack(cf.display, "var(--site-font-heading)")
      : "var(--site-font-heading)",
    // Always emitted (never conditional) so `Heading` can reference it without
    // a fallback dance: an undeclared custom property makes `text-transform`
    // invalid-at-computed-value-time, which inherits rather than resets.
    "--site-heading-transform":
      tokens.headingCase === "uppercase" ? "uppercase" : "none",
    // Section-heading alignment (`theme.headingAlign`), consumed by
    // `SectionHeading`. TWO vars for one token because a flex column needs both
    // axes and their "start" values are not the same word: `text-align: start`
    // is exactly what the block inherits today, while the neutral value for
    // `align-items` is `stretch` (what an unset flex container already uses) —
    // `align-items: start` would shrink-wrap every child and is NOT today's
    // rendering. Both are always emitted, for the same reason as the transform
    // above: an undeclared custom property makes the declaration
    // invalid-at-computed-value-time, which inherits rather than resets.
    "--site-heading-align":
      tokens.headingAlign === "center" ? "center" : "start",
    "--site-heading-items":
      tokens.headingAlign === "center" ? "center" : "stretch",
    "--site-radius": RADIUS_REM[tokens.radius],
    "--site-density": DENSITY_SCALE[tokens.density],
    // Radius owns roundness now — legacy `pill` no longer forces 9999px.
    "--site-btn-radius": "var(--site-radius)",
    // Primary-button COLOUR tokens live in the scoped scheme stylesheet
    // (`siteSchemeCss` → `buttonValues`) with concrete per-tone values, and
    // each Section maps `--site-btn-*` to its tone via `sectionToneVars`.
    // They are deliberately NOT declared here: an inline custom property
    // substitutes its var() references at the declaring element, so a
    // root-level `var(--site-primary)` would freeze to the light surface and
    // dark-band buttons would inherit light-surface colours (invisible on
    // slate/mono - caught in the 2026-07-16 rendered benchmark).
    // Elevation. Two levels only: xs for resting cards, md for true floating
    // layers (nav dropdowns, chat widget). Appearance-independent — the low
    // alpha reads as near-nothing on dark surfaces, which is the intent.
    "--site-shadow-xs": "0 1px 2px oklch(0 0 0 / 4%)",
    "--site-shadow-md":
      "0 4px 16px oklch(0 0 0 / 10%), 0 1px 3px oklch(0 0 0 / 6%)",
    fontFamily: "var(--site-font-body)",
  } as CSSProperties;
}

/** Root-level CSS variables for the whole site (chrome + a CONCRETE base
 *  surface). Used by standalone chrome that renders OUTSIDE the site root (e.g.
 *  the cookie banner) and therefore can't read the scoped scheme vars. The base
 *  surface is appearance-aware; "system" resolves to light here. */
export function rootThemeVars(
  tokens: ThemeTokens,
  customFonts?: CustomFontFamilies,
): CSSProperties {
  const appearance = appearanceOf(tokens);
  const base = appearanceToneSurfaces(
    tokens.palette,
    appearance === "dark" ? "dark" : "light",
    tokens.customPalette,
  ).light;
  const btn: Record<string, string> = {};
  for (const [name, value] of Object.entries(
    buttonValues(base, tokens.buttonStyle),
  )) {
    btn[`--site-${name}`] = value;
  }
  return {
    ...rootChromeVars(tokens, customFonts),
    ...surfaceVars(base),
    ...btn,
  } as CSSProperties;
}
