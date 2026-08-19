import type { SiteSnapshot } from "../../convex/model/snapshot";
import type { SiteLocale } from "../i18n/site-locales";
import { NEWS_SEGMENT } from "./news";
import { CAREERS_SEGMENT } from "./jobs";

// ---------------------------------------------------------------------------
// Multi-language helpers (pure, shared client+server). Multi-language sites are
// produced by TRANSLATING the published snapshot per locale (the owner edits one
// primary language; secondary locales are auto-translated at publish). These
// helpers extract the translatable display strings from a snapshot and write
// translations back WITHOUT touching structure - we only ever swap string leaves
// in place, so the result still validates against the snapshot schema.
// ---------------------------------------------------------------------------

// Object keys whose string values are never human prose (ids, urls, enums, …).
const SKIP_KEYS = new Set([
  "anchorId", "assetId", "id", "url", "href", "src", "embedUrl", "videoUrl",
  "icon", "color", "bg", "fg", "primary", "accent", "platform", "handle",
  "value", "slug", "pageSlug", "focalX", "focalY", "tone", "variant", "kind",
  "type", "font", "palette", "mimeType", "blurhash",
  // `areaLinks[].area` on a coverage band is a structural JOIN key, not prose:
  // `ServiceAreas` links a town to its own page by matching it against the
  // visible `areas[]` label. Translated as an ordinary string it drifted from
  // that label - a hedged "Solna och omnejd" corrected in one locale, or simply
  // rendered differently by the machine pass - and the town silently became
  // plain text on that locale only. So it is never translated on its own; it is
  // rebuilt from the localized label instead (`relinkAreas`).
  "area",
]);
// `metaTitle` used to sit in the list above, which meant the <title>, the OG
// title and the Google SERP title on /en and /pl were all still Swedish - the
// single most SEO-relevant string on the page, untranslated on every localized
// site (audit 2026-07-30). It is prose, and it is translated beside
// metaDescription in every one of the three passes below.

// Value shapes that must never be translated even under a prose-looking key.
const SKIP_VALUE: RegExp[] = [
  /^https?:\/\//i, // url
  /^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i, // email
  /^[+]?[\d][\d\s()./-]{5,}$/, // phone
  /^#?[0-9a-fA-F]{3,8}$/, // hex color
  /^[a-z0-9]{16,}$/i, // id-ish token
];

/** Is this string leaf human-readable display text worth translating? */
export function isTranslatable(key: string | null, val: string): boolean {
  if (key && SKIP_KEYS.has(key)) return false;
  const t = val.trim();
  if (t.length === 0) return false;
  if (!/[a-zA-ZåäöÅÄÖ]/.test(t)) return false; // no letters → not prose
  return !SKIP_VALUE.some((re) => re.test(t));
}

// Recursively rebuild a content value, calling fn() on each translatable string
// leaf. Deterministic traversal (object insertion order, then array index) so a
// collect pass and an apply pass visit the SAME strings in the SAME order.
function walk(node: unknown, key: string | null, fn: (t: string) => string): unknown {
  if (typeof node === "string") return isTranslatable(key, node) ? fn(node) : node;
  if (Array.isArray(node)) return node.map((v) => walk(v, key, fn));
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(node as Record<string, unknown>)) {
      out[k] = walk((node as Record<string, unknown>)[k], k, fn);
    }
    return out;
  }
  return node;
}

type AreaBand = { type?: unknown; areas?: unknown; areaLinks?: unknown };

const areaKey = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

/**
 * Carry a coverage band's town-page links onto the localized labels.
 *
 * `area` is skipped by `isTranslatable` (see SKIP_KEYS), so the link key arrives
 * here still in the primary language while `areas[]` has been localized. The
 * pairing is positional against the ORIGINAL list, which is the only place the
 * two are known to agree — never a second translation of the same town name.
 * A link whose town is no longer in the list keeps its key and simply renders as
 * plain text, exactly as it does today.
 */
function relinkAreas(original: unknown, localized: unknown): unknown {
  const before = original as AreaBand | null;
  if (!before || typeof before !== "object" || before.type !== "service-areas") {
    return localized;
  }
  const links = before.areaLinks;
  if (!Array.isArray(links) || links.length === 0) return localized;
  const from = Array.isArray(before.areas) ? before.areas : [];
  const after = (localized as AreaBand | null)?.areas;
  const to = Array.isArray(after) ? after : [];
  return {
    ...(localized as Record<string, unknown>),
    areaLinks: links.map((link) => {
      const key = areaKey((link as { area?: unknown }).area);
      const index = key ? from.findIndex((label) => areaKey(label) === key) : -1;
      const localizedLabel = index >= 0 ? to[index] : undefined;
      return typeof localizedLabel === "string" && localizedLabel.trim()
        ? { ...(link as Record<string, unknown>), area: localizedLabel }
        : link;
    }),
  };
}

