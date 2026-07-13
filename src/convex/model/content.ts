import { v, type Infer } from "convex/values";
import { SITE_ICON_KEYS } from "../../lib/sections/siteIcons";

/** Social / business profile links. Surfaced in the footer and as schema.org
 *  `sameAs` for SEO. All optional; stored at the website (site) level. */
export const socialsValidator = v.object({
  linkedin: v.optional(v.string()),
  facebook: v.optional(v.string()),
  instagram: v.optional(v.string()),
  google: v.optional(v.string()), // Google Business Profile
  x: v.optional(v.string()),
  youtube: v.optional(v.string()),
  tiktok: v.optional(v.string()),
});
export type Socials = Infer<typeof socialsValidator>;

/** Section surface tone - a separate, plain-language control from layout
 *  variant ("Standard" / "Tydlig" / "Mörk"). */
export const sectionToneValidator = v.union(
  v.literal("light"),
  v.literal("clear"),
  v.literal("dark"),
);
export type SectionToneValue = Infer<typeof sectionToneValidator>;

// ---------------------------------------------------------------------------
// Shared content building blocks. No raw HTML, no raw URLs, no executable
// content is ever stored. Links are typed `target` unions; icons are an
// allow-listed enum (`siteIconKey`, rendered from Tabler). This makes XSS
// impossible by construction - the renderer only ever maps these to React
// elements.
// ---------------------------------------------------------------------------

/** Allow-listed customer-site content icon. A stable semantic key from the
 *  frozen `SITE_ICON_KEYS` catalogue (see lib/sections/siteIcons.ts) - never a
 *  raw icon-library component name. Rejecting unknown keys at write time keeps
 *  stored content and immutable snapshots in lock-step with the renderer. */
export const siteIconKey = v.union(
  ...SITE_ICON_KEYS.map((key) => v.literal(key)),
);
export type SiteIconKeyValue = Infer<typeof siteIconKey>;

/** Reference to an uploaded image (assets table). Renderer resolves to a URL. */
export const assetRef = v.object({
  assetId: v.id("assets"),
  alt: v.string(), // accessibility - nudged non-empty in the editor
  // Focal point for object-position cropping (0..1). The only positioning
  // control a user gets; it cannot break layout.
  focalX: v.optional(v.number()),
  focalY: v.optional(v.number()),
});
export type AssetRef = Infer<typeof assetRef>;

/** A safe, typed call-to-action. The link target is a discriminated union so a
 *  user can never produce a broken or unsafe href. */
export const ctaTarget = v.union(
  v.object({ kind: v.literal("page"), pageSlug: v.string() }),
  v.object({ kind: v.literal("anchor"), anchorId: v.string() }),
  v.object({ kind: v.literal("phone"), value: v.string() }),
  v.object({ kind: v.literal("email"), value: v.string() }),
  v.object({ kind: v.literal("external"), url: v.string() }), // https-validated in app logic
  v.object({ kind: v.literal("booking") }),
);
export type CtaTarget = Infer<typeof ctaTarget>;

/** How a button looks. Defaults per slot (a section's primary CTA renders
 *  "primary", a secondary CTA renders "secondary"); an explicit value lets the
 *  owner override that on any individual button. Kept to the three pre-validated
 *  looks the renderer supports - no raw styling escapes into content. */
export const ctaStyle = v.union(
  v.literal("primary"),
  v.literal("secondary"),
  v.literal("ghost"),
);
export type CtaStyle = Infer<typeof ctaStyle>;

export const ctaRef = v.object({
  label: v.string(),
  target: ctaTarget,
  /** Optional per-button look. Absent = use the slot's default appearance. */
  style: v.optional(ctaStyle),
});
export type CtaRef = Infer<typeof ctaRef>;

/** One weekday's opening hours. */
export const openingDay = v.object({
  day: v.union(
    v.literal("mon"),
    v.literal("tue"),
    v.literal("wed"),
    v.literal("thu"),
    v.literal("fri"),
    v.literal("sat"),
    v.literal("sun"),
  ),
  closed: v.boolean(),
  open: v.optional(v.string()), // "09:00"
  close: v.optional(v.string()), // "17:00"
  // Intra-day closed windows (e.g. lunch). Each "HH:MM". Optional → absent = no
  // break (the original behaviour). Carved out of bookable slots by
  // computeDaySlots as a hard wall (no buffer padding). Applies to the shared
  // booking schedule AND any per-service availability override alike.
  breaks: v.optional(
    v.array(v.object({ start: v.string(), end: v.string() })),
  ),
});
export type OpeningDay = Infer<typeof openingDay>;

/** A form field definition (contact / lead-form / booking). Field types are an
 *  allow-list - no arbitrary input rendering. */
export const formField = v.object({
  key: v.string(),
  label: v.string(),
  type: v.union(
    v.literal("text"),
    v.literal("email"),
    v.literal("phone"),
    v.literal("textarea"),
    v.literal("select"),
  ),
  required: v.boolean(),
  options: v.optional(v.array(v.string())), // for select
  placeholder: v.optional(v.string()),
});
export type FormField = Infer<typeof formField>;

/** How a service is priced. Shared by the `services` table + the materialized
 *  snapshot service so the two never drift. */
export const priceModelValidator = v.union(
  v.literal("fixed"),
  v.literal("from"),
  v.literal("hourly"),
  v.literal("quote"),
);
export type PriceModel = Infer<typeof priceModelValidator>;

/** Whether a booking requires up-front payment. `none`/absent => pay later (the
 *  default). `deposit` => charge `depositAmount`; `full` => charge the price. */
export const paymentModeValidator = v.union(
  v.literal("none"),
  v.literal("deposit"),
  v.literal("full"),
);
export type PaymentMode = Infer<typeof paymentModeValidator>;

