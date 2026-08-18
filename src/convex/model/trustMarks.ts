import { v } from "convex/values";

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

/** True when the owner has asserted this mark about their own business. */
export function hasTrustMark(
  marks: readonly TrustMark[] | undefined,
  key: TrustMarkKey,
): boolean {
  return (marks ?? []).some((m) => m.key === key);
}
