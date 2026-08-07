import type { ThemeTokens } from "../convex/model/theme";

// ---------------------------------------------------------------------------
// Pre-validated colour palettes.
//
// ## The model: one canvas, one ink, one accent
//
// Owner directive 2026-08-07, from a reference set of sites the owner judged
// polished (Legora, and two studio-built cleaning sites): a professional page is
// **one off-white canvas, one off-black ink, and a single accent used boldly in
// a few places** — a solid button, a link, and one full band or card field. It
// is NOT a different background colour per section, and it is not coloured type
// scattered down the page.
//
// Four rules follow, and every value below obeys them:
//
// 1. **`bg` is the whole page.** L≈0.978, chroma 0.002-0.004 toward the palette
//    hue. Never pure white — a raw `#fff` canvas is the single most reliable
//    "nobody chose this" signal — but never a *colour* either. `card` stays a
//    true white so a card separates from the page by FILL. That step used to be
//    0.8% (bg 0.992 vs card 1.0), i.e. invisible; it is 2.2% now, which is what
//    the comment here always claimed it was doing.
// 2. **`muted` is a NEUTRAL step, not a hue.** L≈0.95, chroma ≤0.004. It is both
//    the `clear` band background and the tile fill, so every drop of chroma in
//    it shows up as "a new background colour for this section". Palettes used to
//    carry up to 0.015 there, which is what made a five-band page read as five
//    different pages. The palette's identity lives in `primary` and `brand`,
//    where it can be bold, not smeared across every surface at 3% strength.
// 3. **A fill and a text colour are two different jobs.** `primary` is tuned to
//    carry white at AA as a FILL; `primaryText` is the darker cut used for
//    eyebrows and inline links. Splitting them is what lets the button be as
//    saturated as the reference sites without a 3.7:1 link.
// 4. **`brand` is the accent as a FIELD** — a whole band or a card in the
//    palette's colour, with the button on it inverted to a near-white plate.
//    One per page. This is the thing the reference sites all do and the
//    generator could not express at all: colour was a detail (a button, an
//    eyebrow) rather than a surface.
//
// ## Hue policy (owner directive 2026-08-07)
//
// Blue, green, teal and neutral only. **No brown, purple, pink or yellow.**
// Five palettes were re-cut in place to obey it — the KEYS are unchanged, so no
// stored theme, snapshot or schema moves, and no site loses its palette:
//
//   clay  terracotta → **Petrol** (deep teal)
//   sand  beige      → **Stone** (warm-neutral, near-zero chroma)
//   rose  pink       → **Steel** (cool blue-grey)
//   plum  aubergine  → **Ink** (near-black page, electric-blue accent)
//   amber gold       → **Moss** (deep olive green)
//
// Existing published sites re-render into the new cut. That is deliberate and
// was the owner's call: the old cut was the off-brand half of the catalogue.
//
// Colours are oklch to match app/globals.css. Foreground/background pairs are
// held to WCAG AA by `palettes.contrast.test.ts` — which enforces, rather than
// asserts: a value that fails there does not ship.
// ---------------------------------------------------------------------------

export type Surface = {
  bg: string;
  fg: string;
  muted: string; // tinted surface background
  mutedFg: string;
  primary: string;
  primaryFg: string;
  /** `primary` used as TEXT on bg/card/muted. Defaults to `primary`; set it
   *  whenever the fill is tuned brighter than AA text allows — which, under the
   *  "a fill and a text colour are two different jobs" rule above, is now most
   *  palettes rather than the exception.
   *  `palettes.contrast.test.ts` enforces >=4.5:1 for whatever ends up here. */
  primaryText?: string;
  accent: string; // subtle highlight background
  accentFg: string;
  border: string;
  card: string;
  cardFg: string;
  /** Card outline: translucent hairline (cards separate primarily by fill + shadow). */
  cardBorder: string;
};

/**
 * The palette's accent used as a FIELD — a whole band, or a card, filled with
 * the brand colour. Authored compactly (seven values) and expanded into a full
 * `Surface` by `brandSurface`, so a palette cannot get half of it right.
 *
 * The button inverts on purpose: on a saturated field the primary action is a
 * near-white plate with the brand colour as its label. A brand-coloured button
 * on a brand-coloured band is invisible, and an outline button on one is the
 * page-builder default.
 */
export type BrandFill = {
  /** The field itself. */
  bg: string;
  /** Ink on the field. */
  fg: string;
  /** Secondary ink on the field (a card's label line, a caption). */
  mutedFg: string;
  /** A panel sitting ON the field — one step, never a second colour. */
  panel: string;
  /** Hairline on the field. */
  border: string;
  /** The primary action on the field, and its label. */
  button: string;
  buttonFg: string;
};

