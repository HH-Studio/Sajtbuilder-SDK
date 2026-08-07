// ---------------------------------------------------------------------------
// Phase 2 of the advanced-editor parity plan: per-SLOT style overrides.
//
// Phase 1 gave the site a design vocabulary. This gives it to one part of one
// section — the thing a Webflow or Framer user reaches for first and cannot do
// today, because Sajt's selection atom is a whole section and a section has no
// addressable children. A slot is that address: `hero.heading`,
// `services.card`, `gallery.item`.
//
// THE LOAD-BEARING DECISION, and the reason this is not just "CSS on a node":
// every value here is a bounded STEP or a closed enum, never a raw length,
// colour, or CSS string. `sizeStep: -1` means "one step down the site's own
// type scale", not "28px". `ink: "muted"` names a palette role that is already
// AA-checked against its surface, not a colour.
//
// That is what lets the advanced editor be a real design tool without becoming
// an escape hatch. A user can express the composition they want; they cannot
// express a 400px headline, a 3px grey-on-grey caption, or a colour that fails
// contrast — because those values are not in the vocabulary. Widening a bound
// here is a product decision, and it is reviewable in one place.
//
// SCOPING IS BUILT IN FROM DAY ONE, ON PURPOSE. `SlotStyle` is not a flat token
// bag; it is a map of scopes (`base`, breakpoints, states). Phase 2's UI writes
// only `base`, but Phase 3 adds `md`/`lg`/`hover`/`focusVisible` by writing to
// a key that already validates and already round-trips through publish, export
// and undo. Adding the scope later would have meant a schema migration on a
// field that by then sits on every section of every site — and Convex validates
// EVERY existing document on push, so that migration is two deploys and a
// backfill. This costs nothing now and saves that.
// ---------------------------------------------------------------------------

import { v, type Infer } from "convex/values";

/** Steps on the site's own type scale, relative to what the slot renders today.
 *  Bounded hard: three steps up from a heading is still a heading. */
export const SLOT_SIZE_STEP_MIN = -3;
export const SLOT_SIZE_STEP_MAX = 3;

/** Steps on the section's vertical rhythm. Negative pulls content together —
 *  the single most common editorial move (a subtitle hugging its headline) and
 *  one the preset scale cannot express at all. */
export const SLOT_SPACE_STEP_MIN = -3;
export const SLOT_SPACE_STEP_MAX = 6;

/** Ink is a palette ROLE, never a colour. Each of these is already validated
 *  AA against the surfaces it can land on, so a slot cannot be given text that
 *  fails contrast — which is exactly the failure a free colour picker ships. */
export const SLOT_INK_KEYS = [
  "default",
  "muted",
  "primary",
  "onMedia",
] as const;
export type SlotInk = (typeof SLOT_INK_KEYS)[number];

export const SLOT_ALIGN_KEYS = ["start", "center", "end"] as const;
export const SLOT_TRANSFORM_KEYS = [
  "none",
  "uppercase",
  "lowercase",
  "capitalize",
] as const;
/** The theme's own radius vocabulary plus `full`; never a pixel value, so a
 *  slot can never disagree with the site's radius token by a hair. */
export const SLOT_RADIUS_KEYS = ["none", "sm", "md", "lg", "full"] as const;
/** Closed aspect list. A free ratio is how imported galleries end up 3.7:1. */
export const SLOT_RATIO_KEYS = [
  "auto",
  "1/1",
  "4/3",
  "3/2",
  "16/9",
  "21/9",
] as const;
export const SLOT_FIT_KEYS = ["cover", "contain"] as const;

/** One slot's tokens within one scope. Every field optional: absent means the
 *  slot renders exactly as it does today, which is the contract that lets this
 *  ship on every existing section without changing a single page. */
export const slotTokens = v.object({
  // --- type ---------------------------------------------------------------
  sizeStep: v.optional(v.number()),
  weight: v.optional(v.number()),
  lineHeight: v.optional(v.number()),
  /** Letter-spacing steps, not a length: -2 is "tighter", +2 is "looser". */
  trackingStep: v.optional(v.number()),
  transform: v.optional(
    v.union(...SLOT_TRANSFORM_KEYS.map((k) => v.literal(k))),
  ),
  align: v.optional(v.union(...SLOT_ALIGN_KEYS.map((k) => v.literal(k)))),
  ink: v.optional(v.union(...SLOT_INK_KEYS.map((k) => v.literal(k)))),

  // --- box ----------------------------------------------------------------
  spaceTopStep: v.optional(v.number()),
  spaceBottomStep: v.optional(v.number()),
  gapStep: v.optional(v.number()),
  radius: v.optional(v.union(...SLOT_RADIUS_KEYS.map((k) => v.literal(k)))),

  // --- media --------------------------------------------------------------
  ratio: v.optional(v.union(...SLOT_RATIO_KEYS.map((k) => v.literal(k)))),
  fit: v.optional(v.union(...SLOT_FIT_KEYS.map((k) => v.literal(k)))),

  // --- grid ---------------------------------------------------------------
  /** Columns for a slot that lays its children out in a row (cards, logos,
   *  gallery items). 1..6 — past six, a card is a logo. */
  columns: v.optional(v.number()),

  // --- motion (Phase 5: interactions v1) ------------------------------------
  // Two triggers only, and they are the two the plan named as the safe subset:
  // scroll-into-view and hover. Both are pure CSS, driven the same way the
  // section-level reveal already is (`animation-timeline: view()`), so they add
  // ZERO client JavaScript to a customer's public site, ship inside the publish
  // snapshot by construction, and a browser without scroll-driven animations
  // simply renders the finished page.
  //
  // No free durations, distances or easings on purpose. An owner picks a NAMED
  // motion; how far and how fast it moves comes from the site's own motion
  // tokens (`theme.customMotion`), so a page cannot end up with one part
  // easing over 1.2s beside another snapping in 80ms.
  /** How this part moves as the page scrolls. Absent means it does not animate
   *  on its own — it still rides its section's reveal, which is what every
   *  existing site does.
   *
   *  ONE motion per part, not a stack. Every value here compiles to a single
   *  `animation` on one element, so there is no composition order to reason
   *  about and no way for two choices to fight over `transform` — the same
   *  discipline that keeps a slot to one preset. The three reveals are
   *  scroll-into-view (Phase 5); the two drifts are scroll-LINKED (Phase 6) and
   *  are the per-part generalisation of `section.layout.parallax`. */
  motion: v.optional(
    v.union(
      v.literal("rise"),
      v.literal("fade"),
      v.literal("zoom"),
      v.literal("driftUp"),
      v.literal("driftDown"),
    ),
  ),
  /** Start N steps after the band does — the stagger a designer reaches for so
   *  an eyebrow, a headline and a button do not arrive as one slab. 0..6, in
   *  the same 4%-of-the-entry-window units the section-level child stagger
   *  already uses. Meaningless on a drift, which is linked to scroll position
   *  rather than triggered by it, and the panel hides it there. */
  motionDelayStep: v.optional(v.number()),
  /** How far this part lifts under the pointer. Hover only — never the sole
   *  affordance for anything, suppressed on a coarse pointer (where `:hover`
   *  sticks after a tap), and driven by `translate` rather than `transform` so
   *  it can never fight a scroll animation on the same element. */
  hoverLift: v.optional(
    v.union(v.literal("sm"), v.literal("md"), v.literal("lg")),
  ),
});
export type SlotTokens = Infer<typeof slotTokens>;

