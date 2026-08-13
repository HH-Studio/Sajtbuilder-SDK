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
  // --- 2026-08-13 expansion (backlog 2279) ---------------------------------
  // Additive only: every key above keeps its meaning and its place, because
  // published snapshots already contain them. These forty cover the verticals
  // the original twenty-five could only approximate - a dentist got a generic
  // stethoscope, a garage a wrench, a bakery a fork and knife. Each key names a
  // recognisable business concept; near-duplicates of an existing glyph were
  // left out on purpose, since a longer list of similar pictures makes the
  // picker harder, not richer.
  // Health and care
  "tooth",
  "heartbeat",
  "first-aid",
  "brain",
  "eye",
  // Animals
  "paw",
  // Building and home services
  "toolbox",
  "paint-roller",
  "bulb",
  "plug",
  "flame",
  "key",
  // Automotive and transport
  "car",
  "tire",
  "battery",
  // Food and hospitality
  "chef-hat",
  "coffee",
  "cake",
  "bed",
  // Beauty and wellness
  "razor",
  "flower",
  "sun",
  // Retail and logistics
  "shopping-bag",
  "package",
  "gift",
  "barcode",
  // Professional services
  "briefcase",
  "calculator",
  "chart",
  "scale",
  "handshake",
  // Education
  "book",
  "school",
  "certificate",
  // Creative and events
  "camera",
  "palette",
  "music",
  "microphone",
  // Technology
  "code",
  "laptop",
] as const;

export type SiteIconKey = (typeof SITE_ICON_KEYS)[number];
