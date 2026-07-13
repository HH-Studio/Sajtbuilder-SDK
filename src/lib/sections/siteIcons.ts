// Canonical, FROZEN catalogue of customer-site content icon keys - the product
// contract for `services/process/contact/highlights` section icons.
//
// These stable semantic keys (not icon-library component names) are what gets
// stored in section content and embedded in immutable published snapshots, so
// they must never be renamed or removed - only the icon *component* each key
// maps to may change (see components/site-sections/shared/DynamicIcon.tsx).
//
// Plain module (no React): shared by the site renderer AND the Convex schema
// validator + AI generators, so stored content, snapshots and validation agree.
export const SITE_ICON_KEYS = [
  "sparkles",
  "sparkle",
  "star",
  "heart",
  "shield",
  "wrench",
  "scissors",
  "stethoscope",
  "brush",
  "hammer",
  "leaf",
  "truck",
  "clock",
  "phone",
  "pin",
  "mail",
  "check",
  "home",
  "droplets",
  "zap",
  "thumbsup",
  "utensils",
  "dumbbell",
  "users",
  "ruler",
] as const;

export type SiteIconKey = (typeof SITE_ICON_KEYS)[number];
