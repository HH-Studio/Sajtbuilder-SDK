// ---------------------------------------------------------------------------
// Curated Google Fonts allow-list. We deliberately do NOT expose the full
// catalog: a hand-picked set keeps choices tasteful, avoids needing the Google
// Fonts API key, and - crucially - lets the server build the stylesheet URL
// from a known family (raw client URLs are never trusted). Imported by both the
// editor picker UI and the server-side URL builder in convex/model/fonts.ts.
// ---------------------------------------------------------------------------

export type GoogleFontCategory = "sans" | "serif" | "display" | "mono";

export type GoogleFont = {
  /** Exact Google family name (also the CSS font-family). */
  family: string;
  /** Weights we request in the css2 URL by DEFAULT (kept small to limit
   *  payload - see `available` for why "small" still matters). */
  weights: number[];
  /** Every weight Google actually serves for this family. It is the allow-list
   *  a caller's requested weights are checked against, NOT what we request by
   *  default: a measured import that read the source at 300 can now ask for
   *  300 and get it, while every other site keeps the small default set.
   *
   *  Measured 2026-08-08 by probing `css2?family=X:wght@N` per family with a
   *  real browser UA and requiring `@font-face` in the response. The UA matters:
   *  a generic curl UA gets an HTML page back for every family, supported or
   *  not, which reads as a false negative across the board (backlog 1725 §7). */
  available: number[];
  category: GoogleFontCategory;
};

