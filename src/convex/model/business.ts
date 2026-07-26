import { v } from "convex/values";

// ---------------------------------------------------------------------------
// Business taxonomy shared by onboarding, the generation engine, and schema.
// `vertical` drives which deterministic recipe + copy set is used. The
// onboarding UI shows plain-language labels (mapped in lib/i18n) but stores
// these stable keys.
// ---------------------------------------------------------------------------

export const VERTICALS = [
  "dentist",
  "clinic",
  "salon",
  "cleaning",
  "restaurant",
  "fitness",
  "handyman",
  "consultant",
  "coach",
  "therapist",
  "freelancer",
  "generic",
] as const;
export type Vertical = (typeof VERTICALS)[number];

export const GOALS = ["get_calls", "get_bookings", "show_services"] as const;
export type Goal = (typeof GOALS)[number];

// Onboarding's goal step is multi-select. Beyond the three engine `Goal`s it
// offers extras that shape the build (a gallery, a quote-request lead path) or
// just capture intent ("other"). These are deliberately kept OUT of `Goal` so
// publish gates, analytics, the AI context and MCP keep their stable
// three-value contract - the engine still runs on a single primary `goal`
// derived via primaryGoal(). `request_quote` is the "customer asks, you reply
// with an offer" intent (handyman/consultant): it ensures a contact/lead
// section exists so the "Skicka förfrågan" CTA has a target, without becoming
// a fourth engine goal.
export const EXTRA_GOALS = ["show_gallery", "request_quote", "other"] as const;
export const ONBOARDING_GOALS = [...GOALS, ...EXTRA_GOALS] as const;
export type OnboardingGoal = (typeof ONBOARDING_GOALS)[number];

// How the owner wants the business to be PERCEIVED - the one bounded
// positioning signal onboarding collects (optional, single-select chips).
// Drives the AI visual-style direction and the page copy register; never
// asked as a free-text branding exercise. Keys are internal; UI shows plain
// bilingual labels.
export const POSITIONINGS = [
  "familjar", // family-run, warm, personal
  "premium", // premium, exclusive, high-end
  "prisvard", // affordable, fast, straightforward
  "specialist", // specialist, expert, niche
] as const;
export type Positioning = (typeof POSITIONINGS)[number];

/** Model-facing descriptor per positioning (never shown to users). */
export const POSITIONING_HINTS: Record<Positioning, string> = {
  familjar: "family-run, warm and personal",
  premium: "premium, exclusive, high-end",
  prisvard: "affordable, quick and straightforward",
  specialist: "specialist, deep expertise, takes selected jobs",
};

/** Does this multi-select include the gallery emphasis? */
export const wantsGallery = (goals: readonly OnboardingGoal[] | undefined) =>
  goals?.includes("show_gallery") ?? false;
/** Does this multi-select ask for bookings (drives the booking section)? */
export const wantsBookings = (goals: readonly OnboardingGoal[] | undefined) =>
  goals?.includes("get_bookings") ?? false;
/** Does this multi-select ask to receive quote requests (ensures a contact/lead
 *  section so the "request an offer" CTA has somewhere to land)? */
export const wantsQuotes = (goals: readonly OnboardingGoal[] | undefined) =>
  goals?.includes("request_quote") ?? false;

/** Derive the single engine goal (hero CTA + recipe base) from a multi-select:
 *  the first selection that is a real engine `Goal`, else the fallback. */
export function primaryGoal(
  goals: readonly OnboardingGoal[] | undefined,
  fallback: Goal = "show_services",
): Goal {
  const found = goals?.find(
    (g): g is Goal => (GOALS as readonly string[]).includes(g),
  );
  return found ?? fallback;
}

export const LOCALES = ["sv", "en", "pl"] as const;
export type Locale = (typeof LOCALES)[number];

export const verticalValidator = v.union(...VERTICALS.map((k) => v.literal(k)));
export const goalValidator = v.union(...GOALS.map((k) => v.literal(k)));
export const onboardingGoalValidator = v.union(
  ...ONBOARDING_GOALS.map((k) => v.literal(k)),
);
export const positioningValidator = v.union(
  ...POSITIONINGS.map((k) => v.literal(k)),
);
export const localeValidator = v.union(...LOCALES.map((k) => v.literal(k)));

export const websiteStatusValidator = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("unpublished"),
);
