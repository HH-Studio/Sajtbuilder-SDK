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
 *  variant ("Standard" / palette clearLabel e.g. "Grå" / "Mörk"). */
// `brand` is the palette's accent used as a FIELD — a whole band in the site's
// colour, with the primary action inverted to a near-white plate on it (see
// `BrandFill` in lib/palettes.ts). It is the fourth surface, not a fourth
// neutral: light/clear/dark are three steps of one canvas, brand is the colour.
// Widening a union is a safe Convex schema change (existing docs still
// validate); nothing writes it until a recipe or an owner picks it.
export const sectionToneValidator = v.union(
  v.literal("light"),
  v.literal("clear"),
  v.literal("dark"),
  v.literal("brand"),
);
export type SectionToneValue = Infer<typeof sectionToneValidator>;

/** Per-section scroll motion. "inherit" (and an absent field) follow the site's
 *  `theme.motion`; the other three override it for this one section - so an
 *  owner can calm a busy band or emphasise one without changing the whole site.
 *  Stored as an explicit "inherit" too, so turning an override OFF is a real
 *  write the editor can undo rather than a field deletion. */
export const sectionMotionValidator = v.union(
  v.literal("inherit"),
  v.literal("none"),
  v.literal("subtle"),
  v.literal("full"),
);
export type SectionMotionValue = Infer<typeof sectionMotionValidator>;

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
  /** This image carries no information: a background texture, a divider, a
   *  decorative flourish. An EMPTY alt is the correct accessible markup for
   *  one — a screen reader should skip it rather than announce it — so the
   *  publish gate's `image_missing_alt` warning is wrong here, and the renderer
   *  emits `alt=""` even where it would otherwise fall back to a person's or a
   *  brand's name.
   *
   *  Owner-set only. It is never inferred from the section type: `image` and
   *  `illustration` sections carry meaningful photos as often as decorative
   *  ones, and guessing would either silence a real defect or keep nagging
   *  about a real decoration (backlog 1940). Optional, so every existing
   *  document keeps validating on one deploy. */
  decorative: v.optional(v.boolean()),
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
  // "Ta betalt" for a canonical service (backlog 0025, Option B). Resolves to
  // the site's own /betala/<slug>/<serviceId> page, which starts the same
  // Stripe Connect checkout a product uses. A target rather than a bespoke
  // button so every services variant that already renders `item.cta` renders
  // this too - the alternative was a pay button hand-added to fifteen layouts.
  // The amount is NOT here: it lives on the item as `payAmount`, stamped at
  // publish, because a price belongs where the page can show it and a checkout
  // can verify it, not inside a link.
  v.object({ kind: v.literal("service-pay"), serviceId: v.id("services") }),
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

/** An owner-authored navigation link — one entry in the site header menu that
 *  is NOT one of the site's pages (an external profile, a phone number, the
 *  booking page…). Page entries stay derived from the `pages` table so a new
 *  page still shows up in the menu on its own; these are the extras. Reuses
 *  `ctaTarget` so a nav link can never be an unsafe or broken href.
 *
 *  `id` is a short client-generated string (not a Convex id): these live inline
 *  on the website row, and ordering (`websites.navOrder`) references them. */
export const navLink = v.object({
  id: v.string(),
  label: v.string(),
  target: ctaTarget,
});
export type NavLink = Infer<typeof navLink>;

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

/** One DATED exception to the weekly table — a holiday, a staff party, a day the
 *  kitchen opens late. `date` is an ISO `YYYY-MM-DD` calendar day, never a
 *  timestamp: an owner writes "24 December", not an instant, and the site's own
 *  timezone decides when that day is.
 *
 *  Same open/closed vocabulary as `openingDay` so one renderer prints both. This
 *  is a PROJECTION target: only the canonical restaurant facts write it today
 *  (see `restaurantHoursMaterialize`), which is why there is no inline editor
 *  for it — a section-local special day would be a second source of truth for
 *  the fact a guest is most likely to be burned by. */
