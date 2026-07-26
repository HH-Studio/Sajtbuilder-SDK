import { pickL, type Locale } from "../i18n";

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

const LABELS: Record<ContentType, { sv: string; en: string; pl: string }> = {
  news: { sv: "Nyhet", en: "News", pl: "Aktualność" },
  offer: { sv: "Erbjudande", en: "Offer", pl: "Oferta" },
  "customer-story": { sv: "Kundcase", en: "Customer story", pl: "Historia klienta" },
  guide: { sv: "Guide", en: "Guide", pl: "Poradnik" },
  tips: { sv: "Tips", en: "Tips", pl: "Porady" },
  "new-service": { sv: "Ny tjänst", en: "New service", pl: "Nowa usługa" },
  event: { sv: "Evenemang", en: "Event", pl: "Wydarzenie" },
  seasonal: { sv: "Säsong", en: "Seasonal", pl: "Sezon" },
};

export function contentTypeLabel(type: ContentType, lang: Locale): string {
  return pickL(LABELS[type], lang);
}

export function isContentType(v: unknown): v is ContentType {
  return typeof v === "string" && (CONTENT_TYPES as readonly string[]).includes(v);
}
