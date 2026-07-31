import { v, type Infer } from "convex/values";
import {
  assetRef,
  ctaRef,
  openingDay,
  formField,
  address,
  bookingSource,
  siteIconKey,
  richBlock,
} from "./content";

// ---------------------------------------------------------------------------
// Section content model. `sectionContent` is a discriminated union keyed by
// `type`. Convex validates every write against it, so malformed content can
// never reach the database - and therefore never reach a published snapshot.
// The TS type `SectionContent` is inferred from this, giving the renderer an
// exhaustive, fully-narrowed switch with no casts.
//
// `variant` (a plain-language layout choice) is NOT part of this union - it is
// stored as a string on the section row and validated against the per-type
// allow-list in lib/sections/registry.ts. Variants change layout, not the
// shape of content.
// ---------------------------------------------------------------------------

export const sectionContent = v.union(
  v.object({
    type: v.literal("hero"),
    eyebrow: v.optional(v.string()),
    headline: v.string(),
    subheadline: v.optional(v.string()),
    media: v.optional(assetRef),
    // A video for the hero, in EVERY layout: full-bleed behind the text in the
    // overlay variants, in the media box otherwise. Two mutually exclusive
    // sources - `bgVideo` is a self-hosted upload (kind:"video" asset),
    // `videoUrl` a YouTube/Vimeo link or a direct https URL to a custom-hosted
    // file (parsed by lib/sections/videoEmbed.ts; a raw iframe src is never
    // stored). `media` doubles as the poster + reduced-motion fallback.
    bgVideo: v.optional(assetRef),
    videoUrl: v.optional(v.string()),
    // Playback, owner-controlled. Absent = the muted autoplay loop without
    // controls that the overlay layouts shipped with. Autoplay only takes
    // effect while muted - every browser blocks autoplay with sound.
    videoAutoplay: v.optional(v.boolean()),
    videoMuted: v.optional(v.boolean()),
    videoControls: v.optional(v.boolean()),
    primaryCta: v.optional(ctaRef),
    secondaryCta: v.optional(ctaRef),
  }),

  v.object({
    type: v.literal("services"),
    heading: v.string(),
    intro: v.optional(v.string()),
    items: v.array(
      v.object({
        title: v.string(),
        description: v.string(),
        // Optional owner-entered display price from the canonical services menu.
        // Kept as text because services can be "from", hourly, or quote-only.
        priceText: v.optional(v.string()),
        icon: v.optional(siteIconKey),
        media: v.optional(assetRef),
        cta: v.optional(ctaRef),
        // Phase S: optional link to a canonical `services` row. Additive - manual
        // items omit it; the editor/publish use it to keep one source of truth.
        serviceId: v.optional(v.id("services")),
        // Optional grouping label ("Förrätter", "Take away", "Catering"),
        // mirrored from `services.category`. The renderer prints a subheading
        // before each contiguous run that shares one - which is how a restaurant
        // separates a menu from its catering, or eat-in prices from takeaway,
        // without a second content model. Absent => no subheading.
        category: v.optional(v.string()),
      }),
    ),
    // Phase S: where the published items come from. Absent or `manual` = author
    // the items inline (today's behaviour, zero migration). `table` = resolved
    // from the `services` table at publish into `items` (renderer + SEO unchanged).
    source: v.optional(
      v.union(
        v.object({ kind: v.literal("manual") }),
        v.object({
          kind: v.literal("table"),
          serviceIds: v.union(v.array(v.id("services")), v.literal("all")),
        }),
      ),
    ),
    // "icon-grid-cta" variant only - a call-to-action row under the grid.
    footerCta: v.optional(ctaRef),
  }),

  v.object({
    type: v.literal("service-detail"),
    title: v.string(),
    body: v.string(),
    bullets: v.optional(v.array(v.string())),
    media: v.optional(assetRef),
    cta: v.optional(ctaRef),
  }),

  v.object({
    type: v.literal("about"),
    heading: v.string(),
    body: v.string(),
    media: v.optional(assetRef),
    signatureName: v.optional(v.string()),
  }),

  v.object({
    type: v.literal("team"),
    heading: v.string(),
    intro: v.optional(v.string()),
    members: v.array(
      v.object({
        name: v.string(),
        role: v.optional(v.string()),
        photo: v.optional(assetRef),
        bio: v.optional(v.string()),
      }),
    ),
    // "grid-cta" variant only - a trailing "we're hiring"-style CTA band.
    footerHeading: v.optional(v.string()),
    footerDescription: v.optional(v.string()),
    footerCta: v.optional(ctaRef),
  }),

  v.object({
    type: v.literal("testimonials"),
    heading: v.optional(v.string()),
    quotes: v.array(
      v.object({
        text: v.string(),
        author: v.string(),
        role: v.optional(v.string()),
        rating: v.optional(v.number()), // 1..5
        avatar: v.optional(assetRef),
        // Set ONLY when the quote arrived through the public /recension
        // submission path (convex/reviews.ts publishReview). Owner-typed
        // quotes never carry it. Structured-data review markup is gated on
        // this - see lib/seo/jsonld.ts collectReviews (backlog 0536).
        verifiedAt: v.optional(v.number()),
      }),
    ),
  }),

  v.object({
    type: v.literal("gallery"),
    heading: v.optional(v.string()),
    images: v.array(assetRef), // capped (≤24) in the editor
  }),

  v.object({
    type: v.literal("before-after"),
    heading: v.optional(v.string()),
    pairs: v.array(
      v.object({
        before: assetRef,
        after: assetRef,
        label: v.optional(v.string()),
      }),
    ),
  }),

  v.object({
    type: v.literal("pricing"),
    heading: v.string(),
    intro: v.optional(v.string()),
    /** @see rich-text's `eyebrow` */
    eyebrow: v.optional(v.string()),
    currency: v.string(), // "kr" | "$" ...
    tiers: v.array(
      v.object({
        name: v.string(),
        price: v.string(),
        period: v.optional(v.string()),
        features: v.array(v.string()),
        cta: v.optional(ctaRef),
        highlighted: v.optional(v.boolean()),
      }),
    ),
  }),

  v.object({
    type: v.literal("faq"),
    heading: v.optional(v.string()),
    // Seeded lede under the heading (backlog 0899). OPTIONAL and additive: every
    // published snapshot predates it and every reader must render exactly as
    // before when it is absent - `SectionHeading` already returns null for an
    // empty heading+intro pair, so absence is byte-identical to today.
    intro: v.optional(v.string()),
    items: v.array(
      v.object({
        question: v.string(),
        answer: v.string(),
      }),
    ),
    // "accordion-cta" variant only - a trailing "still have questions?" band.
    footerHeading: v.optional(v.string()),
    footerDescription: v.optional(v.string()),
    footerCta: v.optional(ctaRef),
  }),

  v.object({
    type: v.literal("process"),
    heading: v.string(),
    steps: v.array(
      v.object({
        title: v.string(),
        description: v.string(),
        icon: v.optional(siteIconKey),
      }),
    ),
  }),

  v.object({
    type: v.literal("service-areas"),
    heading: v.string(),
    intro: v.optional(v.string()),
    areas: v.array(v.string()),
  }),

  v.object({
    type: v.literal("contact"),
    heading: v.string(),
    intro: v.optional(v.string()),
    /** @see rich-text's `eyebrow` */
    eyebrow: v.optional(v.string()),
    fields: v.array(formField),
    submitLabel: v.string(),
    successMessage: v.string(),
    showMap: v.optional(v.boolean()),
    address: v.optional(address),
    // "info-cards" variant only - icon-led contact methods shown instead of
    // (or above) the form, e.g. Email / Phone / Visit us.
    infoItems: v.optional(
      v.array(
        v.object({
          icon: v.optional(siteIconKey),
          title: v.string(),
          description: v.string(),
          cta: v.optional(ctaRef),
        }),
      ),
    ),
  }),

  v.object({
    type: v.literal("opening-hours"),
    heading: v.optional(v.string()),
    note: v.optional(v.string()),
    days: v.array(openingDay),
  }),

  v.object({
    type: v.literal("location"),
    heading: v.optional(v.string()),
    address: address,
    zoom: v.optional(v.number()),
  }),

  v.object({
    type: v.literal("certifications"),
    heading: v.optional(v.string()),
    items: v.array(
      v.object({
        label: v.string(),
        logo: v.optional(assetRef),
      }),
    ),
  }),

  v.object({
    type: v.literal("social-proof"),
    heading: v.optional(v.string()),
    stats: v.array(
      v.object({
        value: v.string(),
        label: v.string(),
      }),
    ),
  }),

  v.object({
    type: v.literal("instagram"),
    heading: v.optional(v.string()),
    handle: v.optional(v.string()),
    images: v.array(assetRef), // cached at publish; no live API in render
  }),

  v.object({
    type: v.literal("cta-band"),
    headline: v.string(),
    subtext: v.optional(v.string()),
    primaryCta: ctaRef,
    secondaryCta: v.optional(ctaRef),
  }),

  v.object({
    type: v.literal("booking"),
    heading: v.optional(v.string()),
    intro: v.optional(v.string()),
    // `cta` is legacy (pre-`source` booking sections) - kept optional for
    // back-compat so existing rows still validate. New sections use `source`
    // (a pasted link, a sandboxed embed, or the native engine).
    cta: v.optional(ctaRef),
    source: v.optional(bookingSource),
  }),

  v.object({
    type: v.literal("lead-form"),
    heading: v.string(),
    intro: v.optional(v.string()),
    fields: v.array(formField),
    submitLabel: v.string(),
    successMessage: v.string(),
  }),

  // Smart Quote Flow - a short, branching multi-step wizard that asks the right
  // per-industry questions, shows an instant deterministic price range, then
  // captures contact details. Pricing lives ON the options/units (no separate
  // rules engine): each select option / numeric input carries an optional
  // min/max contribution, summed into a range. `pricing: "none"` skips the
  // estimate for consultation-only trades (dentist, consultant). The contact
  // step (name/phone/email) is implicit in the renderer - never authored here -
  // so lead capture can't be misconfigured. Submits through the existing `/lead`
  // pipeline with `sectionType: "quote"`.
  v.object({
    type: v.literal("quote-flow"),
    heading: v.string(),
    intro: v.optional(v.string()),
    steps: v.array(
      v.object({
        key: v.string(), // stable answer key, e.g. "service" | "size"
        title: v.string(), // the question shown to the visitor
        help: v.optional(v.string()),
        input: v.union(
          v.literal("single-select"), // choice chips; also the branch driver
          v.literal("number"), // m² / antal / timmar - drives per-unit price
          v.literal("text"),
          v.literal("textarea"),
        ),
        options: v.optional(
          v.array(
            v.object({
              label: v.string(),
              priceMin: v.optional(v.number()),
              priceMax: v.optional(v.number()),
            }),
          ),
        ),
        unit: v.optional(v.string()), // "m²", "h" - shown next to a number input
        perUnitMin: v.optional(v.number()),
        perUnitMax: v.optional(v.number()),
        required: v.boolean(),
        // Conditional display: show this step only when an earlier answer matches.
        showWhen: v.optional(
          v.object({
            key: v.string(),
            equals: v.array(v.string()),
          }),
        ),
      }),
    ),
    pricing: v.union(v.literal("none"), v.literal("range")),
    basePriceMin: v.optional(v.number()),
    basePriceMax: v.optional(v.number()),
    currency: v.optional(v.string()), // default "kr"
    estimateNote: v.optional(v.string()), // "inkl. moms · kostnadsfri offert"
    insufficientMessage: v.optional(v.string()), // "Vi behöver lite mer information"
    allowAiAutofill: v.optional(v.boolean()), // show the free-text helper
    successMessage: v.string(),
    submitLabel: v.string(),
  }),

  v.object({
    type: v.literal("footer"),
    businessName: v.string(),
    tagline: v.optional(v.string()),
    // "contact" variant only - one free-typed line (address · phone · email).
    contactLine: v.optional(v.string()),
    columns: v.optional(
      v.array(
        v.object({
          heading: v.string(),
          links: v.array(ctaRef),
        }),
      ),
    ),
    legalText: v.optional(v.string()),
  }),

  // Long-form legal / policy prose (privacy policy, terms). Structured blocks
  // - never raw HTML - so it stays inside the constrained content model.
  v.object({
    type: v.literal("legal"),
    heading: v.string(),
    blocks: v.array(richBlock),
  }),

  // --- Ported marketing-website blocks (see docs/block-catalog.md) ----------

  // Logo cloud / "trusted by". Each item is a label + optional logo image; no
  // links stored (logos rarely navigate for small businesses).
  v.object({
    type: v.literal("logos"),
    heading: v.optional(v.string()),
    intro: v.optional(v.string()),
    items: v.array(
      v.object({
        label: v.string(),
        logo: v.optional(assetRef),
      }),
    ),
  }),

  // Benefits / "why choose us" grid. Distinct from `services`: reasons to trust,
  // not priced offerings. Icon-led, optional image per item.
  v.object({
    type: v.literal("highlights"),
    heading: v.string(),
    intro: v.optional(v.string()),
    items: v.array(
      v.object({
        title: v.string(),
        description: v.string(),
        icon: v.optional(siteIconKey),
        media: v.optional(assetRef),
      }),
    ),
  }),

  // Bento highlight grid - mixed-size visual cards.
  v.object({
    type: v.literal("bento"),
    heading: v.optional(v.string()),
    intro: v.optional(v.string()),
    cells: v.array(
      v.object({
        title: v.string(),
        description: v.optional(v.string()),
        media: v.optional(assetRef),
        span: v.optional(
          v.union(v.literal("sm"), v.literal("md"), v.literal("lg")),
        ),
      }),
    ),
  }),

  // Announcement / promo strip. A single line + optional CTA.
  v.object({
    type: v.literal("banner"),
    text: v.string(),
    cta: v.optional(ctaRef),
  }),

  // Video. Either an EMBED (provider youtube|vimeo + id - the renderer builds the
  // privacy-friendly embed URL; a raw iframe src is never stored) or a SELF-HOSTED
  // upload (provider "upload" + a `video` assetRef pointing at a kind:"video"
  // asset). videoId is optional now (only used by the embed providers).
  v.object({
    type: v.literal("video"),
    heading: v.optional(v.string()),
    caption: v.optional(v.string()),
    provider: v.union(
      v.literal("youtube"),
      v.literal("vimeo"),
      v.literal("upload"),
    ),
    videoId: v.optional(v.string()), // embed only; validated [A-Za-z0-9_-] in the renderer
    video: v.optional(assetRef), // upload only: the self-hosted video asset
    poster: v.optional(assetRef), // upload only: thumbnail shown before play (an image)
  }),

  // Comparison table - us vs. the alternative, or plan compare. Cells are plain
  // strings ("✓" / "–" / a value) so the generic editor can edit each one.
  v.object({
    type: v.literal("comparison"),
    heading: v.optional(v.string()),
    intro: v.optional(v.string()),
    columns: v.array(
      v.object({
        label: v.string(),
        highlighted: v.optional(v.boolean()),
      }),
    ),
    rows: v.array(
      v.object({
        label: v.string(),
        cells: v.array(v.string()),
      }),
    ),
  }),

  // Email signup. Reuses the public `/lead` submission pipeline (one email field).
  v.object({
    type: v.literal("newsletter"),
    heading: v.string(),
    intro: v.optional(v.string()),
    placeholder: v.string(),
    submitLabel: v.string(),
    successMessage: v.string(),
    consentText: v.optional(v.string()),
  }),

  // Large pull-quote / mission statement (non-attributed by default).
  v.object({
    type: v.literal("statement"),
    text: v.string(),
    attribution: v.optional(v.string()),
    cta: v.optional(ctaRef),
  }),

  // Article body: constrained rich text - an optional heading plus structured
  // blocks (paragraph, subheading, bullet list). No raw HTML; the generic
  // editor edits each block's text, so formatting stays bounded. Primarily used
  // by news/blog posts, but available to any page.
  v.object({
    type: v.literal("rich-text"),
    heading: v.optional(v.string()),
    // Small label above the heading ("01", "Metoder", "Sedan 1998"). Optional,
    // so a section that never had one renders exactly as before.
    eyebrow: v.optional(v.string()),
    blocks: v.array(richBlock),
  }),

  // Single figure with an optional caption. `image` is optional so a freshly
  // added section validates before any upload (an empty assetRef is invalid);
  // the editor shows an uploader slot via lib/editor/imageSlots.
  v.object({
    type: v.literal("image"),
    image: v.optional(assetRef),
    caption: v.optional(v.string()),
  }),

  // Commerce ("Sälj") merchandising. The owner only writes heading/intro; the
  // `products` + `siteSlug` are RESOLVED at publish from the site's active
  // products (convex/model/productMaterialize.ts), exactly like native booking
  // sections resolve from `services`. In the draft/editor they're absent → the
  // component shows a placeholder. `featured-product` shows the first few;
  // `product-grid` shows them all. No raw product ids are picked (zero decisions).
  v.object({
    type: v.literal("featured-product"),
    heading: v.optional(v.string()),
    intro: v.optional(v.string()),
    siteSlug: v.optional(v.string()),
    products: v.optional(
      v.array(
        v.object({
          slug: v.string(),
          name: v.string(),
          priceMinor: v.number(),
          currency: v.string(),
          imageUrl: v.optional(v.string()),
          inStock: v.boolean(),
        }),
      ),
    ),
  }),
  v.object({
    type: v.literal("product-grid"),
    heading: v.optional(v.string()),
    intro: v.optional(v.string()),
    siteSlug: v.optional(v.string()),
    products: v.optional(
      v.array(
        v.object({
          slug: v.string(),
          name: v.string(),
          priceMinor: v.number(),
          currency: v.string(),
          imageUrl: v.optional(v.string()),
          inStock: v.boolean(),
        }),
      ),
    ),
  }),

  // CONNECTED EXTERNAL STORE. The merchant's own shop (Shopify first) stays the
  // commerce authority: catalogue, variants, inventory, cart, checkout, orders,
  // fulfilment and refunds all live there. We own presentation only.
  //
  // The owner writes heading/intro. Everything else is RESOLVED - `products` by
  // an explicit catalogue refresh (convex/externalStore.listExternalProducts,
  // which writes the last-good cards here), and the connection facts at publish
  // (convex/model/externalProductMaterialize.ts). No provider HTML, no embed
  // code, no script ever lands in here; `url` is always a link into the shop.
  //
  // `priceText` is a DISPLAY string, never a number we compute with: the shop
  // re-prices at checkout and the component says so in words.
  v.object({
    type: v.literal("external-product-grid"),
    heading: v.optional(v.string()),
    intro: v.optional(v.string()),
    provider: v.optional(v.union(v.literal("shopify"), v.literal("external"))),
    /** The shop's front page - the "Besök butiken" destination, and the honest
     *  fallback for a provider whose catalogue we cannot read. */
    storeUrl: v.optional(v.string()),
    storeName: v.optional(v.string()),
    /** False once the owner disconnects the store. The public site then shows
     *  heading/intro only - never an error, never a stale shop link. */
    connected: v.optional(v.boolean()),
    /** When the cards below were last read from the provider (ms). Drives the
     *  "prices are confirmed in the shop" line. */
    productsFetchedAt: v.optional(v.number()),
    products: v.optional(
      v.array(
        v.object({
          handle: v.string(),
          title: v.string(),
          priceText: v.optional(v.string()),
          currency: v.optional(v.string()),
          imageUrl: v.optional(v.string()),
          availableForSale: v.boolean(),
          /** Product page in the merchant's shop. */
          url: v.string(),
          /** Cart permalink (`/cart/<variantId>:1`). Needs no API and no token,
           *  so the buy action keeps working while our read path is failing. */
          buyUrl: v.optional(v.string()),
        }),
      ),
    ),
  }),

  // Downloadable documents (backlog 0817): legal PDFs, price lists, forms.
  // `document` is an assetRef to a kind:"document" asset (application/pdf,
  // byte-sniffed on upload/import); the renderer links its resolved URL. The
  // ref is optional so a freshly added item validates before any upload.
  v.object({
    type: v.literal("documents"),
    heading: v.optional(v.string()),
    intro: v.optional(v.string()),
    items: v.array(
      v.object({
        title: v.string(),
        description: v.optional(v.string()),
        document: v.optional(assetRef),
      }),
    ),
  }),

  // Pinned tab showcase (Sophic conversion): a set of steps/features where the
  // media panel swaps as the visitor scrolls (pinned variant) or clicks (tabs
  // variant). `video` is a muted looping clip (kind:"video" asset) with
  // `media` as its poster + reduced-motion fallback - same contract as the
  // hero's bgVideo.
  v.object({
    type: v.literal("scroll-tabs"),
    heading: v.optional(v.string()),
    intro: v.optional(v.string()),
    tabs: v.array(
      v.object({
        label: v.string(),
        title: v.optional(v.string()),
        description: v.string(),
        media: v.optional(assetRef),
        video: v.optional(assetRef),
      }),
    ),
  }),

  // Restricted (client-specific): an interactive what-if comparison. The
  // visitor drags one value (e.g. an amount) and each column shows
  // value * ratePct / 100, formatted with the prefix/suffix. All figures are
  // client-side arithmetic over typed numbers - no scripts, no formulas.
  v.object({
    type: v.literal("comparison-slider"),
    heading: v.optional(v.string()),
    intro: v.optional(v.string()),
    minValue: v.number(),
    maxValue: v.number(),
    defaultValue: v.number(),
    step: v.optional(v.number()),
    valuePrefix: v.optional(v.string()),
    valueSuffix: v.optional(v.string()),
    valueLabel: v.optional(v.string()),
    columns: v.array(
      v.object({
        label: v.string(),
        ratePct: v.number(),
        note: v.optional(v.string()),
        highlighted: v.optional(v.boolean()),
      }),
    ),
    footnote: v.optional(v.string()),
  }),

  // section:new-content-anchor — `bun run section:new <type>` inserts new
  // content shapes ABOVE this line. Do not remove or rename this comment.
);

