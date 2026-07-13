import { v, type Infer } from "convex/values";

// ---------------------------------------------------------------------------
// Convex validator for a site's third-party tracking configuration. One
// validated id per provider; absent => that tool is off. Shared by the live
// `websites.tracking` / `onboardingDrafts.tracking` fields and the published
// `siteVersions` snapshot. The keys MUST match TRACKING_PROVIDERS in
// lib/tracking.ts (the pure, client-safe source of meta + validation).
// ---------------------------------------------------------------------------

export const trackingConfig = v.object({
  ga4: v.optional(v.string()), // G-XXXXXXXXXX
  gtm: v.optional(v.string()), // GTM-XXXXXXX
  metaPixel: v.optional(v.string()), // numeric pixel id
  linkedin: v.optional(v.string()), // numeric partner id
  hubspot: v.optional(v.string()), // numeric portal (hub) id
  hotjar: v.optional(v.string()), // numeric site id
});

export type TrackingConfigDoc = Infer<typeof trackingConfig>;
