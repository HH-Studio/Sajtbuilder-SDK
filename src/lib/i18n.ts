/** The app's supported locales, mirrored from `lib/i18n.ts`. The SDK needs the
 *  LIST (a Site Kit bundle is validated against it) but deliberately not the
 *  app's translation catalogue, which is tens of thousands of lines of admin
 *  copy no SDK consumer can use. */
export const LOCALES = ["sv", "en", "pl"] as const;
export type Locale = (typeof LOCALES)[number];

/** Pick the string for `locale` from a fully-translated record, falling back to
 *  English. Mirrors `lib/i18n.ts` in the app; the SDK only needs this helper,
 *  not the app's translation catalogue. */
export function pickL<T extends Record<Locale, string>>(
  obj: T,
  locale: Locale,
): string {
  return obj[locale] ?? obj.en;
}
