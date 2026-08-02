import type { ThemeTokens } from "../convex/model/theme";

// ---------------------------------------------------------------------------
// Pre-validated colour palettes. Each defines a LIGHT surface and a DARK
// surface (used by "dark"-tone sections). The "clear"/tinted tone is derived
// from the light surface's muted colour. Foreground/background pairs are chosen
// to comfortably pass WCAG AA, so the user can never produce a low-contrast
// site. Colours are oklch to match app/globals.css.
//
// Light canvases are never pure white: `bg` is a hue-matched off-white
// (L≈0.992, chroma ≈0.003-0.005 toward the palette hue) while `card` stays
// white, so cards separate from the page by FILL rather than by border. Keep
// that relationship when adding a palette.
// ---------------------------------------------------------------------------

export type Surface = {
  bg: string;
  fg: string;
  muted: string; // tinted surface background
  mutedFg: string;
  primary: string;
  primaryFg: string;
  /** `primary` used as TEXT on bg/card/muted. Defaults to `primary`; set it only
   *  when a palette's primary is a LIGHT fill (dark `primaryFg` on it), because
   *  one colour cannot be both a light fill and AA-legible text on white.
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

export type Palette = {
  key: ThemeTokens["palette"];
  label: { sv: string; en: string; pl: string };
  /** Plain-language name for the "clear" (muted) section background — the
   *  colour the band actually looks like (Grå, Ljusblå, …), not a metaphor
   *  like "Tydlig". Used by the Bakgrund picker so the label matches the
   *  swatch and the live section. */
  clearLabel: { sv: string; en: string; pl: string };
  light: Surface;
  dark: Surface;
};

