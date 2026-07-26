export type Locale = "sv" | "en" | "pl";

/** Pick the string for `locale` from a fully-translated record, falling back to
 *  English. Mirrors `lib/i18n.ts` in the app; the SDK only needs this helper,
 *  not the app's translation catalogue. */
export function pickL<T extends Record<Locale, string>>(
  obj: T,
  locale: Locale,
): string {
  return obj[locale] ?? obj.en;
}
