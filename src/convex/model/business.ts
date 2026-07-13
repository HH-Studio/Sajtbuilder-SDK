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
  "freelancer",
  "generic",
] as const;
export type Vertical = (typeof VERTICALS)[number];

export const GOALS = ["get_calls", "get_bookings", "show_services"] as const;
export type Goal = (typeof GOALS)[number];

// Onboarding's goal step is multi-select. Beyond the three engine `Goal`s it
// offers extras that shape the build (a gallery) or just capture intent
// ("other"). These are deliberately kept OUT of `Goal` so publish gates,
// analytics, the AI context and MCP keep their stable three-value contract -
// the engine still runs on a single primary `goal` derived via primaryGoal().
export const EXTRA_GOALS = ["show_gallery", "other"] as const;
export const ONBOARDING_GOALS = [...GOALS, ...EXTRA_GOALS] as const;
export type OnboardingGoal = (typeof ONBOARDING_GOALS)[number];

/** Does this multi-select include the gallery emphasis? */
export const wantsGallery = (goals: readonly OnboardingGoal[] | undefined) =>
  goals?.includes("show_gallery") ?? false;
/** Does this multi-select ask for bookings (drives the booking section)? */
export const wantsBookings = (goals: readonly OnboardingGoal[] | undefined) =>
  goals?.includes("get_bookings") ?? false;

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
export const localeValidator = v.union(...LOCALES.map((k) => v.literal(k)));

export const websiteStatusValidator = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("unpublished"),
);