/** The scopes a slot's style can carry.
 *
 *  `base` is what Phase 2 writes. The rest exist so Phase 3 does not need a
 *  schema migration on a field that will by then be on every section of every
 *  site (see the header note on Convex validating existing documents on push).
 *
 *  Breakpoints are MIN-WIDTH and cascade upward — `base` is the phone, `md`
 *  overrides it from the tablet up, `lg` from the desktop up. That direction is
 *  chosen to match the customer-site renderer, which is container-queried and
 *  mobile-first; a max-width cascade here would disagree with every existing
 *  `@min-[…]px:` in `components/site-sections/**`. */
export const slotStyle = v.object({
  base: v.optional(slotTokens),
  md: v.optional(slotTokens),
  lg: v.optional(slotTokens),
  hover: v.optional(slotTokens),
  focusVisible: v.optional(slotTokens),
  /** Phase 4: a named preset this slot follows (`theme.slotPresets`).
   *
   *  A reference, not a copy — editing the preset moves every slot that names
   *  it, which is the whole point. The scopes above still win per property, so
   *  "follow my card style but one step larger here" is expressible without
   *  forking the preset.
   *
   *  This is Webflow classes with the cascade footgun removed: a slot follows
   *  exactly ONE preset, never a stack of them, so there is no combo-class
   *  order to reason about and no way to build a specificity puzzle. An id that
   *  no longer exists is ignored at read (the same rule as an unknown slot), so
   *  deleting a preset degrades to "unstyled" rather than to an error. */
  preset: v.optional(v.string()),
});
export type SlotStyle = Infer<typeof slotStyle>;

// --- Named presets ----------------------------------------------------------

/** A saved slot style, applied by reference. Lives on the THEME rather than in
 *  its own table: presets are site-wide design vocabulary in the same sense
 *  `customType` is, and riding `theme` means publish snapshots, portable
 *  export/import and the whole-theme undo inverse all carry them with no new
 *  code and no new switch case in `convex/history.ts`. */
export const slotPreset = v.object({
  /** Owner-typed, shown in the picker. Never an id — renaming must not orphan
   *  a slot that follows the preset. */
  name: v.string(),
  style: v.object({
    base: v.optional(slotTokens),
    md: v.optional(slotTokens),
    lg: v.optional(slotTokens),
    hover: v.optional(slotTokens),
    focusVisible: v.optional(slotTokens),
  }),
});
export type SlotPreset = Infer<typeof slotPreset>;

export const slotPresets = v.record(v.string(), slotPreset);
export type SlotPresets = Infer<typeof slotPresets>;

/** Enough for a real design system, few enough that the picker stays a list a
 *  person can read. */
export const SLOT_PRESET_MAX = 24;
export const SLOT_PRESET_NAME_MAX = 40;
/** Ids are generated by the panel, never typed. Constrained here because they
 *  end up as a record key that rides publish and export. */
export const SLOT_PRESET_ID = /^p[a-z0-9]{4,24}$/;

export const SLOT_SCOPE_KEYS = [
  "base",
  "md",
  "lg",
  "hover",
  "focusVisible",
] as const;
export type SlotScope = (typeof SLOT_SCOPE_KEYS)[number];

/** A section's overrides, keyed by slot id. `v.record` rather than a per-type
 *  object because the slot vocabulary is per section TYPE (see
 *  lib/sections/slots.ts) and a closed object here would have to enumerate
 *  every slot of every one of the 42 types in a validator — which would then
 *  need a schema push every time a section grew a slot. Unknown ids are dropped
 *  at read, not at write, so a section that changes type does not fail
 *  validation on a slot its new type has never heard of. */
export const sectionStyleOverrides = v.record(v.string(), slotStyle);
export type SectionStyleOverrides = Infer<typeof sectionStyleOverrides>;
