import type { PortableSiteV1 } from "../../convex/model/portable";
import { isTranslatable } from "../site/multilang";
import { CAREERS_SEGMENT } from "../site/jobs";
import { NEWS_SEGMENT } from "../site/news";
import { slugify } from "../site/slugify";
import { PORTABLE_CAPS } from "./caps";

export type PortableLocalizationIssue =
  | "primary_locale"
  | "undeclared_locale"
  | "duplicate_locale"
  | "page_mismatch"
  | "section_mismatch"
  | "bad_slug"
  | "duplicate_slug"
  | "shape_mismatch"
  | "too_large";

function sameLocalizedShape(primary: unknown, localized: unknown, key: string | null = null): boolean {
  if (typeof primary === "string") {
    return typeof localized === "string" && (isTranslatable(key, primary) || localized === primary);
  }
  if (primary === null || typeof primary !== "object") return Object.is(primary, localized);
  if (Array.isArray(primary)) {
    return Array.isArray(localized) &&
      primary.length === localized.length &&
      primary.every((value, index) => sameLocalizedShape(value, localized[index], key));
  }
  if (!localized || typeof localized !== "object" || Array.isArray(localized)) return false;
  const a = Object.keys(primary as Record<string, unknown>);
  const b = Object.keys(localized as Record<string, unknown>);
  return a.length === b.length && a.every((childKey) =>
    Object.prototype.hasOwnProperty.call(localized, childKey) &&
    sameLocalizedShape(
      (primary as Record<string, unknown>)[childKey],
      (localized as Record<string, unknown>)[childKey],
      childKey,
    ),
  );
}

/** Keep the current primary structure and non-prose values, replacing only authored text leaves. */
export function overlayLocalizedText<T>(
  primary: T,
  localized: unknown,
  key: string | null = null,
): T {
  if (typeof primary === "string") {
    return (isTranslatable(key, primary) && typeof localized === "string"
      ? localized
      : primary) as T;
  }
  if (Array.isArray(primary)) {
    const source = Array.isArray(localized) ? localized : [];
    return primary.map((value, index) =>
      overlayLocalizedText(value, source[index], key),
    ) as T;
  }
  if (!primary || typeof primary !== "object") return primary;
  const source = localized && typeof localized === "object" && !Array.isArray(localized)
    ? localized as Record<string, unknown>
    : {};
  return Object.fromEntries(
    Object.entries(primary as Record<string, unknown>).map(([childKey, value]) => [
      childKey,
      overlayLocalizedText(value, source[childKey], childKey),
    ]),
  ) as T;
}

/** Strict additive validation beyond the Convex shape validator. */
export function validatePortableLocalizations(site: PortableSiteV1): PortableLocalizationIssue | null {
  const localizations = site.localizations ?? [];
  if (localizations.length === 0) return null;
  if (new TextEncoder().encode(JSON.stringify(localizations)).byteLength > PORTABLE_CAPS.maxJsonBytes) {
    return "too_large";
  }
  const languages = new Set(site.site.languages ?? [site.site.language]);
  const pageByTmp = new Map(site.pages.map((page) => [page.tmpId, page]));
  const sectionByTmp = new Map(
    site.sections.flatMap((section) => section.tmpId ? [[section.tmpId, section] as const] : []),
  );
  const seenLocales = new Set<string>();

  for (const localization of localizations) {
    if (localization.locale === site.site.language) return "primary_locale";
    if (!languages.has(localization.locale)) return "undeclared_locale";
    if (seenLocales.has(localization.locale)) return "duplicate_locale";
    seenLocales.add(localization.locale);
    if (localization.pages.length !== site.pages.length) return "page_mismatch";
    if (localization.sections.length !== site.sections.length) return "section_mismatch";

    const pageIds = new Set<string>();
    const slugs = new Set<string>([NEWS_SEGMENT]);
    for (const page of localization.pages) {
      const primary = pageByTmp.get(page.pageTmpId);
      if (!primary || pageIds.has(page.pageTmpId)) return "page_mismatch";
      pageIds.add(page.pageTmpId);
      const careersLanding =
        primary.slug === CAREERS_SEGMENT && primary.pageType !== "job";
      // Careers is a typed, reserved route rather than an ordinary localized
      // page address. The landing must stay at /careers in every locale, and no
      // other page may claim that segment.
      if (careersLanding ? page.slug !== CAREERS_SEGMENT : page.slug === CAREERS_SEGMENT) {
        return "bad_slug";
      }
      if (page.slug !== "" && slugify(page.slug) !== page.slug) return "bad_slug";
      if (slugs.has(page.slug)) return "duplicate_slug";
      slugs.add(page.slug);
      const primaryJob = primary.pageType === "job" ? primary.job : undefined;
      if (primaryJob) {
        if (!page.job) return "shape_mismatch";
        const proseKeys = [
          "summary",
          "description",
          "location",
          "hoursText",
          "salaryText",
        ] as const;
        if (proseKeys.some((key) =>
          primaryJob[key] === undefined
            ? page.job?.[key] !== undefined
            : typeof page.job?.[key] !== "string",
        )) return "shape_mismatch";
        if (
          primaryJob.requirements === undefined
            ? page.job.requirements !== undefined
            : !Array.isArray(page.job.requirements) ||
              page.job.requirements.length !== primaryJob.requirements.length
        ) return "shape_mismatch";
      } else if (page.job !== undefined) {
        return "shape_mismatch";
      }
    }

    const sectionIds = new Set<string>();
    for (const section of localization.sections) {
      const primary = sectionByTmp.get(section.sectionTmpId);
      if (!primary || sectionIds.has(section.sectionTmpId)) return "section_mismatch";
      sectionIds.add(section.sectionTmpId);
      if (!sameLocalizedShape(primary.content, section.content)) return "shape_mismatch";
    }
  }
  return null;
}
