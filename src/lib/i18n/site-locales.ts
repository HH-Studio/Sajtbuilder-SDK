// ---------------------------------------------------------------------------
// Customer-website content languages.
//
// Separate from the admin UI dictionary (`LOCALES` in lib/i18n.ts = sv/en/pl).
// Site visitors can get more languages because content is AI-translated on
// publish; the admin app stays handwritten in three languages only.
//
// Adding a SITE_LOCALE does NOT mean translating lib/i18n.ts. It means:
//   1. native name below
//   2. visitor chrome (consent, forms, booking, quote wizard, …)
//   3. LANG_NAME in convex/generation/translate.ts
//   4. help docs
// ---------------------------------------------------------------------------

export const SITE_LOCALES = [
  "sv",
  "en",
  "pl",
  "de",
  "da",
  "no",
  "fi",
  "fr",
  "es",
] as const;

export type SiteLocale = (typeof SITE_LOCALES)[number];

/** Seed / generation copy tables stay on these three. New primary languages
 *  fall back to English seeds, then AI polish/translate into the primary. */
export const GENERATION_LOCALES = ["sv", "en", "pl"] as const;
export type GenerationLocale = (typeof GENERATION_LOCALES)[number];

/** Native autonym — shown in language pickers so a Swedish owner can spot
 *  "Deutsch" without reading a translation of the word German. */
export const SITE_LOCALE_LABELS: Record<SiteLocale, string> = {
  sv: "Svenska",
  en: "English",
  pl: "Polski",
  de: "Deutsch",
  da: "Dansk",
  no: "Norsk",
  fi: "Suomi",
  fr: "Français",
  es: "Español",
};

/** English names for LLM prompts ("Translate into German"). */
export const SITE_LOCALE_ENGLISH_NAMES: Record<SiteLocale, string> = {
  sv: "Swedish",
  en: "English",
  pl: "Polish",
  de: "German",
  da: "Danish",
  no: "Norwegian",
  fi: "Finnish",
  fr: "French",
  es: "Spanish",
};

/** BCP-47 tags for Intl date/number formatters on the published site. */
export const SITE_LOCALE_INTL: Record<SiteLocale, string> = {
  sv: "sv-SE",
  en: "en-GB",
  pl: "pl-PL",
  de: "de-DE",
  da: "da-DK",
  no: "nb-NO",
  fi: "fi-FI",
  fr: "fr-FR",
  es: "es-ES",
};

export function isSiteLocale(value: string | null | undefined): value is SiteLocale {
  return !!value && (SITE_LOCALES as readonly string[]).includes(value);
}

/** Prefer the requested language; fall back to English (never blank). Every
 *  visitor-chrome table must include at least `en`. */
export function pickSiteL(
  obj: Partial<Record<SiteLocale, string>> & { en: string },
  lang: SiteLocale | string,
): string {
  if (isSiteLocale(lang) && obj[lang]) return obj[lang]!;
  return obj.en;
}

export function siteLocaleIntl(lang: SiteLocale | string): string {
  return isSiteLocale(lang) ? SITE_LOCALE_INTL[lang] : SITE_LOCALE_INTL.en;
}

/** Narrow a website's SITE_LOCALE down to the admin dictionary's three
 *  languages (`lib/i18n.ts` `Locale`). Use at the boundary where a website's
 *  content language reaches something still driven by the handwritten admin
 *  dict - transactional emails (`convex/lib/emailTemplates.ts`), invoice/offer
 *  PDFs, in-app notifications. Adding a SITE_LOCALE does not translate those;
 *  they fall back to English. */
export function toAdminDictLocale(lang: SiteLocale): "sv" | "en" | "pl" {
  return lang === "sv" || lang === "en" || lang === "pl" ? lang : "en";
}

/** Narrow a chosen primary SITE_LOCALE down to a GENERATION_LOCALE for the
 *  deterministic engine (`convex/generation/**`), which only has hand-authored
 *  copy tables for sv/en/pl. A primary language beyond those three seeds in
 *  English; the post-publish translate pass then carries it into the real
 *  primary (same mechanism secondary locales already use). Same fallback rule
 *  as `toAdminDictLocale`, kept as a separate name so call sites read as
 *  "generation seed language", not "admin dict language". */
export function toGenerationLocale(lang: SiteLocale): GenerationLocale {
  return lang === "sv" || lang === "en" || lang === "pl" ? lang : "en";
}