export const PALETTES: Record<ThemeTokens["palette"], Palette> = {
  slate: {
    key: "slate",
    label: { sv: "Neutral", en: "Neutral", pl: "Neutralny" },
    clearLabel: { sv: "Grå", en: "Gray", pl: "Szary" },
    light: {
      bg: "oklch(0.992 0.003 264)",
      fg: "oklch(0.21 0.006 264)",
      muted: "oklch(0.968 0.004 264)",
      mutedFg: "oklch(0.49 0.008 264)",
      primary: "oklch(0.27 0.02 264)",
      primaryFg: "oklch(0.985 0 0)",
      accent: "oklch(0.95 0.006 264)",
      accentFg: "oklch(0.27 0.02 264)",
      border: "oklch(0.928 0.005 264)",
      card: "oklch(1 0 0)",
      cardFg: "oklch(0.21 0.006 264)",
      cardBorder: "oklch(0 0 0 / 5%)",
    },
    dark: {
      bg: "oklch(0.23 0.013 264)",
      fg: "oklch(0.97 0.003 264)",
      muted: "oklch(0.29 0.014 264)",
      mutedFg: "oklch(0.75 0.01 264)",
      primary: "oklch(0.97 0.003 264)",
      primaryFg: "oklch(0.23 0.013 264)",
      accent: "oklch(0.32 0.016 264)",
      accentFg: "oklch(0.97 0.003 264)",
      border: "oklch(1 0 0 / 12%)",
      card: "oklch(0.27 0.014 264)",
      cardFg: "oklch(0.97 0.003 264)",
      cardBorder: "oklch(1 0 0 / 10%)",
    },
  },
  ocean: {
    key: "ocean",
    label: { sv: "Blå", en: "Blue", pl: "Niebieski" },
    clearLabel: { sv: "Ljusblå", en: "Soft blue", pl: "Jasnoniebieski" },
    light: {
      bg: "oklch(0.992 0.003 235)",
      fg: "oklch(0.23 0.03 240)",
      muted: "oklch(0.965 0.012 235)",
      mutedFg: "oklch(0.48 0.03 240)",
      primary: "oklch(0.52 0.13 245)",
      primaryFg: "oklch(0.99 0 0)",
      accent: "oklch(0.94 0.025 235)",
      accentFg: "oklch(0.35 0.09 245)",
      border: "oklch(0.92 0.012 235)",
      card: "oklch(1 0 0)",
      cardFg: "oklch(0.23 0.03 240)",
      cardBorder: "oklch(0 0 0 / 5%)",
    },
    dark: {
      bg: "oklch(0.26 0.05 245)",
      fg: "oklch(0.97 0.01 235)",
      muted: "oklch(0.32 0.05 245)",
      mutedFg: "oklch(0.78 0.03 235)",
      primary: "oklch(0.7 0.12 240)",
      primaryFg: "oklch(0.18 0.04 245)",
      accent: "oklch(0.35 0.06 245)",
      accentFg: "oklch(0.97 0.01 235)",
      border: "oklch(1 0 0 / 14%)",
      card: "oklch(0.3 0.05 245)",
      cardFg: "oklch(0.97 0.01 235)",
      cardBorder: "oklch(1 0 0 / 10%)",
    },
  },
  forest: {
    key: "forest",
    label: { sv: "Natur", en: "Nature", pl: "Zielony" },
    clearLabel: { sv: "Ljusgrön", en: "Soft green", pl: "Jasnozielony" },
    light: {
      bg: "oklch(0.992 0.003 150)",
      fg: "oklch(0.24 0.03 150)",
      muted: "oklch(0.965 0.014 150)",
      mutedFg: "oklch(0.46 0.03 150)",
      primary: "oklch(0.5 0.1 152)",
      primaryFg: "oklch(0.99 0 0)",
      accent: "oklch(0.93 0.03 150)",
      accentFg: "oklch(0.34 0.08 152)",
      border: "oklch(0.92 0.014 150)",
      card: "oklch(1 0 0)",
      cardFg: "oklch(0.24 0.03 150)",
      cardBorder: "oklch(0 0 0 / 5%)",
    },
    dark: {
      bg: "oklch(0.26 0.04 152)",
      fg: "oklch(0.97 0.012 150)",
      muted: "oklch(0.31 0.04 152)",
      mutedFg: "oklch(0.78 0.025 150)",
      primary: "oklch(0.72 0.12 150)",
      primaryFg: "oklch(0.2 0.04 152)",
      accent: "oklch(0.34 0.05 152)",
      accentFg: "oklch(0.97 0.012 150)",
      border: "oklch(1 0 0 / 14%)",
      card: "oklch(0.3 0.04 152)",
      cardFg: "oklch(0.97 0.012 150)",
      cardBorder: "oklch(1 0 0 / 10%)",
    },
  },
  clay: {
    key: "clay",
    label: { sv: "Varm", en: "Warm", pl: "Ciepły" },
    clearLabel: { sv: "Beige", en: "Beige", pl: "Beżowy" },
    light: {
      bg: "oklch(0.992 0.004 50)",
      fg: "oklch(0.25 0.03 40)",
      muted: "oklch(0.97 0.015 50)",
      mutedFg: "oklch(0.48 0.035 40)",
      primary: "oklch(0.565 0.14 38)",
      // Marginal as text on the tinted `muted` surface (4.40:1). Nudged down for
      // text only; the fill is unchanged. 5.05 bg / 5.16 card / 4.70 muted.
      primaryText: "oklch(0.55 0.14 38)",
      primaryFg: "oklch(0.99 0 0)",
      accent: "oklch(0.94 0.03 50)",
      accentFg: "oklch(0.4 0.1 38)",
      border: "oklch(0.92 0.015 50)",
      card: "oklch(1 0 0)",
      cardFg: "oklch(0.25 0.03 40)",
      cardBorder: "oklch(0 0 0 / 5%)",
    },
    dark: {
      bg: "oklch(0.27 0.04 38)",
      fg: "oklch(0.97 0.012 50)",
      muted: "oklch(0.33 0.04 38)",
      mutedFg: "oklch(0.79 0.025 50)",
      primary: "oklch(0.72 0.13 40)",
      primaryFg: "oklch(0.2 0.04 38)",
      accent: "oklch(0.36 0.05 38)",
      accentFg: "oklch(0.97 0.012 50)",
      border: "oklch(1 0 0 / 14%)",
      card: "oklch(0.31 0.04 38)",
      cardFg: "oklch(0.97 0.012 50)",
      cardBorder: "oklch(1 0 0 / 10%)",
    },
  },
  sand: {
    key: "sand",
    label: { sv: "Sand", en: "Sand", pl: "Piaskowy" },
    clearLabel: { sv: "Sand", en: "Sand", pl: "Piaskowy" },
    light: {
      bg: "oklch(0.995 0.004 90)",
      fg: "oklch(0.26 0.012 70)",
      muted: "oklch(0.96 0.012 85)",
      mutedFg: "oklch(0.48 0.015 70)",
      primary: "oklch(0.44 0.04 70)",
      primaryFg: "oklch(0.98 0.004 90)",
      accent: "oklch(0.93 0.02 85)",
      accentFg: "oklch(0.35 0.03 70)",
      border: "oklch(0.9 0.012 85)",
      card: "oklch(1 0.003 90)",
      cardFg: "oklch(0.26 0.012 70)",
      cardBorder: "oklch(0 0 0 / 5%)",
    },
    dark: {
      bg: "oklch(0.27 0.012 70)",
      fg: "oklch(0.96 0.01 85)",
      muted: "oklch(0.32 0.012 70)",
      mutedFg: "oklch(0.78 0.012 85)",
      primary: "oklch(0.86 0.04 85)",
      primaryFg: "oklch(0.24 0.012 70)",
      accent: "oklch(0.35 0.014 70)",
      accentFg: "oklch(0.96 0.01 85)",
      border: "oklch(1 0 0 / 13%)",
      card: "oklch(0.31 0.012 70)",
      cardFg: "oklch(0.96 0.01 85)",
      cardBorder: "oklch(1 0 0 / 10%)",
    },
  },
  mono: {
    key: "mono",
    label: { sv: "Mörk", en: "Mono", pl: "Ciemny" },
    clearLabel: { sv: "Grå", en: "Gray", pl: "Szary" },
    light: {
      bg: "oklch(0.992 0 0)",
      fg: "oklch(0.18 0 0)",
      muted: "oklch(0.965 0 0)",
      mutedFg: "oklch(0.47 0 0)",
      primary: "oklch(0.18 0 0)",
      primaryFg: "oklch(0.99 0 0)",
      accent: "oklch(0.94 0 0)",
      accentFg: "oklch(0.18 0 0)",
      border: "oklch(0.91 0 0)",
      card: "oklch(1 0 0)",
      cardFg: "oklch(0.18 0 0)",
      cardBorder: "oklch(0 0 0 / 5%)",
    },
    dark: {
      bg: "oklch(0.16 0 0)",
      fg: "oklch(0.98 0 0)",
      muted: "oklch(0.24 0 0)",
      mutedFg: "oklch(0.72 0 0)",
      primary: "oklch(0.98 0 0)",
      primaryFg: "oklch(0.16 0 0)",
      accent: "oklch(0.28 0 0)",
      accentFg: "oklch(0.98 0 0)",
      border: "oklch(1 0 0 / 14%)",
      card: "oklch(0.2 0 0)",
      cardFg: "oklch(0.98 0 0)",
      cardBorder: "oklch(1 0 0 / 10%)",
    },
  },
  rose: {
    key: "rose",
    label: { sv: "Rosa", en: "Rose", pl: "Różowy" },
    clearLabel: { sv: "Rosa", en: "Soft rose", pl: "Różowy" },
    light: {
      bg: "oklch(0.992 0.004 10)",
      fg: "oklch(0.25 0.03 10)",
      muted: "oklch(0.97 0.015 10)",
      mutedFg: "oklch(0.48 0.035 10)",
      primary: "oklch(0.56 0.16 8)",
      primaryFg: "oklch(0.99 0 0)",
      accent: "oklch(0.94 0.03 10)",
      accentFg: "oklch(0.4 0.11 8)",
      border: "oklch(0.92 0.015 10)",
      card: "oklch(1 0 0)",
      cardFg: "oklch(0.25 0.03 10)",
      cardBorder: "oklch(0 0 0 / 5%)",
    },
    dark: {
      bg: "oklch(0.26 0.04 8)",
      fg: "oklch(0.97 0.012 10)",
      muted: "oklch(0.32 0.04 8)",
      mutedFg: "oklch(0.79 0.025 10)",
      primary: "oklch(0.74 0.14 10)",
      primaryFg: "oklch(0.2 0.04 8)",
      accent: "oklch(0.35 0.05 8)",
      accentFg: "oklch(0.97 0.012 10)",
      border: "oklch(1 0 0 / 14%)",
      card: "oklch(0.3 0.04 8)",
      cardFg: "oklch(0.97 0.012 10)",
      cardBorder: "oklch(1 0 0 / 10%)",
    },
  },
  // Sage sat in forest's hue family (h150-165 green) and read as "forest, but
  // weaker". It is now a gray-teal eucalyptus (h185-190) - calm, spa-like,
  // clearly its own note next to forest's saturated leaf green.
  sage: {
    key: "sage",
    label: { sv: "Salvia", en: "Sage", pl: "Szałwiowy" },
    clearLabel: { sv: "Salvia", en: "Soft sage", pl: "Szałwiowy" },
    light: {
      bg: "oklch(0.994 0.004 185)",
      fg: "oklch(0.25 0.02 195)",
      muted: "oklch(0.958 0.012 185)",
      mutedFg: "oklch(0.46 0.022 195)",
      primary: "oklch(0.47 0.065 190)",
      primaryFg: "oklch(0.99 0.004 185)",
      accent: "oklch(0.925 0.022 185)",
      accentFg: "oklch(0.34 0.05 192)",
      border: "oklch(0.9 0.012 185)",
      card: "oklch(1 0.003 185)",
      cardFg: "oklch(0.25 0.02 195)",
      cardBorder: "oklch(0 0 0 / 5%)",
    },
    dark: {
      bg: "oklch(0.26 0.022 195)",
      fg: "oklch(0.96 0.01 185)",
      muted: "oklch(0.31 0.024 195)",
      mutedFg: "oklch(0.78 0.018 185)",
      primary: "oklch(0.79 0.07 185)",
      primaryFg: "oklch(0.21 0.022 195)",
      accent: "oklch(0.34 0.028 195)",
      accentFg: "oklch(0.96 0.01 185)",
      border: "oklch(1 0 0 / 13%)",
      card: "oklch(0.3 0.022 195)",
      cardFg: "oklch(0.96 0.01 185)",
      cardBorder: "oklch(1 0 0 / 10%)",
    },
  },
  plum: {
    key: "plum",
    label: { sv: "Plommon", en: "Plum", pl: "Śliwkowy" },
    clearLabel: { sv: "Lila", en: "Soft plum", pl: "Liliowy" },
    light: {
      bg: "oklch(0.992 0.003 320)",
      fg: "oklch(0.24 0.04 320)",
      muted: "oklch(0.97 0.014 320)",
      mutedFg: "oklch(0.47 0.04 320)",
      primary: "oklch(0.46 0.13 322)",
      primaryFg: "oklch(0.99 0 0)",
      accent: "oklch(0.94 0.025 320)",
      accentFg: "oklch(0.36 0.09 322)",
      border: "oklch(0.92 0.014 320)",
      card: "oklch(1 0 0)",
      cardFg: "oklch(0.24 0.04 320)",
      cardBorder: "oklch(0 0 0 / 5%)",
    },
    dark: {
      bg: "oklch(0.25 0.05 322)",
      fg: "oklch(0.97 0.012 320)",
      muted: "oklch(0.31 0.05 322)",
      mutedFg: "oklch(0.79 0.025 320)",
      primary: "oklch(0.72 0.13 320)",
      primaryFg: "oklch(0.2 0.05 322)",
      accent: "oklch(0.34 0.06 322)",
      accentFg: "oklch(0.97 0.012 320)",
      border: "oklch(1 0 0 / 14%)",
      card: "oklch(0.29 0.05 322)",
      cardFg: "oklch(0.97 0.012 320)",
      cardBorder: "oklch(1 0 0 / 10%)",
    },
  },
  midnight: {
    key: "midnight",
    label: { sv: "Midnatt", en: "Midnight", pl: "Granatowy" },
    clearLabel: { sv: "Blågrå", en: "Soft navy", pl: "Granatowy" },
    light: {
      bg: "oklch(0.992 0.003 255)",
      fg: "oklch(0.22 0.03 260)",
      muted: "oklch(0.965 0.01 255)",
      mutedFg: "oklch(0.47 0.03 260)",
      primary: "oklch(0.38 0.1 262)",
      primaryFg: "oklch(0.99 0 0)",
      accent: "oklch(0.93 0.02 255)",
      accentFg: "oklch(0.32 0.08 262)",
      border: "oklch(0.92 0.01 255)",
      card: "oklch(1 0 0)",
      cardFg: "oklch(0.22 0.03 260)",
      cardBorder: "oklch(0 0 0 / 5%)",
    },
    dark: {
      bg: "oklch(0.21 0.04 262)",
      fg: "oklch(0.97 0.01 255)",
      muted: "oklch(0.27 0.04 262)",
      mutedFg: "oklch(0.77 0.02 255)",
      primary: "oklch(0.7 0.12 258)",
      primaryFg: "oklch(0.17 0.04 262)",
      accent: "oklch(0.3 0.05 262)",
      accentFg: "oklch(0.97 0.01 255)",
      border: "oklch(1 0 0 / 14%)",
      card: "oklch(0.25 0.04 262)",
      cardFg: "oklch(0.97 0.01 255)",
      cardBorder: "oklch(1 0 0 / 10%)",
    },
  },
  amber: {
    key: "amber",
    label: { sv: "Bärnsten", en: "Amber", pl: "Bursztynowy" },
    clearLabel: { sv: "Gulbeige", en: "Soft amber", pl: "Bursztynowy" },
    light: {
      bg: "oklch(0.995 0.005 85)",
      fg: "oklch(0.26 0.03 60)",
      muted: "oklch(0.965 0.015 80)",
      mutedFg: "oklch(0.48 0.035 60)",
      primary: "oklch(0.62 0.13 65)",
      primaryFg: "oklch(0.2 0.03 60)",
      // The light amber fill is only 3.71:1 on bg, so eyebrows/links get a
      // darkened amber instead (4.95:1 on bg, 5.02 on card, 4.62 on muted).
      // The fill itself is unchanged - buttons still look the same.
      primaryText: "oklch(0.55 0.13 65)",
      accent: "oklch(0.93 0.03 80)",
      accentFg: "oklch(0.38 0.09 60)",
      border: "oklch(0.9 0.015 80)",
      card: "oklch(1 0.003 85)",
      cardFg: "oklch(0.26 0.03 60)",
      cardBorder: "oklch(0 0 0 / 5%)",
    },
    dark: {
      bg: "oklch(0.26 0.03 55)",
      fg: "oklch(0.97 0.012 80)",
      muted: "oklch(0.32 0.03 55)",
      mutedFg: "oklch(0.79 0.025 80)",
      primary: "oklch(0.8 0.13 70)",
      primaryFg: "oklch(0.22 0.03 55)",
      accent: "oklch(0.35 0.04 55)",
      accentFg: "oklch(0.97 0.012 80)",
      border: "oklch(1 0 0 / 13%)",
      card: "oklch(0.3 0.03 55)",
      cardFg: "oklch(0.97 0.012 80)",
      cardBorder: "oklch(1 0 0 / 10%)",
    },
  },
};

export const PALETTE_LIST = Object.values(PALETTES);

/** Plain-language label for a section background tone. "clear" names the
 *  muted colour the band actually has on this palette (Grå, Ljusblå, …);
 *  light/dark stay Standard/Mörk. Custom palettes fall back to Soft/Mjuk. */
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