/** One section's content with every translatable leaf mapped through `fn`, and
 *  the coverage band's page links carried onto the localized labels. */
function mapNodeText<T>(node: T, fn: (t: string) => string): T {
  return relinkAreas(node, walk(node, null, fn)) as T;
}

/**
 * Map every translatable display string in a snapshot through `fn`, returning a
 * new snapshot. Scope: page titles + meta descriptions, nav labels, the site
 * default description, and all prose inside section content. Brand name, SEO
 * title templates, urls, contact details, theme tokens and asset maps are left
 * untouched.
 */
export function mapSnapshotText(
  snapshot: SiteSnapshot,
  fn: (t: string) => string,
): SiteSnapshot {
  const tx = (key: string, val: string) => (isTranslatable(key, val) ? fn(val) : val);
  return {
    ...snapshot,
    seo: {
      ...snapshot.seo,
      defaultDescription: tx("defaultDescription", snapshot.seo.defaultDescription),
    },
    newsIndex: snapshot.newsIndex
      ? {
          ...snapshot.newsIndex,
          ...(snapshot.newsIndex.intro !== undefined
            ? { intro: tx("intro", snapshot.newsIndex.intro) }
            : {}),
        }
      : undefined,
    nav: snapshot.nav.map((n) => ({ ...n, label: tx("label", n.label) })),
    navCta:
      snapshot.navCta && snapshot.navCta !== "off"
        ? { ...snapshot.navCta, label: tx("label", snapshot.navCta.label) }
        : snapshot.navCta,
    navMegaMenu: snapshot.navMegaMenu
      ? (walk(snapshot.navMegaMenu, null, fn) as typeof snapshot.navMegaMenu)
      : undefined,
    visitorAssistant: snapshot.visitorAssistant
      ? {
          ...snapshot.visitorAssistant,
          ...(snapshot.visitorAssistant.greeting !== undefined
            ? {
                greeting: tx("greeting", snapshot.visitorAssistant.greeting),
              }
            : {}),
        }
      : undefined,
    pages: snapshot.pages.map((p) => ({
      ...p,
      title: tx("title", p.title),
      ...(p.job
        ? {
            job: {
              ...p.job,
              summary: tx("summary", p.job.summary),
              description: tx("description", p.job.description),
              requirements: p.job.requirements.map((requirement) =>
                tx("requirement", requirement),
              ),
              location: tx("location", p.job.location),
              ...(p.job.hoursText !== undefined
                ? { hoursText: tx("hoursText", p.job.hoursText) }
                : {}),
              ...(p.job.salaryText !== undefined
                ? { salaryText: tx("salaryText", p.job.salaryText) }
                : {}),
            },
          }
        : {}),
      // Post excerpt is display prose (news card + meta description) → translate
      // it too, in the same position for collect/apply symmetry.
      ...(p.excerpt !== undefined ? { excerpt: tx("excerpt", p.excerpt) } : {}),
      seo: {
        ...p.seo,
        metaTitle: tx("metaTitle", p.seo.metaTitle),
        metaDescription: tx("metaDescription", p.seo.metaDescription),
      },
      sections: p.sections.map((sec) => ({
        ...sec,
        content: mapNodeText(sec.content, fn),
      })),
    })),
  };
}

/**
 * The same traversal, applied to ANY content node rather than a whole snapshot.
 *
 * Used by the legal-page translation (`convex/legal.ts`), whose unit is one
 * section's `{ heading, blocks }` rather than a site. Going through the shared
 * walker is what keeps that safe: a legal block is a `richBlock`, so it may
 * carry a heading LEVEL, a bullet list under `items` instead of `text`, or
 * inline spans with `bold` / `href` — and a hand-rolled `blocks.map(b => b.text)`
 * silently drops all three. It also inherits `isTranslatable`, so the contact
 * email and phone number inside a privacy policy are left exactly as written.
 */
export function mapContentText<T>(node: T, fn: (t: string) => string): T {
  return mapNodeText(node, fn);
}

/** Every translatable string in a content node, in deterministic order. */
export function collectContentText(node: unknown): string[] {
  const out: string[] = [];
  mapContentText(node, (t) => {
    out.push(t);
    return t;
  });
  return out;
}