export type Palette = {
  key: ThemeTokens["palette"];
  label: { sv: string; en: string; pl: string };
  /** Plain-language name for the "clear" (muted) section background. Under the
   *  neutral-step rule above this is a GREY on every palette, so the label says
   *  so — a swatch named "Ljusblå" over a neutral band was the picker lying
   *  about what it would render. */
  clearLabel: { sv: string; en: string; pl: string };
  light: Surface;
  dark: Surface;
  /** The accent as a field. See `BrandFill`. */
  brand: BrandFill;
};

/** Expand a `BrandFill` into the full surface the renderer consumes. */
export function brandSurface(b: BrandFill): Surface {
  return {
    bg: b.bg,
    fg: b.fg,
    muted: b.panel,
    mutedFg: b.mutedFg,
    primary: b.button,
    primaryFg: b.buttonFg,
    // An eyebrow or inline link on a brand field is the field's own ink, not a
    // third colour: the accent IS the background here.
    primaryText: b.fg,
    accent: b.panel,
    accentFg: b.fg,
    border: b.border,
    card: b.panel,
    cardFg: b.fg,
    cardBorder: b.border,
  };
}

export const PALETTES: Record<ThemeTokens["palette"], Palette> = {
  slate: {
    key: "slate",
    label: { sv: "Neutral", en: "Neutral", pl: "Neutralny" },
    clearLabel: { sv: "Grå", en: "Gray", pl: "Szary" },
    light: {
      bg: "oklch(0.978 0.003 264)",
      fg: "oklch(0.205 0.008 264)",
      muted: "oklch(0.95 0.004 264)",
      mutedFg: "oklch(0.44 0.01 264)",
      primary: "oklch(0.26 0.02 264)",
      primaryFg: "oklch(0.99 0 0)",
      accent: "oklch(0.93 0.006 264)",
      accentFg: "oklch(0.26 0.02 264)",
      border: "oklch(0.905 0.005 264)",
      card: "oklch(1 0 0)",
      cardFg: "oklch(0.205 0.008 264)",
      cardBorder: "oklch(0 0 0 / 6%)",
    },
    dark: {
      bg: "oklch(0.2 0.012 264)",
      fg: "oklch(0.97 0.003 264)",
      muted: "oklch(0.26 0.013 264)",
      mutedFg: "oklch(0.74 0.01 264)",
      primary: "oklch(0.97 0.003 264)",
      primaryFg: "oklch(0.2 0.012 264)",
      accent: "oklch(0.29 0.015 264)",
      accentFg: "oklch(0.97 0.003 264)",
      border: "oklch(1 0 0 / 13%)",
      card: "oklch(0.245 0.013 264)",
      cardFg: "oklch(0.97 0.003 264)",
      cardBorder: "oklch(1 0 0 / 10%)",
    },
    brand: {
      bg: "oklch(0.24 0.018 264)",
      fg: "oklch(0.98 0.003 264)",
      mutedFg: "oklch(0.79 0.008 264)",
      panel: "oklch(0.29 0.02 264)",
      border: "oklch(1 0 0 / 16%)",
      button: "oklch(0.99 0 0)",
      buttonFg: "oklch(0.22 0.018 264)",
    },
  },
  ocean: {
    key: "ocean",
    label: { sv: "Blå", en: "Blue", pl: "Niebieski" },
    clearLabel: { sv: "Grå", en: "Gray", pl: "Szary" },
    light: {
      bg: "oklch(0.978 0.003 250)",
      fg: "oklch(0.205 0.012 255)",
      muted: "oklch(0.95 0.004 250)",
      mutedFg: "oklch(0.44 0.014 255)",
      primary: "oklch(0.47 0.185 260)",
      primaryFg: "oklch(0.99 0 0)",
      primaryText: "oklch(0.44 0.17 260)",
      accent: "oklch(0.925 0.03 250)",
      accentFg: "oklch(0.33 0.13 260)",
      border: "oklch(0.905 0.006 250)",
      card: "oklch(1 0 0)",
      cardFg: "oklch(0.205 0.012 255)",
      cardBorder: "oklch(0 0 0 / 6%)",
    },
    dark: {
      bg: "oklch(0.21 0.028 258)",
      fg: "oklch(0.97 0.008 250)",
      muted: "oklch(0.27 0.03 258)",
      mutedFg: "oklch(0.75 0.02 250)",
      primary: "oklch(0.72 0.13 255)",
      primaryFg: "oklch(0.18 0.03 258)",
      accent: "oklch(0.3 0.04 258)",
      accentFg: "oklch(0.97 0.008 250)",
      border: "oklch(1 0 0 / 14%)",
      card: "oklch(0.25 0.03 258)",
      cardFg: "oklch(0.97 0.008 250)",
      cardBorder: "oklch(1 0 0 / 10%)",
    },
    // The reference blue, used the way the reference uses it: a whole card or
    // band filled solid, white type on it, and a white button plate.
    brand: {
      bg: "oklch(0.47 0.185 260)",
      fg: "oklch(0.99 0 0)",
      mutedFg: "oklch(0.9 0.05 255)",
      panel: "oklch(0.42 0.175 260)",
      border: "oklch(1 0 0 / 20%)",
      button: "oklch(0.99 0 0)",
      buttonFg: "oklch(0.4 0.16 260)",
    },
  },
  forest: {
    key: "forest",
    label: { sv: "Grön", en: "Green", pl: "Zielony" },
    clearLabel: { sv: "Grå", en: "Gray", pl: "Szary" },
    light: {
      bg: "oklch(0.978 0.003 155)",
      fg: "oklch(0.205 0.012 155)",
      muted: "oklch(0.95 0.004 155)",
      mutedFg: "oklch(0.44 0.014 155)",
      primary: "oklch(0.41 0.1 155)",
      primaryFg: "oklch(0.99 0 0)",
      accent: "oklch(0.925 0.03 155)",
      accentFg: "oklch(0.31 0.08 155)",
      border: "oklch(0.905 0.006 155)",
      card: "oklch(1 0 0)",
      cardFg: "oklch(0.205 0.012 155)",
      cardBorder: "oklch(0 0 0 / 6%)",
    },
    dark: {
      bg: "oklch(0.21 0.028 155)",
      fg: "oklch(0.97 0.008 155)",
      muted: "oklch(0.27 0.03 155)",
      mutedFg: "oklch(0.75 0.02 155)",
      primary: "oklch(0.74 0.13 152)",
      primaryFg: "oklch(0.18 0.03 155)",
      accent: "oklch(0.3 0.04 155)",
      accentFg: "oklch(0.97 0.008 155)",
      border: "oklch(1 0 0 / 14%)",
      card: "oklch(0.25 0.03 155)",
      cardFg: "oklch(0.97 0.008 155)",
      cardBorder: "oklch(1 0 0 / 10%)",
    },
    // The deep forest field the reference legal-tech site uses for its banner
    // and its one full-bleed section.
    brand: {
      bg: "oklch(0.34 0.085 155)",
      fg: "oklch(0.98 0.008 155)",
      mutedFg: "oklch(0.86 0.03 155)",
      panel: "oklch(0.29 0.075 155)",
      border: "oklch(1 0 0 / 18%)",
      button: "oklch(0.99 0 0)",
      buttonFg: "oklch(0.3 0.08 155)",
    },
  },
  // Was terracotta. Re-cut to a deep teal — the same "warm professional"
  // register without a brown page (owner directive 2026-08-07).
  clay: {
    key: "clay",
    label: { sv: "Petrol", en: "Petrol", pl: "Petrol" },
    clearLabel: { sv: "Grå", en: "Gray", pl: "Szary" },
    light: {
      bg: "oklch(0.978 0.003 205)",
      fg: "oklch(0.205 0.012 205)",
      muted: "oklch(0.95 0.004 205)",
      mutedFg: "oklch(0.44 0.014 205)",
      primary: "oklch(0.44 0.1 210)",
      primaryFg: "oklch(0.99 0 0)",
      accent: "oklch(0.925 0.03 205)",
      accentFg: "oklch(0.32 0.08 210)",
      border: "oklch(0.905 0.006 205)",
      card: "oklch(1 0 0)",
      cardFg: "oklch(0.205 0.012 205)",
      cardBorder: "oklch(0 0 0 / 6%)",
    },
    dark: {
      bg: "oklch(0.21 0.028 205)",
      fg: "oklch(0.97 0.008 205)",
      muted: "oklch(0.27 0.03 205)",
      mutedFg: "oklch(0.75 0.02 205)",
      primary: "oklch(0.76 0.1 200)",
      primaryFg: "oklch(0.18 0.03 205)",
      accent: "oklch(0.3 0.04 205)",
      accentFg: "oklch(0.97 0.008 205)",
      border: "oklch(1 0 0 / 14%)",
      card: "oklch(0.25 0.03 205)",
      cardFg: "oklch(0.97 0.008 205)",
      cardBorder: "oklch(1 0 0 / 10%)",
    },
    brand: {
      bg: "oklch(0.38 0.09 208)",
      fg: "oklch(0.98 0.008 205)",
      mutedFg: "oklch(0.87 0.03 205)",
      panel: "oklch(0.33 0.08 208)",
      border: "oklch(1 0 0 / 18%)",
      button: "oklch(0.99 0 0)",
      buttonFg: "oklch(0.33 0.085 208)",
    },
  },
  // Was beige. Re-cut to a true warm NEUTRAL: the warmth is a 0.004 cast on an
  // otherwise grey ramp, and the accent is the ink itself. A monochrome site
  // with a paper feel rather than a sand-coloured one.
  sand: {
    key: "sand",
    label: { sv: "Sten", en: "Stone", pl: "Kamień" },
    clearLabel: { sv: "Grå", en: "Gray", pl: "Szary" },
    light: {
      bg: "oklch(0.978 0.004 85)",
      fg: "oklch(0.205 0.008 75)",
      muted: "oklch(0.95 0.005 85)",
      mutedFg: "oklch(0.44 0.01 75)",
      primary: "oklch(0.27 0.014 75)",
      primaryFg: "oklch(0.99 0.003 85)",
      accent: "oklch(0.93 0.008 85)",
      accentFg: "oklch(0.27 0.014 75)",
      border: "oklch(0.905 0.006 85)",
      card: "oklch(1 0.002 85)",
      cardFg: "oklch(0.205 0.008 75)",
      cardBorder: "oklch(0 0 0 / 6%)",
    },
    dark: {
      bg: "oklch(0.2 0.008 75)",
      fg: "oklch(0.97 0.006 85)",
      muted: "oklch(0.26 0.009 75)",
      mutedFg: "oklch(0.74 0.008 85)",
      primary: "oklch(0.97 0.006 85)",
      primaryFg: "oklch(0.2 0.008 75)",
      accent: "oklch(0.29 0.01 75)",
      accentFg: "oklch(0.97 0.006 85)",
      border: "oklch(1 0 0 / 13%)",
      card: "oklch(0.245 0.009 75)",
      cardFg: "oklch(0.97 0.006 85)",
      cardBorder: "oklch(1 0 0 / 10%)",
    },
    brand: {
      bg: "oklch(0.25 0.012 75)",
      fg: "oklch(0.98 0.006 85)",
      mutedFg: "oklch(0.79 0.008 85)",
      panel: "oklch(0.3 0.014 75)",
      border: "oklch(1 0 0 / 16%)",
      button: "oklch(0.99 0.003 85)",
      buttonFg: "oklch(0.23 0.012 75)",
    },
  },
  mono: {
    key: "mono",
    label: { sv: "Monokrom", en: "Mono", pl: "Monochromatyczny" },
    clearLabel: { sv: "Grå", en: "Gray", pl: "Szary" },
    light: {
      bg: "oklch(0.978 0 0)",
      fg: "oklch(0.19 0 0)",
      muted: "oklch(0.95 0 0)",
      mutedFg: "oklch(0.44 0 0)",
      primary: "oklch(0.19 0 0)",
      primaryFg: "oklch(0.99 0 0)",
      accent: "oklch(0.93 0 0)",
      accentFg: "oklch(0.19 0 0)",
      border: "oklch(0.9 0 0)",
      card: "oklch(1 0 0)",
      cardFg: "oklch(0.19 0 0)",
      cardBorder: "oklch(0 0 0 / 6%)",
    },
    dark: {
      bg: "oklch(0.16 0 0)",
      fg: "oklch(0.98 0 0)",
      muted: "oklch(0.23 0 0)",
      mutedFg: "oklch(0.72 0 0)",
      primary: "oklch(0.98 0 0)",
      primaryFg: "oklch(0.16 0 0)",
      accent: "oklch(0.27 0 0)",
      accentFg: "oklch(0.98 0 0)",
      border: "oklch(1 0 0 / 14%)",
      card: "oklch(0.2 0 0)",
      cardFg: "oklch(0.98 0 0)",
      cardBorder: "oklch(1 0 0 / 10%)",
    },
    brand: {
      bg: "oklch(0.18 0 0)",
      fg: "oklch(0.98 0 0)",
      mutedFg: "oklch(0.78 0 0)",
      panel: "oklch(0.24 0 0)",
      border: "oklch(1 0 0 / 16%)",
      button: "oklch(0.99 0 0)",
      buttonFg: "oklch(0.18 0 0)",
    },
  },
  // Was pink. Re-cut to a cool blue-grey: quieter than `ocean`, and the palette
  // for a business that wants blue without the saturated blue field.
  rose: {
    key: "rose",
    label: { sv: "Stål", en: "Steel", pl: "Stalowy" },
    clearLabel: { sv: "Grå", en: "Gray", pl: "Szary" },
    light: {
      bg: "oklch(0.978 0.003 240)",
      fg: "oklch(0.205 0.014 245)",
      muted: "oklch(0.95 0.004 240)",
      mutedFg: "oklch(0.44 0.016 245)",
      primary: "oklch(0.44 0.075 245)",
      primaryFg: "oklch(0.99 0 0)",
      accent: "oklch(0.925 0.022 240)",
      accentFg: "oklch(0.32 0.06 245)",
      border: "oklch(0.905 0.006 240)",
      card: "oklch(1 0 0)",
      cardFg: "oklch(0.205 0.014 245)",
      cardBorder: "oklch(0 0 0 / 6%)",
    },
    dark: {
      bg: "oklch(0.21 0.025 245)",
      fg: "oklch(0.97 0.008 240)",
      muted: "oklch(0.27 0.026 245)",
      mutedFg: "oklch(0.75 0.016 240)",
      primary: "oklch(0.78 0.07 240)",
      primaryFg: "oklch(0.18 0.025 245)",
      accent: "oklch(0.3 0.03 245)",
      accentFg: "oklch(0.97 0.008 240)",
      border: "oklch(1 0 0 / 14%)",
      card: "oklch(0.25 0.026 245)",
      cardFg: "oklch(0.97 0.008 240)",
      cardBorder: "oklch(1 0 0 / 10%)",
    },
    brand: {
      bg: "oklch(0.38 0.07 245)",
      fg: "oklch(0.98 0.008 240)",
      mutedFg: "oklch(0.87 0.025 240)",
      panel: "oklch(0.33 0.062 245)",
      border: "oklch(1 0 0 / 18%)",
      button: "oklch(0.99 0 0)",
      buttonFg: "oklch(0.33 0.065 245)",
    },
  },
  sage: {
    key: "sage",
    label: { sv: "Salvia", en: "Sage", pl: "Szałwiowy" },
    clearLabel: { sv: "Grå", en: "Gray", pl: "Szary" },
    light: {
      bg: "oklch(0.978 0.003 185)",
      fg: "oklch(0.205 0.012 190)",
      muted: "oklch(0.95 0.004 185)",
      mutedFg: "oklch(0.44 0.014 190)",
      primary: "oklch(0.43 0.06 190)",
      primaryFg: "oklch(0.99 0.003 185)",
      accent: "oklch(0.925 0.022 185)",
      accentFg: "oklch(0.32 0.05 190)",
      border: "oklch(0.905 0.006 185)",
      card: "oklch(1 0.002 185)",
      cardFg: "oklch(0.205 0.012 190)",
      cardBorder: "oklch(0 0 0 / 6%)",
    },
    dark: {
      bg: "oklch(0.21 0.022 190)",
      fg: "oklch(0.96 0.008 185)",
      muted: "oklch(0.27 0.024 190)",
      mutedFg: "oklch(0.75 0.016 185)",
      primary: "oklch(0.8 0.07 185)",
      primaryFg: "oklch(0.19 0.022 190)",
      accent: "oklch(0.3 0.028 190)",
      accentFg: "oklch(0.96 0.008 185)",
      border: "oklch(1 0 0 / 13%)",
      card: "oklch(0.25 0.024 190)",
      cardFg: "oklch(0.96 0.008 185)",
      cardBorder: "oklch(1 0 0 / 10%)",
    },
    brand: {
      bg: "oklch(0.37 0.055 190)",
      fg: "oklch(0.98 0.008 185)",
      mutedFg: "oklch(0.87 0.02 185)",
      panel: "oklch(0.32 0.05 190)",
      border: "oklch(1 0 0 / 18%)",
      button: "oklch(0.99 0.003 185)",
      buttonFg: "oklch(0.32 0.05 190)",
    },
  },
  // Was aubergine. Re-cut to the owner's own description of what they wanted:
  // near-black page, one electric-blue splash. The accent is deliberately the
  // brightest in the catalogue BECAUSE it appears in so few places.
  plum: {
    key: "plum",
    label: { sv: "Bläck", en: "Ink", pl: "Atrament" },
    clearLabel: { sv: "Grå", en: "Gray", pl: "Szary" },
    light: {
      bg: "oklch(0.978 0.002 255)",
      fg: "oklch(0.19 0.008 258)",
      muted: "oklch(0.95 0.003 255)",
      mutedFg: "oklch(0.44 0.01 258)",
      primary: "oklch(0.47 0.2 262)",
      primaryFg: "oklch(0.99 0 0)",
      primaryText: "oklch(0.44 0.18 262)",
      accent: "oklch(0.93 0.028 255)",
      accentFg: "oklch(0.33 0.14 262)",
      border: "oklch(0.9 0.004 255)",
      card: "oklch(1 0 0)",
      cardFg: "oklch(0.19 0.008 258)",
      cardBorder: "oklch(0 0 0 / 6%)",
    },
    dark: {
      bg: "oklch(0.17 0.01 258)",
      fg: "oklch(0.97 0.004 255)",
      muted: "oklch(0.24 0.012 258)",
      mutedFg: "oklch(0.73 0.008 255)",
      primary: "oklch(0.72 0.15 262)",
      primaryFg: "oklch(0.16 0.01 258)",
      accent: "oklch(0.27 0.02 258)",
      accentFg: "oklch(0.97 0.004 255)",
      border: "oklch(1 0 0 / 14%)",
      card: "oklch(0.21 0.012 258)",
      cardFg: "oklch(0.97 0.004 255)",
      cardBorder: "oklch(1 0 0 / 10%)",
    },
    brand: {
      bg: "oklch(0.19 0.01 258)",
      fg: "oklch(0.98 0.004 255)",
      mutedFg: "oklch(0.78 0.008 255)",
      panel: "oklch(0.25 0.014 258)",
      border: "oklch(1 0 0 / 16%)",
      // The splash: on the ink field the primary action is the blue itself.
      button: "oklch(0.55 0.2 262)",
      buttonFg: "oklch(0.99 0 0)",
    },
  },
  midnight: {
    key: "midnight",
    label: { sv: "Marinblå", en: "Navy", pl: "Granatowy" },
    clearLabel: { sv: "Grå", en: "Gray", pl: "Szary" },
    light: {
      bg: "oklch(0.978 0.003 258)",
      fg: "oklch(0.2 0.014 262)",
      muted: "oklch(0.95 0.004 258)",
      mutedFg: "oklch(0.44 0.016 262)",
      primary: "oklch(0.36 0.1 262)",
      primaryFg: "oklch(0.99 0 0)",
      accent: "oklch(0.925 0.022 258)",
      accentFg: "oklch(0.3 0.08 262)",
      border: "oklch(0.905 0.006 258)",
      card: "oklch(1 0 0)",
      cardFg: "oklch(0.2 0.014 262)",
      cardBorder: "oklch(0 0 0 / 6%)",
    },
    dark: {
      bg: "oklch(0.19 0.032 262)",
      fg: "oklch(0.97 0.008 258)",
      muted: "oklch(0.25 0.034 262)",
      mutedFg: "oklch(0.74 0.016 258)",
      primary: "oklch(0.72 0.12 258)",
      primaryFg: "oklch(0.16 0.032 262)",
      accent: "oklch(0.28 0.04 262)",
      accentFg: "oklch(0.97 0.008 258)",
      border: "oklch(1 0 0 / 14%)",
      card: "oklch(0.23 0.034 262)",
      cardFg: "oklch(0.97 0.008 258)",
      cardBorder: "oklch(1 0 0 / 10%)",
    },
    brand: {
      bg: "oklch(0.3 0.09 262)",
      fg: "oklch(0.98 0.008 258)",
      mutedFg: "oklch(0.84 0.03 258)",
      panel: "oklch(0.25 0.08 262)",
      border: "oklch(1 0 0 / 18%)",
      button: "oklch(0.99 0 0)",
      buttonFg: "oklch(0.28 0.085 262)",
    },
  },
  // Was gold. Re-cut to a deep olive: the warm, earthy register the amber slot
  // was serving, in a hue that is allowed.
  amber: {
    key: "amber",
    label: { sv: "Mossa", en: "Moss", pl: "Mech" },
    clearLabel: { sv: "Grå", en: "Gray", pl: "Szary" },
    light: {
      bg: "oklch(0.978 0.004 130)",
      fg: "oklch(0.205 0.012 130)",
      muted: "oklch(0.95 0.005 130)",
      mutedFg: "oklch(0.44 0.014 130)",
      primary: "oklch(0.43 0.08 132)",
      primaryFg: "oklch(0.99 0 0)",
      accent: "oklch(0.925 0.028 130)",
      accentFg: "oklch(0.32 0.065 132)",
      border: "oklch(0.905 0.007 130)",
      card: "oklch(1 0.002 130)",
      cardFg: "oklch(0.205 0.012 130)",
      cardBorder: "oklch(0 0 0 / 6%)",
    },
    dark: {
      bg: "oklch(0.21 0.026 130)",
      fg: "oklch(0.97 0.008 130)",
      muted: "oklch(0.27 0.028 130)",
      mutedFg: "oklch(0.75 0.018 130)",
      primary: "oklch(0.79 0.1 130)",
      primaryFg: "oklch(0.18 0.026 130)",
      accent: "oklch(0.3 0.034 130)",
      accentFg: "oklch(0.97 0.008 130)",
      border: "oklch(1 0 0 / 13%)",
      card: "oklch(0.25 0.028 130)",
      cardFg: "oklch(0.97 0.008 130)",
      cardBorder: "oklch(1 0 0 / 10%)",
    },
    brand: {
      bg: "oklch(0.36 0.075 132)",
      fg: "oklch(0.98 0.008 130)",
      mutedFg: "oklch(0.86 0.028 130)",
      panel: "oklch(0.31 0.068 132)",
      border: "oklch(1 0 0 / 18%)",
      button: "oklch(0.99 0 0)",
      buttonFg: "oklch(0.31 0.07 132)",
    },
  },
  // -------------------------------------------------------------------------
  // Reference palettes, supplied verbatim by the owner on 2026-08-07 from their
  // shadcn / tweakcn token sets. Values are reproduced exactly EXCEPT where a
  // pair would ship failing contrast on a real customer's public website; each
  // of those is called out at the line, and there are only two kinds:
  //
  //  1. `mutedFg`. All three sets use the shadcn muted-foreground (L 0.55),
  //     which is ~3.3:1 on white — below AA for body text. It is body text
  //     here: intros, captions, contact lines. Darkened to the AA threshold,
  //     hue and chroma untouched.
  //  2. `primary` as a BUTTON FILL. #6468f0 and #3b82f6 each carry white at
  //     roughly 3.1-3.4:1, which is AA-Large only. Our buttons are 16px medium
  //     and the guard holds them to 4.5, so the fill steps down in lightness at
  //     the same hue and chroma. The reference colour survives untouched as the
  //     brand FIELD, where it is a background rather than a label backdrop.
  //
  // Everything else — canvas, ink, cards, borders, accents, the whole dark
  // scheme — is the reference value. Where a reference contradicts a house rule
  // rather than an accessibility floor (shadcn's pure-white canvas, its
  // card-equals-background) it is kept: the owner asked for these looks, not for
  // our reading of them.
  // -------------------------------------------------------------------------
  graphite: {
    key: "graphite",
    label: { sv: "Grafit", en: "Graphite", pl: "Grafitowy" },
    clearLabel: { sv: "Grå", en: "Gray", pl: "Szary" },
    light: {
      bg: "oklch(1 0 0)",
      fg: "oklch(0.145 0 0)",
      muted: "oklch(0.97 0 0)",
      // Reference: oklch(0.556 0 0) — 3.43:1 on white. Body text.
      mutedFg: "oklch(0.48 0 0)",
      primary: "oklch(0.205 0 0)",
      primaryFg: "oklch(0.985 0 0)",
      accent: "oklch(0.97 0 0)",
      accentFg: "oklch(0.205 0 0)",
      border: "oklch(0.922 0 0)",
      // Card equals background on purpose: this palette separates by BORDER,
      // which is the shadcn contract and the one place it departs from the
      // house rule that a card separates by fill.
      card: "oklch(1 0 0)",
      cardFg: "oklch(0.145 0 0)",
      cardBorder: "oklch(0.922 0 0)",
    },
    dark: {
      bg: "oklch(0.145 0 0)",
      fg: "oklch(0.985 0 0)",
      muted: "oklch(0.269 0 0)",
      mutedFg: "oklch(0.708 0 0)",
      primary: "oklch(0.922 0 0)",
      primaryFg: "oklch(0.205 0 0)",
      accent: "oklch(0.269 0 0)",
      accentFg: "oklch(0.985 0 0)",
      border: "oklch(1 0 0 / 10%)",
      card: "oklch(0.205 0 0)",
      cardFg: "oklch(0.985 0 0)",
      cardBorder: "oklch(1 0 0 / 10%)",
    },
    brand: {
      bg: "oklch(0.205 0 0)",
      fg: "oklch(0.985 0 0)",
      mutedFg: "oklch(0.79 0 0)",
      panel: "oklch(0.269 0 0)",
      border: "oklch(1 0 0 / 14%)",
      button: "oklch(0.985 0 0)",
      buttonFg: "oklch(0.205 0 0)",
    },
  },
  indigo: {
    key: "indigo",
    label: { sv: "Indigo", en: "Indigo", pl: "Indygo" },
    clearLabel: { sv: "Grå", en: "Gray", pl: "Szary" },
    light: {
      bg: "oklch(0.979 0 0)",
      fg: "oklch(0.28 0.041 260)",
      muted: "oklch(0.97 0 0)",
      // Reference: oklch(0.551 0.020 264) — 3.30:1 on the canvas. Body text.
      mutedFg: "oklch(0.475 0.022 264)",
      // Reference fill oklch(0.589 0.200 277) carries white at 3.28:1. Same
      // hue and chroma, stepped down until a 16px button label clears AA. The
      // reference violet is intact in `brand.bg` below.
      primary: "oklch(0.47 0.2 277)",
      primaryFg: "oklch(1 0 0)",
      accent: "oklch(0.93 0.031 274)",
      accentFg: "oklch(0.369 0.031 260)",
      border: "oklch(0.869 0.011 262)",
      card: "oklch(1 0 0)",
      cardFg: "oklch(0.28 0.041 260)",
      cardBorder: "oklch(0 0 0 / 6%)",
    },
    dark: {
      bg: "oklch(0.211 0.04 264)",
      fg: "oklch(0.93 0.01 262)",
      muted: "oklch(0.28 0.041 260)",
      mutedFg: "oklch(0.713 0.021 260)",
      primary: "oklch(0.681 0.16 277)",
      primaryFg: "oklch(0.18 0.04 264)",
      accent: "oklch(0.346 0.037 260)",
      accentFg: "oklch(0.93 0.01 262)",
      border: "oklch(1 0 0 / 14%)",
      card: "oklch(0.28 0.041 260)",
      cardFg: "oklch(0.93 0.01 262)",
      cardBorder: "oklch(1 0 0 / 10%)",
    },
    // The reference violet, exactly, as a field — where it is a background and
    // the white on it is a heading, not a 16px button label.
    brand: {
      bg: "oklch(0.5 0.2 277)",
      fg: "oklch(1 0 0)",
      mutedFg: "oklch(0.9 0.05 274)",
      panel: "oklch(0.44 0.19 277)",
      border: "oklch(1 0 0 / 22%)",
      button: "oklch(1 0 0)",
      buttonFg: "oklch(0.42 0.18 277)",
    },
  },
  azure: {
    key: "azure",
    label: { sv: "Klarblå", en: "Bright blue", pl: "Jasnoniebieski" },
    clearLabel: { sv: "Grå", en: "Gray", pl: "Szary" },
    light: {
      bg: "oklch(1 0 0)",
      fg: "oklch(0.321 0 0)",
      muted: "oklch(0.967 0.003 265)",
      // Reference: oklch(0.551 0.023 264) — 3.30:1 on white. Body text.
      mutedFg: "oklch(0.475 0.025 264)",
      // Reference fill oklch(0.623 0.188 260) — #3b82f6 — carries white at
      // 3.0:1. Same hue and chroma, stepped down to clear AA on a button. The
      // reference blue is intact in `brand.bg`.
      primary: "oklch(0.47 0.188 260)",
      primaryFg: "oklch(1 0 0)",
      accent: "oklch(0.951 0.025 237)",
      accentFg: "oklch(0.379 0.138 265)",
      border: "oklch(0.928 0.006 265)",
      card: "oklch(1 0 0)",
      cardFg: "oklch(0.321 0 0)",
      cardBorder: "oklch(0.928 0.006 265)",
    },
    dark: {
      bg: "oklch(0.205 0 0)",
      fg: "oklch(0.922 0 0)",
      muted: "oklch(0.269 0 0)",
      mutedFg: "oklch(0.715 0 0)",
      primary: "oklch(0.7 0.16 260)",
      primaryFg: "oklch(0.18 0 0)",
      accent: "oklch(0.379 0.138 265)",
      accentFg: "oklch(0.95 0 0)",
      border: "oklch(1 0 0 / 14%)",
      card: "oklch(0.269 0 0)",
      cardFg: "oklch(0.922 0 0)",
      cardBorder: "oklch(1 0 0 / 10%)",
    },
    brand: {
      bg: "oklch(0.5 0.19 260)",
      fg: "oklch(1 0 0)",
      mutedFg: "oklch(0.93 0.04 250)",
      panel: "oklch(0.47 0.185 260)",
      border: "oklch(1 0 0 / 22%)",
      button: "oklch(1 0 0)",
      buttonFg: "oklch(0.44 0.175 260)",
    },
  },
};

export const PALETTE_LIST = Object.values(PALETTES);

/** Plain-language label for a section background tone. Under the neutral-step
 *  rule (see the header) the "clear" band is a grey on every palette, so this
 *  now returns the same word everywhere — it is kept as a per-palette field so a
 *  future palette that genuinely tints its band can say so, and so custom
 *  (imported) palettes keep their fallback. */
export function clearToneLabel(
  palette: ThemeTokens["palette"],
): { sv: string; en: string; pl: string } {
  return (
    PALETTES[palette]?.clearLabel ?? {
      sv: "Mjuk",
      en: "Soft",
      pl: "Miękki",
    }
  );
}