export const openingSpecialDay = v.object({
  date: v.string(), // "2026-12-24"
  closed: v.boolean(),
  open: v.optional(v.string()),
  close: v.optional(v.string()),
  breaks: v.optional(
    v.array(v.object({ start: v.string(), end: v.string() })),
  ),
});
export type OpeningSpecialDay = Infer<typeof openingSpecialDay>;

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
  // Cadence between offered start times. Absent => `durationMin + bufferMin`
  // (the original behaviour). Set it to offer clean :00/:30 starts for a service
  // whose duration doesn't divide the hour (a 45-min service otherwise walks
  // 09:00 → 09:45 → 10:30 and never lands on the half hour).
  slotIntervalMin: v.optional(v.number()),
  closedDates: v.optional(v.array(v.string())), // per-service holidays override
  // Which resources (chairs/rooms/staff) can deliver this service, as ids into
  // the section's `resources` list (backlog 0952). Absent/empty => the whole
  // pool, which for a site with no resources is one implicit resource.
  resourceIds: v.optional(v.array(v.string())),
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
  // Cadence between offered start times (see bookingService.slotIntervalMin).
  slotIntervalMin: v.optional(v.number()),
  // How long BEFORE the appointment the customer reminder goes out. Absent => 24h;
  // 0 turns reminders off. A salon usually wants 2 - the no-show it prevents is
  // the same-day one - while a consultant may want 48.
  reminderHours: v.optional(v.number()),
  // How close to the appointment a customer may still cancel themselves. Absent
  // => 0 (any time before it starts). Inside the window the self-service page
  // refuses and points them at the business; outside it, a prepaid booking is
  // auto-refunded. Makes `cancellationPolicy` prose enforceable instead of
  // decorative.
  cancellationWindowHours: v.optional(v.number()),
  cancellationPolicy: v.optional(v.string()),
  confirmationMessage: v.optional(v.string()),
  // A private ICS feed URL from the owner's real calendar (Google, iCloud and
  // Outlook all publish one). Slots overlapping an event in that feed stop being
  // offered, so the site is no longer an availability island (backlog 0889).
  // Absent => no calendar is consulted, which is the default.
  //
  // Owner-supplied, so it is fetched ONLY through `lib/net/safeFetch.ts` and
  // never rendered as a link: it is a bearer-style secret URL, and anyone
  // holding it can read the owner's diary.
  busyFeedUrl: v.optional(v.string()),
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
    // The business's capacity units (backlog 0952) — how many appointments can
    // run at the same time, and when each unit works. Materialised from
    // `bookingResources` at publish. Absent/empty => one implicit resource,
    // which is every site that predates the feature.
    //
    // Deliberately UNNAMED in the snapshot: the snapshot is public, the widget
    // only needs "how many lanes and when does each one work", and a staff
    // roster is the business's own information. The owner-facing name lives in
    // the draft table.
    resources: v.optional(
      v.array(
        v.object({
          id: v.string(),
          availability: v.optional(v.array(openingDay)),
        }),
      ),
    ),
    availability: v.array(openingDay), // reuse the weekly opening-hours shape
    timezone: v.string(), // IANA, default "Europe/Stockholm"
    leadTimeHours: v.optional(v.number()), // earliest bookable lead time
    windowDays: v.optional(v.number()), // how far ahead bookings open
    bufferMin: v.optional(v.number()), // gap enforced between bookings
    slotIntervalMin: v.optional(v.number()), // cadence between offered starts
    cancellationWindowHours: v.optional(v.number()), // self-cancel cutoff
    // Where the appointment happens, materialised from the site's address at
    // publish. Shown on the confirmation page and written into the calendar
    // invite's LOCATION so the customer's calendar can navigate there.
    locationText: v.optional(v.string()),
    // How to reach the business when the calendar can't help — every slot taken,
    // or a week with no opening hours at all. Without these the widget's only
    // answer is "no open times", which turns a customer away at the exact moment
    // they were most ready to book. Materialised from the site's contact block.
    contactPhone: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
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

/** Layout and optional owner-written introduction for the synthesized `/news`
 * index. Optional at every storage boundary so existing sites keep the current
 * media grid without a migration. The intro is prose; locale overlays replace
 * it independently while `layout` stays structural. */
export const newsIndexLayoutValidator = v.union(
  v.literal("media-grid"),
  v.literal("editorial-cards"),
  v.literal("article-cards"),
);
export const NEWS_INDEX_INTRO_MAX = 280;
export const newsIndexConfigValidator = v.object({
  layout: newsIndexLayoutValidator,
  intro: v.optional(v.string()),
});
export type NewsIndexConfig = Infer<typeof newsIndexConfigValidator>;

/** Structural presentation for the synthesized `/careers` landing. Optional at
 * every storage boundary so existing sites keep the current card list without
 * a migration. Unlike copy, the layout is shared by every locale. */
export const careersIndexLayoutValidator = v.union(
  v.literal("cards"),
  v.literal("filter-list"),
);
export const careersIndexConfigValidator = v.object({
  layout: careersIndexLayoutValidator,
});
export type CareersIndexConfig = Infer<typeof careersIndexConfigValidator>;

// ---------------------------------------------------------------------------
// Rich text. Shared by `rich-text` (Textavsnitt) and `legal` (Juridisk text).
// The TS mirror of this shape, plus every helper that reads it, lives in
// lib/sections/richText.ts - keep the two in step.
// ---------------------------------------------------------------------------

/** A run of text carrying at most a bold flag and a link. Bold and link are the
 *  only marks on purpose: they are what an owner actually pastes out of Word,
 *  and every further mark is one more way to make a page look homemade. Colour,
 *  size and font stay with the theme, where they cannot be got wrong. */
export const inlineSpan = v.object({
  text: v.string(),
  bold: v.optional(v.boolean()),
  /** Sanitised by `safeLinkHref` before it is written, and again at render. */
  href: v.optional(v.string()),
});
export type InlineSpan = Infer<typeof inlineSpan>;

/** A block's text: a plain string, or runs once something in it is marked.
 *
 *  A union rather than a second `spans` field next to `text`: two fields have
 *  to be kept in sync by every writer (generation, AI, import, paste, the
 *  panel), and the day they drift the published page says one thing while
 *  search and SEO read another. It also means no migration - every string
 *  already in the database is still valid. */
export const blockText = v.union(v.string(), v.array(inlineSpan));
export type BlockText = Infer<typeof blockText>;

/** One block of long-form copy. `h` carries an optional level: 2 is "Rubrik",
 *  3 is "Underrubrik". There is deliberately no h1 - the page heading planner
 *  owns the single `<h1>` per page, and a block claiming one breaks it. */
export const richBlock = v.union(
  v.object({
    kind: v.literal("h"),
    level: v.optional(v.union(v.literal(2), v.literal(3))),
    text: blockText,
  }),
  v.object({ kind: v.literal("p"), text: blockText }),
  v.object({ kind: v.literal("quote"), text: blockText }),
  v.object({ kind: v.literal("ul"), items: v.array(blockText) }),
);
export type RichBlock = Infer<typeof richBlock>;