/**
 * Write `translated` back into a content node, in `collectContentText` order.
 * Null on a count mismatch, so a caller falls back to the original rather than
 * pairing translations with the wrong strings.
 */
export function applyContentText<T>(node: T, translated: string[]): T | null {
  if (translated.length !== collectContentText(node).length) return null;
  let i = 0;
  return mapContentText(node, (t) => translated[i++] ?? t);
}

/** All translatable strings in deterministic order (for the translation call). */
export function collectSnapshotText(snapshot: SiteSnapshot): string[] {
  const out: string[] = [];
  mapSnapshotText(snapshot, (t) => {
    out.push(t);
    return t;
  });
  return out;
}

/**
 * Write `translated` back into a snapshot, in the same order as
 * collectSnapshotText. Returns null if the count doesn't match (so the caller
 * falls back to the untranslated primary rather than corrupting the page).
 */
export function applySnapshotText(
  snapshot: SiteSnapshot,
  translated: string[],
): SiteSnapshot | null {
  if (translated.length !== collectSnapshotText(snapshot).length) return null;
  let i = 0;
  return mapSnapshotText(snapshot, (t) => translated[i++] ?? t);
}

export type SnapshotTextField = {
  key: string;
  text: string;
  pageSlug: string | null;
  pageTitle: string | null;
  scope: "site" | "nav" | "page";
};

const slugKey = (slug: string) => encodeURIComponent(slug || "__home__");

/**
 * A stable-enough per-section key: the section TYPE plus its ordinal among the
 * sections of that type on the page.
 *
 * A snapshot section carries no id of its own, and the key used to be the raw
 * array index - so deleting or reordering ANY section shifted every key after
 * it, and the owner's hand-corrected translations silently reverted to the
 * primary language for every section below the change (audit 2026-07-30).
 * Adding a second FAQ block still shifts the second FAQ's key, but adding,
 * moving or deleting a section of a DIFFERENT type no longer touches it.
 */
function sectionKeys(sections: ReadonlyArray<{ type: string }>): string[] {
  const seen = new Map<string, number>();
  return sections.map((s) => {
    const n = seen.get(s.type) ?? 0;
    seen.set(s.type, n + 1);
    return `${s.type}~${n}`;
  });
}

function collectNodeFields(
  node: unknown,
  key: string | null,
  path: string,
  prefix: string,
  meta: Omit<SnapshotTextField, "key" | "text">,
  out: SnapshotTextField[],
) {
  if (typeof node === "string") {
    if (!isTranslatable(key, node)) return;
    out.push({
      ...meta,
      key: path ? `${prefix}.${path}` : prefix,
      text: node,
    });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) =>
      collectNodeFields(v, key, path ? `${path}.${i}` : `${i}`, prefix, meta, out),
    );
    return;
  }
  if (node && typeof node === "object") {
    for (const k of Object.keys(node as Record<string, unknown>)) {
      collectNodeFields(
        (node as Record<string, unknown>)[k],
        k,
        path ? `${path}.${k}` : k,
        prefix,
        meta,
        out,
      );
    }
  }
}

