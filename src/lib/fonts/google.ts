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
  /** Weights we request in the css2 URL (kept small to limit payload). */
  weights: number[];
  category: GoogleFontCategory;
};

export const GOOGLE_FONTS: readonly GoogleFont[] = [
  // Sans
  { family: "Inter", weights: [400, 500, 700], category: "sans" },
  { family: "Roboto", weights: [400, 500, 700], category: "sans" },
  { family: "Open Sans", weights: [400, 600, 700], category: "sans" },
  { family: "Montserrat", weights: [400, 600, 700], category: "sans" },
  { family: "Poppins", weights: [400, 500, 700], category: "sans" },
  { family: "Lato", weights: [400, 700], category: "sans" },
  { family: "Work Sans", weights: [400, 500, 700], category: "sans" },
  { family: "Nunito", weights: [400, 600, 700], category: "sans" },
  { family: "Manrope", weights: [400, 600, 700], category: "sans" },
  { family: "DM Sans", weights: [400, 500, 700], category: "sans" },
  { family: "Plus Jakarta Sans", weights: [400, 600, 700], category: "sans" },
  { family: "Figtree", weights: [400, 600, 700], category: "sans" },
  { family: "Outfit", weights: [400, 600, 700], category: "sans" },
  { family: "Sora", weights: [400, 600, 700], category: "sans" },
  { family: "Raleway", weights: [400, 600, 700], category: "sans" },
  // Serif
  { family: "Playfair Display", weights: [400, 600, 700], category: "serif" },
  { family: "Merriweather", weights: [400, 700], category: "serif" },
  { family: "Lora", weights: [400, 600, 700], category: "serif" },
  { family: "Source Serif 4", weights: [400, 600, 700], category: "serif" },
  { family: "Libre Baskerville", weights: [400, 700], category: "serif" },
  { family: "Cormorant Garamond", weights: [400, 600, 700], category: "serif" },
  { family: "EB Garamond", weights: [400, 600, 700], category: "serif" },
  { family: "Bitter", weights: [400, 600, 700], category: "serif" },
  { family: "Fraunces", weights: [400, 600, 700], category: "serif" },
  // Display
  { family: "Space Grotesk", weights: [400, 500, 700], category: "display" },
  { family: "Bricolage Grotesque", weights: [400, 600, 700], category: "display" },
  { family: "Archivo", weights: [400, 600, 700], category: "display" },
  { family: "Syne", weights: [400, 600, 700], category: "display" },
  // Mono
  { family: "JetBrains Mono", weights: [400, 500, 700], category: "mono" },
  { family: "Space Mono", weights: [400, 700], category: "mono" },
] as const;

/** Look up a curated family by its exact name. */
export function findGoogleFont(family: string): GoogleFont | undefined {
  return GOOGLE_FONTS.find((f) => f.family === family);
}
