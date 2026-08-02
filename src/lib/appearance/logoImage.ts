/** The class the customer site puts on its logo image, mirrored by hand from
 *  the app's `lib/appearance/logoImage.ts`. Only the CLASS travels: that file's
 *  `logoImageClassName()` helper pulls in `cn` (clsx + tailwind-merge), which
 *  no SDK consumer needs and which would drag two runtime dependencies into a
 *  package that has none.
 *
 *  Deliberately a SHIM, not a mirror — it is listed under `shims` in the app's
 *  `scripts/site-kit-mirrors.ts` for exactly this reason, the same way
 *  `src/lib/i18n.ts` carries the locale list without the app's 26k-line
 *  translation catalogue. The value below is the whole contract. */
export const SITE_LOGO_CLASS = "site-logo";
