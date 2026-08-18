import { v } from "convex/values";
import type { Locale } from "./business";

// ---------------------------------------------------------------------------
// Trust marks — the handful of facts a customer checks before letting a
// stranger into their home, stated by the owner about their own business.
//
// The vocabulary is FIXED and small on purpose. Each entry is a claim published
// to consumers, so it exists here only because the owner can tick it about
// themselves and we can attribute it to them. Nothing is ever inferred: no
// badge is shown for a fact nobody told us.
//
// "Godkänd för F-skatt" is deliberately NOT in this list. We already hold it, on
// `companies.invoicingProfile.fSkatt` (convex/model/business.ts), and a second
// copy here would let a site say one thing while the invoices it sends say the
// other. The band reads the invoicing profile for that one.
//
// This is also the evidence `convex/generation/honesty.ts` accepts for the
// `guarantee` and `credentials` claim families. A guarantee the owner asserted
// is a different thing from a guarantee the copy engine invented, and the whole
// point of storing it is that the difference becomes checkable.
// ---------------------------------------------------------------------------

export const TRUST_MARK_KEYS = [
  /** Ansvarsförsäkring — cover for damage caused while working. */
  "insured",
  /** Kollektivavtal — a collective agreement covering the people who come. */
  "collective_agreement",
  /** ID- och bakgrundskontrollerad personal. */
  "id_checked",
  /** The firm's own guarantee on the work ("vi gör om det som blev fel"). */
  "guarantee",
] as const;

export type TrustMarkKey = (typeof TRUST_MARK_KEYS)[number];

/**
 * The trades this question is asked of, and the trades whose generated home
 * page carries the band.
 *
 * These are the quote-led jobs done in somebody's home or on their property,
 * where "are you insured, and who is coming?" is the question standing between
 * an enquiry and a booking. A restaurant is not asked, because the answer would
 * change nothing on its site.
 *
 * One list, two readers: the wizard step that asks, and the prepublish check
 * that warns when nobody answered. Any other business can still add the
 * certifications section by hand in the editor with its own facts.
 */
export const TRUST_MARK_VERTICALS: ReadonlySet<string> = new Set([
  "cleaning",
  "handyman",
]);

export const trustMarkKeyValidator = v.union(
  ...TRUST_MARK_KEYS.map((key) => v.literal(key)),
);

/** Per-mark note cap. One line explaining what the mark means for THIS firm
 *  ("2 års garanti på allt snickeri"), not a paragraph. */
export const TRUST_MARK_NOTE_MAX = 120;

/** What a website stores: which marks the owner ticked, plus one optional line
 *  of their own words per mark. The line is the owner's, so it is stored
 *  verbatim apart from trimming and the length clamp. */
export const trustMarksValidator = v.array(
  v.object({
    key: trustMarkKeyValidator,
    note: v.optional(v.string()),
  }),
);

export type TrustMark = { key: TrustMarkKey; note?: string };

const KEY_SET = new Set<string>(TRUST_MARK_KEYS);

/**
 * Narrow whatever a client sent into the stored shape: unknown keys dropped
 * (never coerced to a neighbouring mark — a wrong badge is a false claim),
 * duplicates collapsed keeping the first note, notes trimmed and clamped, and
 * an empty note stored as absent rather than as an empty string.
 *
 * Exported so `patchDraft`, the wizard step and the settings tab all narrow the
 * same way, and so a test can prove an unknown value never reaches the DB.
 */
export function normalizeTrustMarks(raw: unknown): TrustMark[] {
  if (!Array.isArray(raw)) return [];
  const out: TrustMark[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const key = (entry as { key?: unknown }).key;
    if (typeof key !== "string" || !KEY_SET.has(key) || seen.has(key)) continue;
    seen.add(key);
    const rawNote = (entry as { note?: unknown }).note;
    const note =
      typeof rawNote === "string"
        ? rawNote.replace(/\s+/g, " ").trim().slice(0, TRUST_MARK_NOTE_MAX)
        : "";
    out.push(note ? { key: key as TrustMarkKey, note } : { key: key as TrustMarkKey });
  }
  return out;
}

/**
 * What each ticked trust mark says, in the site's own language.
 *
 * Written in the FIRM'S voice on purpose. "Vi har ansvarsförsäkring" is the
 * owner stating a fact about their own business, which they can be held to; a
 * badge reading "Försäkrad" would imply we checked, and we did not.
 *
 * "Godkänd för F-skatt" is not here. It is read from the company's invoicing
 * profile, so a site can never say one thing while its invoices say another.
 *
 * Lives here rather than in `generation/build.ts` because generation is no
 * longer the only writer: Settings materialises the same band onto a site that
 * was made before the question existed, and two copies of these sentences would
 * eventually disagree about what the owner ticked.
 */
export const TRUST_MARK_LABELS: Record<TrustMarkKey, Record<Locale, string>> = {
  insured: {
    sv: "Vi har ansvarsförsäkring",
    en: "We carry liability insurance",
    pl: "Mamy ubezpieczenie OC",
  },
  collective_agreement: {
    sv: "Vi har kollektivavtal",
    en: "We have a collective agreement",
    pl: "Mamy układ zbiorowy pracy",
  },
  id_checked: {
    sv: "ID- och bakgrundskontrollerad personal",
    en: "ID-checked and vetted staff",
    pl: "Personel sprawdzony i zweryfikowany",
  },
  guarantee: {
    sv: "Vi lämnar garanti på arbetet",
    en: "We guarantee our work",
    pl: "Dajemy gwarancję na wykonaną pracę",
  },
};

/** The trust band's content for a set of ticked marks: the owner's statements,
 *  in their site's language, in the order the vocabulary defines them. One
 *  source for the generator and for the Settings door, so a band written last
 *  month and a band written today say the same thing. */
export function trustBandContent(
  marks: readonly TrustMark[],
  lang: Locale,
): {
  type: "certifications";
  heading: string;
  items: Array<{ label: string; note?: string }>;
} {
  const items = marks
    .map((mark) => {
      const label = TRUST_MARK_LABELS[mark.key]?.[lang];
      if (!label) return null;
      return mark.note ? { label, note: mark.note } : { label };
    })
    .filter((item): item is { label: string; note?: string } => item !== null);
  return {
    type: "certifications",
    heading:
      lang === "sv"
        ? "Bra att veta om oss"
        : lang === "pl"
          ? "Warto o nas wiedzieć"
          : "Good to know about us",
    items,
  };
}

/** True when the owner has asserted this mark about their own business. */
export function hasTrustMark(
  marks: readonly TrustMark[] | undefined,
  key: TrustMarkKey,
): boolean {
  return (marks ?? []).some((m) => m.key === key);
}