export const GOOGLE_FONTS: readonly GoogleFont[] = [
  // Sans
  { family: "Inter", weights: [400, 500, 700], available: [100, 200, 300, 400, 500, 600, 700, 800, 900], category: "sans" },
  { family: "Roboto", weights: [400, 500, 700], available: [100, 200, 300, 400, 500, 600, 700, 800, 900], category: "sans" },
  // 300 is deliberate and rare: a light cut is a real design choice on a hero
  // sub-heading, and a measured import that asks for weight 300 otherwise gets
  // 400 with no way to say so (annahedin.com sets its hero sub-heading in Open
  // Sans 300). Google serves these as one variable subset, so the extra weight
  // is not an extra FILE - but it is not free either, see the note below.
  { family: "Open Sans", weights: [300, 400, 600, 700], available: [300, 400, 500, 600, 700, 800], category: "sans" },
  { family: "Montserrat", weights: [400, 600, 700], available: [100, 200, 300, 400, 500, 600, 700, 800, 900], category: "sans" },
  { family: "Poppins", weights: [400, 500, 700], available: [100, 200, 300, 400, 500, 600, 700, 800, 900], category: "sans" },
  { family: "Lato", weights: [400, 700], available: [100, 300, 400, 700, 900], category: "sans" },
  { family: "Work Sans", weights: [400, 500, 700], available: [100, 200, 300, 400, 500, 600, 700, 800, 900], category: "sans" },
  { family: "Nunito", weights: [400, 600, 700], available: [200, 300, 400, 500, 600, 700, 800, 900], category: "sans" },
  { family: "Manrope", weights: [400, 600, 700], available: [200, 300, 400, 500, 600, 700, 800], category: "sans" },
  { family: "DM Sans", weights: [400, 500, 700], available: [100, 200, 300, 400, 500, 600, 700, 800, 900], category: "sans" },
  { family: "Plus Jakarta Sans", weights: [400, 600, 700], available: [200, 300, 400, 500, 600, 700, 800], category: "sans" },
  { family: "Figtree", weights: [400, 600, 700], available: [300, 400, 500, 600, 700, 800, 900], category: "sans" },
  { family: "Outfit", weights: [400, 600, 700], available: [100, 200, 300, 400, 500, 600, 700, 800, 900], category: "sans" },
  { family: "Sora", weights: [400, 600, 700], available: [100, 200, 300, 400, 500, 600, 700, 800], category: "sans" },
  { family: "Raleway", weights: [400, 600, 700], available: [100, 200, 300, 400, 500, 600, 700, 800, 900], category: "sans" },
  // Serif
  { family: "Playfair Display", weights: [400, 600, 700], available: [400, 500, 600, 700, 800, 900], category: "serif" },
  { family: "Merriweather", weights: [400, 700], available: [300, 400, 500, 600, 700, 800, 900], category: "serif" },
  { family: "Lora", weights: [400, 600, 700], available: [400, 500, 600, 700], category: "serif" },
  { family: "Source Serif 4", weights: [400, 600, 700], available: [200, 300, 400, 500, 600, 700, 800, 900], category: "serif" },
  { family: "Libre Baskerville", weights: [400, 700], available: [400, 500, 600, 700], category: "serif" },
  { family: "Cormorant Garamond", weights: [400, 600, 700], available: [300, 400, 500, 600, 700], category: "serif" },
  { family: "EB Garamond", weights: [400, 600, 700], available: [400, 500, 600, 700, 800], category: "serif" },
  { family: "Bitter", weights: [400, 600, 700], available: [100, 200, 300, 400, 500, 600, 700, 800, 900], category: "serif" },
  { family: "Fraunces", weights: [400, 600, 700], available: [100, 200, 300, 400, 500, 600, 700, 800, 900], category: "serif" },
  // Display
  { family: "Space Grotesk", weights: [400, 500, 700], available: [300, 400, 500, 600, 700], category: "display" },
  { family: "Bricolage Grotesque", weights: [400, 600, 700], available: [200, 300, 400, 500, 600, 700, 800], category: "display" },
  { family: "Archivo", weights: [400, 600, 700], available: [100, 200, 300, 400, 500, 600, 700, 800, 900], category: "display" },
  { family: "Syne", weights: [400, 600, 700], available: [400, 500, 600, 700, 800], category: "display" },
  // The one CONDENSED face, added 2026-08-08. Nothing in the other 29 is
  // narrower than normal width, so an imported site whose headings were set in
  // a condensed grotesk (DIN Condensed, Oswald, Bebas, Anton, United Sans — the
  // standard uppercase-heading look on an agency-built site) had no nearer
  // match than Inter, and came back visibly wider and quieter than its source.
  // Barlow Condensed rather than Oswald because DIN is what most of them
  // actually are, and Barlow's skeleton is the DIN one; Oswald is taller and
  // tighter. Weights probed 2026-08-08 with a browser UA, like the rest.
  { family: "Barlow Condensed", weights: [400, 500, 700], available: [100, 200, 300, 400, 500, 600, 700, 800, 900], category: "display" },
  // Mono
  { family: "JetBrains Mono", weights: [400, 500, 700], available: [100, 200, 300, 400, 500, 600, 700, 800], category: "mono" },
  { family: "Space Mono", weights: [400, 700], available: [400, 700], category: "mono" },
] as const;

// Why `weights` stays small even though `available` is wide (measured
// 2026-08-08, backlog 1725 §7):
//
// 28 of these 30 families are VARIABLE - asking for all nine weights instead of
// three fetches the exact same font files (Inter: 7 files either way), because
// Google points every weight at one variable file per unicode-range subset.
// Only Poppins (9 -> 27 files) and Lato (4 -> 10) are static.
//
// That made "widening is free" look true, and it is not. Google emits one
// @font-face block per weight PER SUBSET, so the STYLESHEET triples even when
// the files do not: Inter at 3 weights is 7.5 kB of render-blocking CSS, and at
// 9 weights it is 22.6 kB. Paying 15 kB on every customer site to serve weights
// almost none of them use is the wrong trade, which is why the fix is an
// allow-list a caller can reach into rather than a bigger default.

/** Look up a curated family by its exact name. */
export function findGoogleFont(family: string): GoogleFont | undefined {
  return GOOGLE_FONTS.find((f) => f.family === family);
}