/** Stable-key view of the same translatable leaves, used by the manual review UI. */
export function collectSnapshotTextFields(
  snapshot: SiteSnapshot,
  opts: { pageSlug?: string } = {},
): SnapshotTextField[] {
  const out: SnapshotTextField[] = [];
  const pageSlug = opts.pageSlug;
  if (pageSlug === undefined) {
    if (
      snapshot.newsIndex?.intro !== undefined &&
      isTranslatable("intro", snapshot.newsIndex.intro)
    ) {
      out.push({
        key: "site.newsIndex.intro",
        text: snapshot.newsIndex.intro,
        pageSlug: null,
        pageTitle: null,
        scope: "site",
      });
    }
    if (isTranslatable("defaultDescription", snapshot.seo.defaultDescription)) {
      out.push({
        key: "site.seo.defaultDescription",
        text: snapshot.seo.defaultDescription,
        pageSlug: null,
        pageTitle: null,
        scope: "site",
      });
    }
    snapshot.nav.forEach((n, i) => {
      if (!isTranslatable("label", n.label)) return;
      out.push({
        key: `nav.${i}.label`,
        text: n.label,
        pageSlug: n.pageSlug,
        pageTitle: null,
        scope: "nav",
      });
    });
    if (
      snapshot.navCta !== undefined &&
      snapshot.navCta !== "off" &&
      isTranslatable("label", snapshot.navCta.label)
    ) {
      out.push({
        key: "site.navCta.label",
        text: snapshot.navCta.label,
        pageSlug: null,
        pageTitle: null,
        scope: "site",
      });
    }
    if (snapshot.navMegaMenu) {
      collectNodeFields(
        snapshot.navMegaMenu,
        null,
        "",
        "site.navMegaMenu",
        { pageSlug: null, pageTitle: null, scope: "site" },
        out,
      );
    }
    if (
      snapshot.visitorAssistant?.greeting !== undefined &&
      isTranslatable("greeting", snapshot.visitorAssistant.greeting)
    ) {
      out.push({
        key: "site.visitorAssistant.greeting",
        text: snapshot.visitorAssistant.greeting,
        pageSlug: null,
        pageTitle: null,
        scope: "site",
      });
    }
  }

  for (const p of snapshot.pages) {
    if (pageSlug !== undefined && p.slug !== pageSlug) continue;
    const pageMeta = { pageSlug: p.slug, pageTitle: p.title, scope: "page" as const };
    const pagePrefix = `page.${slugKey(p.slug)}`;
    if (isTranslatable("title", p.title)) {
      out.push({ ...pageMeta, key: `${pagePrefix}.title`, text: p.title });
    }
    if (p.excerpt !== undefined && isTranslatable("excerpt", p.excerpt)) {
      out.push({ ...pageMeta, key: `${pagePrefix}.excerpt`, text: p.excerpt });
    }
    if (p.job) {
      const addJobText = (key: string, text: string | undefined) => {
        if (text !== undefined && isTranslatable(key, text)) {
          out.push({
            ...pageMeta,
            key: `${pagePrefix}.job.${key}`,
            text,
          });
        }
      };
      addJobText("summary", p.job.summary);
      addJobText("description", p.job.description);
      p.job.requirements.forEach((requirement, index) => {
        if (isTranslatable("requirement", requirement)) {
          out.push({
            ...pageMeta,
            key: `${pagePrefix}.job.requirements.${index}`,
            text: requirement,
          });
        }
      });
      addJobText("location", p.job.location);
      addJobText("hoursText", p.job.hoursText);
      addJobText("salaryText", p.job.salaryText);
    }
    if (isTranslatable("metaTitle", p.seo.metaTitle)) {
      out.push({
        ...pageMeta,
        key: `${pagePrefix}.seo.metaTitle`,
        text: p.seo.metaTitle,
      });
    }
    if (isTranslatable("metaDescription", p.seo.metaDescription)) {
      out.push({
        ...pageMeta,
        key: `${pagePrefix}.seo.metaDescription`,
        text: p.seo.metaDescription,
      });
    }
    const keys = sectionKeys(p.sections);
    p.sections.forEach((sec, sectionIndex) => {
      collectNodeFields(
        sec.content,
        null,
        "",
        `${pagePrefix}.sections.${keys[sectionIndex]}.content`,
        pageMeta,
        out,
      );
    });
  }
  return out;
}

function applyNodeOverrides(
  node: unknown,
  key: string | null,
  path: string,
  prefix: string,
  overrides: Record<string, string>,
): unknown {
  if (typeof node === "string") {
    if (!isTranslatable(key, node)) return node;
    const fieldKey = path ? `${prefix}.${path}` : prefix;
    return Object.prototype.hasOwnProperty.call(overrides, fieldKey)
      ? overrides[fieldKey]
      : node;
  }
  if (Array.isArray(node)) {
    return node.map((v, i) =>
      applyNodeOverrides(v, key, path ? `${path}.${i}` : `${i}`, prefix, overrides),
    );
  }
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(node as Record<string, unknown>)) {
      out[k] = applyNodeOverrides(
        (node as Record<string, unknown>)[k],
        k,
        path ? `${path}.${k}` : k,
        prefix,
        overrides,
      );
    }
    return out;
  }
  return node;
}