export type SectionContent = Infer<typeof sectionContent>;
export type SectionType = SectionContent["type"];

/** Narrow `SectionContent` to a single section type's content shape. */
export type ContentOf<T extends SectionType> = Extract<SectionContent, { type: T }>;

/** Every section type literal, derived so it can never drift from the union. */
export const SECTION_TYPES = [
  "hero",
  "services",
  "service-detail",
  "about",
  "team",
  "testimonials",
  "gallery",
  "before-after",
  "pricing",
  "faq",
  "process",
  "service-areas",
  "contact",
  "opening-hours",
  "location",
  "certifications",
  "social-proof",
  "instagram",
  "cta-band",
  "booking",
  "lead-form",
  "quote-flow",
  "footer",
  "legal",
  "logos",
  "highlights",
  "bento",
  "banner",
  "video",
  "comparison",
  "newsletter",
  "statement",
  "rich-text",
  "image",
  "featured-product",
  "product-grid",
  "external-product-grid",
  "documents",
  "scroll-tabs",
  "comparison-slider",
  // section:new-type-anchor — the scaffolder inserts new type literals above.
] as const;

export const sectionTypesExhaustiveCheck: [
  Exclude<SectionType, (typeof SECTION_TYPES)[number]>,
  Exclude<(typeof SECTION_TYPES)[number], SectionType>,
] extends [never, never]
  ? true
  : never = true;

