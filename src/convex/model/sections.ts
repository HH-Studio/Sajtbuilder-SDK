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
    // "spotlight" only - small labelled chips floated over the hero media
    // ("Office cleaning", "Bathroom cleaning"). Names of things the business
    // does, not links: a chip that navigates competes with the two CTAs
    // directly under it.
    tags: v.optional(
      v.array(v.object({ label: v.string(), icon: v.optional(siteIconKey) })),
    ),
    // The EXTRA photo set: the ring around the headline in "scatter", the row
    // under it in "stage". Separate from `media` on purpose - `media` is the ONE
    // hero photo every other layout renders, and a layout that needs nine of
    // them must not quietly redefine what that single field means for the
    // fifteen variants that share it.
    scatterImages: v.optional(v.array(assetRef)),
    // "duo" only - the second, smaller photo inset over the first. Two photos
    // is the layout; a variant that needs a second one must say so rather than
    // borrowing the first item of `scatterImages`, which means something else.
    secondaryMedia: v.optional(assetRef),
  }),

  v.object({
    type: v.literal("services"),
    /** @see rich-text's `eyebrow`. "feature-cards" only - the small label
     *  above the heading ("Our services"). */
    eyebrow: v.optional(v.string()),
    heading: v.string(),
    intro: v.optional(v.string()),
    /** "feature-cards" only - one section-level photo beside the cards. Per
     *  ITEM photos stay on `items[].media`; this is the band's own image. */
    media: v.optional(assetRef),
    items: v.array(
      v.object({
        title: v.string(),
        // Optional on purpose (2026-07-31): the generator only writes a
        // description it can actually stand behind (`describeService`). When it
        // has nothing true to say about a service it omits the field rather
        // than printing a mood line — "Slingor – Boka en tid som passar dig"
        // was the old positional pool, and an absent description beats a wrong
        // one. Widening required -> optional is a one-deploy change: every
        // stored item already carries the field and stays valid.
        description: v.optional(v.string()),
        // Optional owner-entered display price from the canonical services menu.
        // Kept as text because services can be "from", hourly, or quote-only.
        priceText: v.optional(v.string()),
        // Short "what's included" labels rendered as a checked list under the
        // description ("Floors", "Restrooms"). Only "feature-cards" renders
        // them - the other variants would turn a card into a spec sheet.
        bullets: v.optional(v.array(v.string())),
        icon: v.optional(siteIconKey),
        media: v.optional(assetRef),
        cta: v.optional(ctaRef),
        // Phase S: optional link to a canonical `services` row. Additive - manual
        // items omit it; the editor/publish use it to keep one source of truth.
        serviceId: v.optional(v.id("services")),
        // "Ta betalt" (backlog 0025 Option B). Set by publish-time
        // materialization for a linked service whose primaryAction is `pay` and
        // whose price is a real amount; absent for every other item, which is
        // what makes the pay button appear on exactly the services the owner
        // priced. This is a MACHINE price in minor units - `priceText` stays the
        // display string ("från 500 kr") and is not something a checkout can be
        // built on. Living in the section content is the point: the amount the
        // visitor was quoted is frozen in the published snapshot, so checkout
        // charges what the page promised rather than whatever the draft says
        // today.
        payAmount: v.optional(v.number()),
        payCurrency: v.optional(v.string()),
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
    /** @see rich-text's `eyebrow`. "showcase" only - the small label above the
     *  statement ("Learn about us"). Every other variant ignores it. */
    eyebrow: v.optional(v.string()),
    heading: v.string(),
    body: v.string(),
    media: v.optional(assetRef),
    signatureName: v.optional(v.string()),
    /** "showcase" only - the one button under the statement. */
    cta: v.optional(ctaRef),
    // "collage" only - the second photo. Two photos at deliberate offsets is
    // the layout; every other About cut renders `media` alone.
    secondaryMedia: v.optional(assetRef),
    // "story-stats" only - a short pair of figures under the story. Kept here
    // rather than pointing at the `social-proof` block because these belong TO
    // the story ("22+ years", "489+ cleaners") and read as part of it.
    stats: v.optional(
      v.array(v.object({ value: v.string(), label: v.string() })),
    ),
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
    /** @see rich-text's `eyebrow`. Rendered by "mosaic"; other gallery
     *  variants show the heading alone. */
    eyebrow: v.optional(v.string()),
    heading: v.optional(v.string()),
    images: v.array(assetRef), // capped (≤24) in the editor
  }),

  v.object({
    type: v.literal("before-after"),
    /** @see rich-text's `eyebrow`. Rendered by "slider". */
    eyebrow: v.optional(v.string()),
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
        /** Prose under the tier name, ABOVE the price. What a plan actually is,
         *  in a sentence — which is how most price lists outside SaaS are
         *  written. `features` is the tick-list underneath and stays separate:
         *  a sentence forced into it rendered as one long bullet with a green
         *  check in front of it, which is not the same page. */
        description: v.optional(v.string()),
        features: v.array(v.string()),
        cta: v.optional(ctaRef),
        highlighted: v.optional(v.boolean()),
        // "packages" only. The icon is decoration that tells the three tiers
        // apart at a glance; the badge is the owner's own words for why one is
        // singled out ("Most popular"). Deliberately a FIELD, not derived from
        // `highlighted`: printing "most popular" on a tier because it is styled
        // differently would be inventing a claim about their business.
        icon: v.optional(siteIconKey),
        badge: v.optional(v.string()),
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
    /** @see rich-text's `eyebrow`. Drawn as a chip above the heading by the
     *  "outlined", "framed", "tabs", "grouped" and "header-cta" cuts. */
    eyebrow: v.optional(v.string()),
    // "header-cta" and "beside-photo" only - one button beside (or under) the
    // heading. Distinct from `footerCta`, which is the trailing "still have
    // questions?" band and belongs to "accordion-cta": a header button and a
    // closing band are not the same offer and a site may want both.
    cta: v.optional(ctaRef),
    // "beside-photo" only - one photo beside the questions.
    media: v.optional(assetRef),
    items: v.array(
      v.object({
        question: v.string(),
        answer: v.string(),
        // "tabs" and "grouped" only - which group this question belongs to
        // ("Priser", "Bokning"). The groups are DERIVED from the questions in
        // first-appearance order, so renaming a category on one question
        // renames its chip and there is no second list to keep in sync. Every
        // other cut ignores it.
        category: v.optional(v.string()),
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
    /** @see rich-text's `eyebrow` */
    eyebrow: v.optional(v.string()),
    steps: v.array(
      v.object({
        title: v.string(),
        description: v.string(),
        icon: v.optional(siteIconKey),
      }),
    ),
    // "steps-cta" variant only - a trailing card that closes the sequence with
    // an action, in the same grid as the steps. Same shape `team` and `faq`
    // already use for their trailing bands.
    footerHeading: v.optional(v.string()),
    footerCta: v.optional(ctaRef),
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
    /** @see rich-text's `eyebrow`. Rendered by "showpiece". */
    eyebrow: v.optional(v.string()),
    headline: v.string(),
    subtext: v.optional(v.string()),
    primaryCta: ctaRef,
    secondaryCta: v.optional(ctaRef),
    // "proof-row" only - a line of reassurance under the buttons. Every part of
    // it is STORED, never derived: `label` is the owner's own sentence, `rating`
    // the score they hold elsewhere, `faces` photos they uploaded. The renderer
    // will not draw a rating the owner did not enter, and it counts nothing on
    // their behalf - a figure this software invented would be the software
    // making a claim about their business.
    proof: v.optional(
      v.object({
        label: v.optional(v.string()),
        rating: v.optional(v.number()),
        faces: v.optional(v.array(assetRef)),
      }),
    ),
    // "feature-tiles" only - small labelled tiles under the buttons, for what
    // is included or what you work with. Labels, not links: a tile that
    // navigates competes with the two buttons directly above it.
    tiles: v.optional(
      v.array(v.object({ label: v.string(), icon: v.optional(siteIconKey) })),
    ),
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
    // Newsletter footer variants. One optional OBJECT rather than six unrelated
    // strings: selecting the layout seeds it whole, so a footer can never
    // persist a working email field with missing button/success copy.
    newsletter: v.optional(
      v.object({
        heading: v.string(),
        description: v.string(),
        placeholder: v.string(),
        submitLabel: v.string(),
        successMessage: v.string(),
        consentText: v.optional(v.string()),
      }),
    ),
    // "promo-newsletter" only. The CTA is typed, so the prominent banner can
    // never persist a dead hash link or unsafe URL. Contact uses the website's
    // real email at render time instead of duplicating it in section content.
    promo: v.optional(
      v.object({
        eyebrow: v.optional(v.string()),
        heading: v.string(),
        cta: ctaRef,
      }),
    ),
    contactLabel: v.optional(v.string()),
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
    // "values" only - one section-level photo beside the stacked cards. Per
    // ITEM photos stay on `items[].media`; this is the band's own image.
    media: v.optional(assetRef),
    // "split-icons" only - one button under the heading column.
    cta: v.optional(ctaRef),
    items: v.array(
      v.object({
        title: v.string(),
        description: v.string(),
        icon: v.optional(siteIconKey),
        media: v.optional(assetRef),
        // "figures" only - the small line ABOVE the figure that says what is
        // being counted ("Residences serviced"). The title is the number and
        // the description is its note, so this is the third slot that layout
        // needs and no other highlights variant renders.
        label: v.optional(v.string()),
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
        // "portfolio" only - the group this piece of work belongs to. It is
        // both the line above the title and the filter chip the visitor picks,
        // so the chips are DERIVED from the cells rather than stored twice.
        category: v.optional(v.string()),
      }),
    ),
  }),

  // Announcement / promo strip. A single line + optional CTA.
  v.object({
    type: v.literal("banner"),
    text: v.string(),
    cta: v.optional(ctaRef),
    // "notice" only - the small chip that opens the strip ("NYHET", "REA").
    // A label for the message, not a claim about the business: it says what
    // KIND of notice this is, so it must stay owner-written. The other three
    // banner variants ignore it.
    badge: v.optional(v.string()),
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
        // "plans" only - the price under the column name, and the line under
        // that ("Hourly plan"). Text, like `pricing.price`, because a rate can
        // be "from", hourly, or quote-only.
        price: v.optional(v.string()),
        priceNote: v.optional(v.string()),
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
  // ---------------------------------------------------------------------
  // An EXACT capture of a source page's own layout (plan
  // docs/plans/open/2026-08-03-exact-import-editable.md).
  //
  // Open in STRUCTURE, closed in VOCABULARY: the tree is whatever the source
  // page's layout was - we do not try to express it as one of the 40 typed
  // sections - but every tag, attribute and declaration in it has been through
  // an allow-list (`lib/import/capturedTree.ts`, `capturedCss.ts`) before it
  // can be written here.
  //
  // FLAT, with parent indices, for three reasons: a Convex validator cannot
  // express a recursive type; a parent index that must be LOWER than the node's
  // own makes a cycle unrepresentable; and rendering is then one pass with no
  // recursion.
  //
  // This is not an authoring model. Nothing in the editor creates one of these
  // - they only ever arrive from an import, and the owner edits them through
  // `slots`. The 2026-07-26 "the advanced editor is not Webflow" decision
  // stands: there is no box model here.
  // ---------------------------------------------------------------------
  v.object({
    type: v.literal("imported"),
    /** Owner-facing label for the section list ("Hero", "Om oss"). */
    label: v.optional(v.string()),
    nodes: v.array(
      v.object({
        el: v.string(),
        /** Index of the parent node; -1 for a root. Always < this node's own
         *  index - enforced by the sanitizer, relied on by the renderer. */
        parent: v.number(),
        attrs: v.optional(v.record(v.string(), v.string())),
        /** Sanitised inline declarations (`color:red;gap:8px`). */
        style: v.optional(v.string()),
        /** Which slot supplies this node's content. */
        slot: v.optional(v.string()),
      }),
    ),
    /** The editable surface. Everything an owner can change lives here, which
     *  is what makes an exact capture editable rather than a screenshot. */
    slots: v.record(
      v.string(),
      v.union(
        v.object({ kind: v.literal("text"), value: v.string() }),
        v.object({
          kind: v.literal("image"),
          assetId: v.optional(v.string()),
          src: v.optional(v.string()),
          alt: v.string(),
        }),
        v.object({
          kind: v.literal("link"),
          href: v.string(),
          label: v.string(),
        }),
      ),
    ),
    /** The source's own stylesheet: trimmed to matched rules, sanitised, and
     *  rendered inside a shadow root so it cannot reach our chrome. */
    css: v.optional(v.string()),
    /** `@font-face` lifted out of `css`: a face declared inside a shadow root
     *  does not apply to it, so these are hoisted to the document. */
    fontFaces: v.optional(v.string()),
    /** Webfont stylesheets the source loaded that we could not READ - a
     *  cross-origin kit throws on `cssRules`. Re-linked at document level so
     *  the block renders in the source's own typeface rather than a fallback
     *  with different glyph widths, which re-breaks every line. Host-restricted
     *  to font services (`FONT_STYLESHEET_HOSTS`). */
    fontLinks: v.optional(v.array(v.string())),
  }),

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
    // "pinned-text" only - one button at the foot of the pinned panel, so the
    // step sequence ends on an action instead of trailing off.
    cta: v.optional(ctaRef),
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

  v.object({
    type: v.literal("illustration"),
    heading: v.optional(v.string()),
    body: v.optional(v.string()),
    /** The drawing's coordinate space, `"minX minY width height"`. */
    viewBox: v.string(),
    /** The drawing itself, as PATHS rather than markup.
     *
     *  There is deliberately no way to express an element that is not a path,
     *  a URL, an event attribute or a `foreignObject`, so there is nothing for
     *  a sanitiser to miss — the renderer builds the `<svg>` from this list and
     *  never inlines source markup. Colour is a closed set of site tokens
     *  (`lib/sections/illustration.ts`), so an imported drawing recolours with
     *  the site instead of freezing the source's palette.
     *
     *  Everything here is re-validated before it reaches an attribute: `d`
     *  against a closed character set and a length cap, `viewBox` against a
     *  four-number shape with a positive extent, `strokeWidth` against a range.
     *  A path that fails is dropped; a drawing with nothing left renders no
     *  `<svg>` at all rather than an empty box. */
    paths: v.array(
      v.object({
        d: v.string(),
        fill: v.optional(v.string()),
        stroke: v.optional(v.string()),
        strokeWidth: v.optional(v.number()),
      }),
    ),
    /** Read out to a screen reader in place of the drawing. Absent means the
     *  drawing is decorative and is hidden from assistive tech, which is the
     *  honest default for a mark or a divider flourish. */
    alt: v.optional(v.string()),
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
  "illustration",
  "imported",
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
  /** This band's content drifts against the page as it scrolls, starting at
   *  this offset and settling at zero. Import-only today: it is the one motion
   *  in a Webflow/GSAP source page that is not a reveal, and a band that had it
   *  reads as a flat slab without it.
   *
   *  Values are simple CSS lengths (`"10%"`, `"-40px"`), re-validated by
   *  `safeLength` before they reach a declaration; a percentage is relative to
   *  the element's own size, which is what the source pages measure in too.
   *  Absent (the default everywhere) means the band sits still, and
   *  `prefers-reduced-motion` disables it regardless — a parallax is exactly
   *  the effect that causes vestibular symptoms. */
  parallax: v.optional(
    v.object({ x: v.optional(v.string()), y: v.optional(v.string()) }),
  ),
  /** Where this band's content sits across a 12-column grid, so a section can
   *  occupy a SUBSET of the measure with the rest of the row deliberately
   *  empty. That asymmetry is the whole editorial feel of a large family of
   *  authored sites, and without it every imported band came back as the same
   *  full-width slab.
   *
   *  Whole columns, 1-12; a span that would run off the right edge is clamped
   *  (`lib/sections/columns.ts`), and anything outside the grid is dropped
   *  rather than guessed at. Both absent - the default everywhere - means the
   *  content fills the container exactly as it does today, with no extra
   *  element in the tree.
   *
   *  Import-only today, like `parallax`: it is a composition the author
   *  measured, not a knob the owner tunes. */
  columnStart: v.optional(v.number()),
  columnSpan: v.optional(v.number()),
  /** Geometry MEASURED off one band of a source page, for this band alone.
   *
   *  Everything else an import measures is site-level: one `sectionPy`, three
   *  container widths, nine type roles for the whole site
   *  (`theme.customLayout` / `customType`). A source page whose bands have
   *  different rhythm or a different measure than the rest of the page could
   *  not be expressed at all — every band came back on the site median.
   *
   *  Import-only, like `parallax` and the column tokens: these are numbers an
   *  author's own CSS produced, not knobs the owner tunes. Lengths only,
   *  re-validated by the renderer's `safeLength` before they reach a
   *  declaration (`lib/sections/measuredSection.ts`), so a hostile or broken
   *  bundle degrades to the site rhythm rather than injecting CSS.
   *
   *  An owner choice always wins: an explicit Labs `paddingY` replaces the
   *  measured padding and an explicit `width` replaces the measured maxWidth,
   *  because the owner touched the knob after the import ran. */
  measured: v.optional(
    v.object({
      /** This band's own vertical padding, replacing the page rhythm. */
      paddingTop: v.optional(v.string()),
      paddingBottom: v.optional(v.string()),
      /** This band's content measure, replacing the site container width. */
      maxWidth: v.optional(v.string()),
      /** Row gap of this band's own multi-column grid (`--site-grid-gap`). */
      gap: v.optional(v.string()),
      /** How this band's heading block sits. Bounded enum, not a length. */
      align: v.optional(
        v.union(v.literal("start"), v.literal("center"), v.literal("end")),
      ),
    }),
  ),
});
export type SectionLayout = Infer<typeof sectionLayoutValidator>;
