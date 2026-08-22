// ---------------------------------------------------------------------------
// Which localisation convention this dataset uses.
//
// Sanity has three in the wild and no winner. An importer that assumes one gets
// the other two wrong IN SILENCE, which is the worst possible shape for this
// failure: half the content lands in one language and the other half is simply
// gone, with a report that says the import succeeded.
//
// So nothing is assumed. All three are detected, and a dataset where two look
// equally plausible is a HARD STOP that names what it saw. That is a worse
// experience than a guess exactly once - the first time - and a better one
// every time after, because the agency answers a question about their own
// dataset instead of discovering the answer from a client.
// ---------------------------------------------------------------------------

import type {
  SanityDocument,
  SanityI18nConvention,
  SanityI18nDetection,
} from "./model";

/** The `_type` names `@sanity/language-filter` and the field-level pattern
 *  conventionally use. A custom name is still caught by the shape test below. */
const LOCALE_TYPE = /^locale[A-Z]/;
/** A two- or five-letter language tag: `sv`, `en`, `sv-SE`, `pt-BR`. */
const LOCALE_TAG = /^[a-z]{2}(?:[-_][A-Za-z]{2,4})?$/;

/** True when an object looks like `{ _type: "localeString", sv: "…", en: "…" }`
 *  - two or more locale-tag keys and nothing else of substance. */
function looksLikeLocaleObject(value: unknown): string[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  const type = typeof rec._type === "string" ? rec._type : "";
  const keys = Object.keys(rec).filter((key) => !key.startsWith("_"));
  const tags = keys.filter((key) => LOCALE_TAG.test(key));
  if (tags.length < 2) {
    // One tag is only convincing when the `_type` says so too, otherwise a
    // field called `en` on a shipping form would read as a translation.
    return LOCALE_TYPE.test(type) && tags.length === 1 ? tags : null;
  }
  if (tags.length !== keys.length && !LOCALE_TYPE.test(type)) return null;
  return tags;
}

function walk(value: unknown, onLocaleObject: (tags: string[]) => void, depth = 0): void {
  if (depth > 6 || !value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const entry of value) walk(entry, onLocaleObject, depth + 1);
    return;
  }
  const tags = looksLikeLocaleObject(value);
  if (tags) {
    onLocaleObject(tags);
    return;
  }
  for (const entry of Object.values(value as Record<string, unknown>)) {
    walk(entry, onLocaleObject, depth + 1);
  }
}

/**
 * Look at the whole dataset and say which convention it uses.
 *
 * `ambiguous` is a real answer and the caller must treat it as a stop, not as a
 * default. It means two conventions each have real evidence, and picking one
 * would drop the other's content.
 */
export function detectI18n(
  documents: Iterable<SanityDocument>,
): SanityI18nDetection {
  const evidence: string[] = [];
  const locales: string[] = [];
  const seeLocale = (tag: string): void => {
    const normalized = tag.toLowerCase();
    if (!locales.includes(normalized)) locales.push(normalized);
  };

  let fieldHits = 0;
  let metadataHits = 0;
  let documentHits = 0;
  const idSuffixByBase = new Map<string, Set<string>>();

  for (const doc of documents) {
    // 1. Field-level.
    walk(doc, (tags) => {
      fieldHits += 1;
      for (const tag of tags) seeLocale(tag);
    });

    // 2. `@sanity/document-internationalization` metadata documents.
    if (doc._type === "translation.metadata") {
      metadataHits += 1;
      const translations = doc.translations;
      if (Array.isArray(translations)) {
        for (const entry of translations) {
          const key = (entry as { _key?: unknown })?._key;
          if (typeof key === "string" && LOCALE_TAG.test(key)) seeLocale(key);
        }
      }
      continue;
    }

    // 3. Document-level: an explicit language field, or an id suffix.
    const language =
      (typeof doc.language === "string" && doc.language) ||
      (typeof doc.__i18n_lang === "string" && doc.__i18n_lang) ||
      "";
    if (language && LOCALE_TAG.test(language)) {
      documentHits += 1;
      seeLocale(language);
      continue;
    }
    const suffix = /^(.*)[-_]([a-z]{2}(?:[-_][A-Za-z]{2,4})?)$/.exec(doc._id);
    if (suffix) {
      const seen = idSuffixByBase.get(suffix[1]) ?? new Set<string>();
      seen.add(suffix[2].toLowerCase());
      idSuffixByBase.set(suffix[1], seen);
    }
  }

  // An id suffix is only evidence when the SAME base id appears under two
  // different tags. One document called `about-us` is not Swedish content, it
  // is a document whose slug happens to end in two letters.
  let suffixPairs = 0;
  for (const [, tags] of idSuffixByBase) {
    if (tags.size >= 2) {
      suffixPairs += 1;
      for (const tag of tags) seeLocale(tag);
    }
  }
  if (suffixPairs > 0) documentHits += suffixPairs;

  if (fieldHits > 0) {
    evidence.push(`${fieldHits} field(s) hold one value per language`);
  }
  if (metadataHits > 0) {
    evidence.push(`${metadataHits} translation.metadata document(s)`);
  }
  if (documentHits > 0) {
    evidence.push(`${documentHits} document(s) carry a language of their own`);
  }

  const candidates: SanityI18nConvention[] = [];
  if (fieldHits > 0) candidates.push("field");
  if (metadataHits > 0) candidates.push("metadata");
  if (documentHits > 0) candidates.push("document");

  if (candidates.length === 0) {
    return { convention: "none", locales, evidence };
  }
  if (candidates.length === 1) {
    return { convention: candidates[0], locales, evidence };
  }
  // `metadata` and `document` are two halves of ONE convention: the plugin
  // stores the per-locale documents and a metadata document that links them.
  // Seeing both is not ambiguity, it is the plugin working as designed.
  if (
    candidates.length === 2 &&
    candidates.includes("metadata") &&
    candidates.includes("document")
  ) {
    return { convention: "metadata", locales, evidence };
  }
  return { convention: "ambiguous", locales, evidence };
}

/** Pick one language out of a field-level locale object. Returns undefined
 *  when the value is not one, so a caller can fall through to the raw value. */
export function pickLocale(
  value: unknown,
  preferred: string,
): { value: unknown; droppedLocales: string[] } | undefined {
  const tags = looksLikeLocaleObject(value);
  if (!tags) return undefined;
  const rec = value as Record<string, unknown>;
  const wanted =
    tags.find((tag) => tag.toLowerCase() === preferred.toLowerCase()) ?? tags[0];
  return {
    value: rec[wanted],
    droppedLocales: tags.filter((tag) => tag !== wanted),
  };
}