/** One bookable appointment type for the native booking engine. The lean inline
 *  shape kept for back-compat; Phase-S publish MATERIALIZES the canonical
 *  `services` row into the optional fields below so the engine reads everything
 *  from the snapshot (no live DB read). Every added field is optional → old
 *  snapshots validate unchanged and resolve to the section-level / default config. */
export const bookingService = v.object({
  id: v.string(),
  name: v.string(),
  durationMin: v.number(), // appointment length in minutes
  priceText: v.optional(v.string()), // display-only, e.g. "från 500 kr"
  // --- canonical link + per-service config (materialised at publish) ---------
  serviceId: v.optional(v.id("services")), // the canonical row this resolves from
  // Per-service OVERRIDES of the shared booking config; absent => inherit shared.
  availability: v.optional(v.array(openingDay)),
  timezone: v.optional(v.string()),
  leadTimeHours: v.optional(v.number()),
  windowDays: v.optional(v.number()),
  bufferMin: v.optional(v.number()),
  closedDates: v.optional(v.array(v.string())), // per-service holidays override
  // Questions asked at booking time - reuses the constrained lead-form allow-list.
  intake: v.optional(v.array(formField)),
  // Structured price (minor units) for online pay + invoice prefill.
  priceAmount: v.optional(v.number()),
  priceCurrency: v.optional(v.string()),
  priceModel: v.optional(priceModelValidator),
  // Up-front payment (Phase 5). `depositAmount` in minor units when mode=deposit.
  paymentMode: v.optional(paymentModeValidator),
  depositAmount: v.optional(v.number()),
  cancellationPolicy: v.optional(v.string()), // per-service override of shared
  confirmationMessage: v.optional(v.string()), // per-service override of shared
});
export type BookingService = Infer<typeof bookingService>;

/** A customer action a service (or section CTA) can expose. Booking is one of
 *  several - each maps to an existing `ctaTarget` (book→booking, call→phone,
 *  message→email, …) via `lib/actions/resolve.ts`. No new CTA primitive, and no
 *  separate CRM pipeline: the funnel rides the existing contacts timeline. */
export const serviceActionKind = v.union(
  v.literal("book"),
  v.literal("quote"),
  v.literal("call"),
  v.literal("message"),
  v.literal("pay"),
  v.literal("review"),
);
export type ServiceActionKind = Infer<typeof serviceActionKind>;

/** Shared "booking hours" for the native engine (websites.bookingConfig). ONE
 *  business schedule reused by every bookable service unless overridden. Defined
 *  here so the schema + the draft-snapshot (restore points) share one shape. */
export const bookingConfigValidator = v.object({
  availability: v.array(openingDay),
  closedDates: v.optional(v.array(v.string())),
  timezone: v.optional(v.string()),
  bufferMin: v.optional(v.number()),
  leadTimeHours: v.optional(v.number()),
  windowDays: v.optional(v.number()),
  cancellationPolicy: v.optional(v.string()),
  confirmationMessage: v.optional(v.string()),
});
export type BookingConfig = Infer<typeof bookingConfigValidator>;

/** How a booking section is fulfilled. Three mutually-exclusive sources:
 *  - `provider`: the owner pastes a booking link. Only the URL is stored (a
 *    plain string); the renderer DERIVES the provider and builds the iframe src
 *    or a "Book now" button - a raw iframe/script is never stored. This is the
 *    same constrained model the `video` section uses.
 *  - `embed`: an advanced widget snippet, rendered ONLY inside a sandboxed
 *    iframe (no same-origin access). This is the single, deliberately-contained
 *    exception to "no raw HTML"; it can never touch the site's session/DOM.
 *  - `native`: the built-in engine. Config (services + weekly availability)
 *    lives here and flows into the published snapshot; the bookings visitors
 *    make live in a separate runtime table and are never snapshotted. */
export const bookingSource = v.union(
  v.object({
    kind: v.literal("provider"),
    url: v.string(), // https-validated + provider-detected in the renderer
    ctaLabel: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal("embed"),
    html: v.string(), // rendered only inside a sandboxed iframe (size-capped)
  }),
  v.object({
    kind: v.literal("native"),
    services: v.array(bookingService),
    // Canonical-service references (Phase S). Optional + additive: legacy native
    // sources keep their inline `services`; new ones reference `services` rows
    // that publish materialises back into the inline list here, so booking
    // resolution still reads the snapshot unchanged.
    serviceIds: v.optional(v.array(v.id("services"))),
    availability: v.array(openingDay), // reuse the weekly opening-hours shape
    timezone: v.string(), // IANA, default "Europe/Stockholm"
    leadTimeHours: v.optional(v.number()), // earliest bookable lead time
    windowDays: v.optional(v.number()), // how far ahead bookings open
    bufferMin: v.optional(v.number()), // gap enforced between bookings
    // Resolved shared holiday/closed dates ("YYYY-MM-DD"), materialised from
    // websites.bookingConfig at publish. Optional → old snapshots have none.
    closedDates: v.optional(v.array(v.string())),
    // Whether the site can take payment at booking (Stripe connected at publish),
    // so the widget only shows the deposit/prepay UI when it's real.
    acceptsPayments: v.optional(v.boolean()),
    ctaLabel: v.optional(v.string()),
  }),
);
export type BookingSource = Infer<typeof bookingSource>;

/** An address used by location/contact sections and LocalBusiness JSON-LD. */
export const address = v.object({
  street: v.optional(v.string()),
  postalCode: v.optional(v.string()),
  city: v.optional(v.string()),
  country: v.optional(v.string()),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
});
export type Address = Infer<typeof address>;
