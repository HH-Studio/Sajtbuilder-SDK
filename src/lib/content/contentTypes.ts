import type { Locale } from "../i18n";

// ---------------------------------------------------------------------------
// Content kinds the AI Content Assistant can detect for a post (owner-
// overridable). Shared client + server, pure data. The Convex validator in
// convex/schema.ts is built from CONTENT_TYPES so the two never drift.
// ---------------------------------------------------------------------------

/** The content kinds, in picker order. */
export const CONTENT_TYPES = [
  "news",
  "offer",
  "customer-story",
  "guide",
  "tips",
  "new-service",
  "event",
  "seasonal",
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

const LABELS: Record<ContentType, { sv: string; en: string }> = {
  news: { sv: "Nyhet", en: "News" },
  offer: { sv: "Erbjudande", en: "Offer" },
  "customer-story": { sv: "Kundcase", en: "Customer story" },
  guide: { sv: "Guide", en: "Guide" },
  tips: { sv: "Tips", en: "Tips" },
  "new-service": { sv: "Ny tjänst", en: "New service" },
  event: { sv: "Evenemang", en: "Event" },
  seasonal: { sv: "Säsong", en: "Seasonal" },
};

export function contentTypeLabel(type: ContentType, lang: Locale): string {
  return (LABELS[type] as Record<string, string>)[lang] ?? LABELS[type].en;
}

export function isContentType(v: unknown): v is ContentType {
  return typeof v === "string" && (CONTENT_TYPES as readonly string[]).includes(v);
}
