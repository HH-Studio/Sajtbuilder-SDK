import { v, type Infer } from "convex/values";

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

/**
 * Verticals whose ordinary contact form invites HEALTH information.
 *
 * A visitor writing "I need help with my back pain" into a free-text field on a
 * clinic's site has handed over special-category data under GDPR Art. 9, which
 * needs its own legal basis and is not covered by the ordinary "we answer your
 * enquiry" reasoning. Nothing detects it and nothing can - it is free text -
 * so the honest response is to TELL the owner, in the document that already
 * speaks for them (privacy/operations audit 2026-07-26, PRIV-11; backlog 1023).
 *
 * Deliberately narrow. Salon and fitness were considered and left out: a haircut
 * or a gym session is not health data, and a warning on every site is a warning
 * nobody reads.
 */
export const HEALTH_ADJACENT_VERTICALS: readonly Vertical[] = [
  "dentist",
  "clinic",
  "therapist",
];

export const isHealthAdjacentVertical = (v: string | undefined): boolean =>
  !!v && (HEALTH_ADJACENT_VERTICALS as readonly string[]).includes(v);

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

// ---------------------------------------------------------------------------
// Legal / payment identity — the fields an invoice prints as its ISSUER.
//
// Lives on `companies` (backlog 1460, owner decision 2026-07-29: all hemsidor
// inside one företag are one legal entity). `websites.invoicing` keeps the same
// shape as a LEGACY fallback for sites whose företag has not been backfilled;
// see `resolveInvoicingProfile` in convex/lib/invoicingProfile.ts for the one
// resolution rule. Shared here so the two tables and the write mutation can
// never drift apart field by field.
//
// NOT in here on purpose: `invoiceLastSeq` (the invoice series is per hemsida —
// merging it would collide numbers) and `businessInfo` name/address/phone/email
// (two shops of one company can legitimately have two phone numbers).
// ---------------------------------------------------------------------------
export const invoicingProfile = v.object({
  orgNumber: v.optional(v.string()), // organisationsnummer
  vatNumber: v.optional(v.string()), // momsreg.nr / EU VAT id
  fSkatt: v.optional(v.boolean()), // "Godkänd för F-skatt"
  bankgiro: v.optional(v.string()),
  iban: v.optional(v.string()),
  bic: v.optional(v.string()),
  swishNumber: v.optional(v.string()), // manual "betala med Swish" number
  paymentTermsDays: v.optional(v.number()), // default 30
  // Late-payment charges (backlog 0956). BOTH default to off: neither is
  // automatic in Sweden - a påminnelseavgift and dröjsmålsränta may only be
  // charged when the payment terms say so, and turning them on by default would
  // put a charge on invoices whose terms do not allow it.
  lateFeeMinor: v.optional(v.number()), // påminnelseavgift, öre (60 kr = 6000)
  // Total ANNUAL dröjsmålsränta in percent. The owner enters the total, not the
  // spread: räntelagen says referensränta + 8 pp, referensräntan is reset twice
  // a year by Riksbanken, and we have no feed for it — hardcoding a legal number
  // that changes is how this goes wrong (same reasoning as the ROT/RUT ceiling).
  lateInterestPercent: v.optional(v.number()),
  footer: v.optional(v.string()), // free-text legal/payment footer
  // Automatic customer chasing: overdue-invoice reminders and quote follow-ups.
  // Absent => ON, which is what the crons shipped as. Some owners chase by phone
  // and must be able to stop us emailing their customers on their behalf; the
  // manual "Påminn" button is unaffected.
  autoRemind: v.optional(v.boolean()),
});

export type InvoicingProfile = Infer<typeof invoicingProfile>;