export const sectionTypeLiteral = v.union(
  ...SECTION_TYPES.map((t) => v.literal(t)),
);

// ---------------------------------------------------------------------------
// Per-section layout tokens (Labs advanced editor). Like `variant`/`tone`,
// layout lives ON THE ROW, not in the content union: bounded, validated
// enums - never free CSS (prd §8). Absent field/knob = today's rendering,
// byte-for-byte. Rendered by the shared Section shell via SectionLayoutContext
// (components/site-sections/shared/), so editor, preview, public site and
// snapshots all share one application point. Writes go through
// sections.setSectionLayout, which is gated on the workspace Labs grant.
// ---------------------------------------------------------------------------

export const sectionLayoutValidator = v.object({
  /** Content column width. "normal"/absent = the section's own default;
   *  "wide" widens the max column; "full" removes the max width (gutters
   *  stay). Full-bleed section types ignore this (WIDTH_EXEMPT in the UI). */
  width: v.optional(
    v.union(v.literal("normal"), v.literal("wide"), v.literal("full")),
  ),
  /** Vertical padding multiplier over the theme density rhythm. */
  paddingY: v.optional(
    v.union(
      v.literal("none"),
      v.literal("compact"),
      v.literal("normal"),
      v.literal("spacious"),
    ),
  ),
  /** Hide this section below the md breakpoint on the public site. The editor
   *  keeps it visible-but-dimmed in edit mode so it stays selectable. */
  hideOnMobile: v.optional(v.literal(true)),
  /** Hide this section at the md breakpoint and up (tablet + desktop) on the
   *  public site - the inverse of hideOnMobile, same binary 767/768 split.
   *  The editor keeps it visible-but-dimmed so it stays selectable. */
  hideOnDesktop: v.optional(v.literal(true)),
});
export type SectionLayout = Infer<typeof sectionLayoutValidator>;
