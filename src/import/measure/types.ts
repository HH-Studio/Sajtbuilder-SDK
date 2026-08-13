import type { CustomTypeRole, ThemeTokens } from "../../convex/model/theme";

// ---------------------------------------------------------------------------
// The measured-design types a Site Kit author needs, mirrored from the app's
// `lib/import/designExtract.ts`.
//
// Only the TYPES are mirrored, not the extraction. Everything downstream of a
// measurement in the app - palette derivation, theme merging, section building
// - is the app's job, and a developer authoring a package by hand does not
// want any of it: they want the numbers, in the shape `site.json` accepts.
//
// Kept structurally identical to the app's definitions on purpose. If a role
// or a field is added there, it is added here in the same change, exactly like
// the other contract mirrors in this package (`lib/fonts/google.ts`,
// `convex/model/fontWeights.ts`).
// ---------------------------------------------------------------------------

/** The type roles an import can actually MEASURE off a source page. The theme
 *  carries eight; `sm` and `eyebrow` have no reliable source element, so they
 *  stay on the preset scale rather than being guessed. */
export type MeasuredRole = "display" | "h1" | "h2" | "h3" | "lead" | "body" | "quote";

/** One measured role. The theme's `customTypeRole` minus `family`, which is
 *  decided from the FONT roles rather than from the element. */
export type MeasuredTypeRole = Omit<CustomTypeRole, "family">;

/** One band of a source page as measured, plus the key it is matched by. */
export type MeasuredSectionSample = {
  /** The band's heading, whitespace-collapsed and lower-cased. */
  key: string;
  paddingTop?: string;
  paddingBottom?: string;
  maxWidth?: string;
  gap?: string;
  align?: "center" | "end";
};

/** What a real render reported about a page's painted design. Every field is
 *  optional; only the ones present override what an author stated. */
export type ComputedSample = {
  brandHex?: string;
  headingFont?: string;
  bodyFont?: string;
  sectionHeadingFont?: string;
  heroBackgroundImage?: boolean;
  type?: Partial<Record<MeasuredRole, MeasuredTypeRole>>;
  layout?: ThemeTokens["customLayout"];
  colors?: { bg?: string; fg?: string; mutedFg?: string; muted?: string };
  sections?: MeasuredSectionSample[];
};