/** Apply manual translated-text overrides by stable key without changing shape. */
export function applySnapshotTextOverrides(
  snapshot: SiteSnapshot,
  overrides: Record<string, string>,
): SiteSnapshot {
  const pick = (key: string, value: string) =>
    Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : value;
  return {
    ...snapshot,
    seo: {
      ...snapshot.seo,
      defaultDescription: pick("site.seo.defaultDescription", snapshot.seo.defaultDescription),
    },
    newsIndex: snapshot.newsIndex
      ? {
          ...snapshot.newsIndex,
          ...(snapshot.newsIndex.intro !== undefined
            ? {
                intro: pick("site.newsIndex.intro", snapshot.newsIndex.intro),
              }
            : {}),
        }
      : undefined,
    nav: snapshot.nav.map((n, i) => ({
      ...n,
      label: pick(`nav.${i}.label`, n.label),
    })),
    navCta:
      snapshot.navCta && snapshot.navCta !== "off"
        ? {
            ...snapshot.navCta,
            label: pick("site.navCta.label", snapshot.navCta.label),
          }
        : snapshot.navCta,
    navMegaMenu: snapshot.navMegaMenu
      ? (applyNodeOverrides(
          snapshot.navMegaMenu,
          null,
          "",
          "site.navMegaMenu",
          overrides,
        ) as typeof snapshot.navMegaMenu)
      : undefined,
    visitorAssistant: snapshot.visitorAssistant
      ? {
          ...snapshot.visitorAssistant,
          ...(snapshot.visitorAssistant.greeting !== undefined
            ? {
                greeting: pick(
                  "site.visitorAssistant.greeting",
                  snapshot.visitorAssistant.greeting,
                ),
              }
            : {}),
        }
      : undefined,
    pages: snapshot.pages.map((p) => {
      const pagePrefix = `page.${slugKey(p.slug)}`;
      const keys = sectionKeys(p.sections);
      return {
        ...p,
        title: pick(`${pagePrefix}.title`, p.title),
        ...(p.excerpt !== undefined ? { excerpt: pick(`${pagePrefix}.excerpt`, p.excerpt) } : {}),
        ...(p.job
          ? {
              job: {
                ...p.job,
                summary: pick(`${pagePrefix}.job.summary`, p.job.summary),
                description: pick(`${pagePrefix}.job.description`, p.job.description),
                requirements: p.job.requirements.map((requirement, index) =>
                  pick(`${pagePrefix}.job.requirements.${index}`, requirement),
                ),
                location: pick(`${pagePrefix}.job.location`, p.job.location),
                ...(p.job.hoursText !== undefined
                  ? {
                      hoursText: pick(
                        `${pagePrefix}.job.hoursText`,
                        p.job.hoursText,
                      ),
                    }
                  : {}),
                ...(p.job.salaryText !== undefined
                  ? {
                      salaryText: pick(
                        `${pagePrefix}.job.salaryText`,
                        p.job.salaryText,
                      ),
                    }
                  : {}),
              },
            }
          : {}),
        seo: {
          ...p.seo,
          metaTitle: pick(`${pagePrefix}.seo.metaTitle`, p.seo.metaTitle),
          metaDescription: pick(`${pagePrefix}.seo.metaDescription`, p.seo.metaDescription),
        },
        sections: p.sections.map((sec, sectionIndex) => ({
          ...sec,
          // Same relink as the machine pass: an owner correcting a town's label
          // by hand must not break the link to that town's own page.
          content: relinkAreas(
            sec.content,
            applyNodeOverrides(
              sec.content,
              null,
              "",
              `${pagePrefix}.sections.${keys[sectionIndex]}.content`,
              overrides,
            ),
          ) as typeof sec.content,
        })),
      };
    }),
  };
}

/**
 * Split a public-site path into a locale + page slug. A leading segment that is
 * a known NON-primary published locale selects that locale; otherwise the path
 * is treated as primary-language. Returns null when the path is malformed (too
 * many segments) so the route can 404.
 */
export function parseLocalePath(
  path: string[] | undefined,
  languages: SiteLocale[],
  primary: SiteLocale,
): { locale: SiteLocale; pageSlug: string } | null {
  const segs = path ?? [];
  const secondary = languages.filter((l) => l !== primary);
  if (segs.length > 0 && secondary.includes(segs[0] as SiteLocale)) {
    if (segs.length > 2) return null;
    return { locale: segs[0] as SiteLocale, pageSlug: segs[1] ?? "" };
  }
  if (segs.length > 1) return null;
  return { locale: primary, pageSlug: segs[0] ?? "" };
}

/** A parsed public-site request: a normal page, the news index, or one post.
 *  Built on top of the same locale-peeling rule as parseLocalePath, then the
 *  reserved `news` segment selects the news index / an article. */
export type PublicRoute =
  | { locale: SiteLocale; kind: "page"; pageSlug: string }
  | { locale: SiteLocale; kind: "news-index" }
  | { locale: SiteLocale; kind: "post"; postSlug: string }
  | { locale: SiteLocale; kind: "careers-index" }
  | { locale: SiteLocale; kind: "job"; jobSlug: string };

/**
 * Resolve a public-site path into a locale + a route kind. A leading segment
 * that is a known non-primary locale selects that locale; the reserved `news`
 * segment then maps to the news index (`/news`) or a single article
 * (`/news/<slug>`); anything else is a normal page (`/<slug>`, "" = home).
 * Returns null for malformed/too-deep paths so the route can 404.
 */
export function parsePublicRoute(
  path: string[] | undefined,
  languages: SiteLocale[],
  primary: SiteLocale,
): PublicRoute | null {
  const segs = path ?? [];
  const secondary = languages.filter((l) => l !== primary);
  let locale = primary;
  let rest = segs;
  if (segs.length > 0 && secondary.includes(segs[0] as SiteLocale)) {
    locale = segs[0] as SiteLocale;
    rest = segs.slice(1);
  }
  if (rest.length === 0) return { locale, kind: "page", pageSlug: "" };
  if (rest[0] === NEWS_SEGMENT) {
    if (rest.length === 1) return { locale, kind: "news-index" };
    if (rest.length === 2) return { locale, kind: "post", postSlug: rest[1] };
    return null; // /news/a/b → not a real route
  }
  if (rest[0] === CAREERS_SEGMENT) {
    if (rest.length === 1) return { locale, kind: "careers-index" };
    if (rest.length === 2) return { locale, kind: "job", jobSlug: rest[1] };
    return null;
  }
  if (rest.length === 1) return { locale, kind: "page", pageSlug: rest[0] };
  return null; // deeper non-news paths aren't real routes
}

/** The published languages of a snapshot, primary first (always ≥1). */
export function snapshotLanguages(snapshot: {
  language: SiteLocale;
  languages?: SiteLocale[];
}): SiteLocale[] {
  const langs = snapshot.languages?.length ? snapshot.languages : [snapshot.language];
  // Guarantee the primary is first and the list is unique.
  return Array.from(new Set([snapshot.language, ...langs]));
}

/** Resolve the same page's slug in another locale without exposing draft ids. */
export function localizedPageSlug(
  snapshot: { localizedPageSlugs?: Record<string, Record<string, string>> },
  currentLocale: SiteLocale,
  targetLocale: SiteLocale,
  currentSlug: string,
): string {
  const currentMap = snapshot.localizedPageSlugs?.[currentLocale] ?? {};
  const primarySlug = Object.entries(currentMap).find(([, slug]) => slug === currentSlug)?.[0]
    ?? currentSlug;
  return snapshot.localizedPageSlugs?.[targetLocale]?.[primarySlug] ?? primarySlug;
}

/**
 * Move a snapshot between its primary and locale-specific route vocabulary.
 * Page identity stays stable while page rows, nav entries and typed page-link
 * targets all receive the same slug mapping.
 */
export function remapSnapshotPageSlugs(
  snapshot: SiteSnapshot,
  currentLocale: SiteLocale,
  targetLocale: SiteLocale,
): SiteSnapshot {
  if (currentLocale === targetLocale) return snapshot;
  const slugMap = new Map(
    snapshot.pages.map((page) => [
      page.slug,
      localizedPageSlug(snapshot, currentLocale, targetLocale, page.slug),
    ]),
  );
  const remapTargets = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(remapTargets);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        key === "pageSlug" && typeof child === "string"
          ? (slugMap.get(child) ?? child)
          : remapTargets(child),
      ]),
    );
  };
  return {
    ...snapshot,
    language: targetLocale,
    pages: snapshot.pages.map((page) => ({
      ...page,
      slug: slugMap.get(page.slug) ?? page.slug,
      sections: page.sections.map((section) => ({
        ...section,
        content: remapTargets(section.content) as typeof section.content,
      })),
    })),
    nav: snapshot.nav.map((item) => ({
      ...item,
      pageSlug: slugMap.get(item.pageSlug) ?? item.pageSlug,
    })),
    navCta:
      snapshot.navCta !== undefined && snapshot.navCta !== "off" &&
      snapshot.navCta.target.kind === "page"
        ? {
            ...snapshot.navCta,
            target: {
              kind: "page",
              pageSlug:
                slugMap.get(snapshot.navCta.target.pageSlug) ??
                snapshot.navCta.target.pageSlug,
            },
          }
        : snapshot.navCta,
    navMegaMenu: snapshot.navMegaMenu
      ? (remapTargets(snapshot.navMegaMenu) as typeof snapshot.navMegaMenu)
      : undefined,
  };
}
