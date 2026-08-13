import type { PortableSiteV1 } from "../../convex/model/portable";
import type { PublishedSite } from "./client";
import type { ResolvedAsset, SiteSnapshot } from "../../convex/model/snapshot";

// ---------------------------------------------------------------------------
// One renderable shape for both directions of the round-trip.
//
// A headless app has two sources for the same site and must render them with
// the same components, or the thing the developer previews locally is not the
// thing their client publishes:
//
//   src/site.ts (PortableSiteV1) ──► renderModelFromPackage ──┐
//                                                             ├─► RenderSite
//   GET /v1/sites/{id}/published (PublishedSite) ──────────────┘
//
// The two payloads already agree on the part that matters: section `content`
// is the same discriminated union in both (the published snapshot carries
// Convex ids, the portable package carries export-local strings, and neither
// difference reaches a renderer). What actually differs is the envelope —
// where pages keep their sections, how order is expressed, and whether image
// refs have been resolved to URLs yet. This module normalizes exactly that.
// ---------------------------------------------------------------------------

/** A section ready to render. Structurally compatible with the section shape
 *  a `defineSite` author writes, so one component switch serves both sources. */
export type RenderSection = {
  type: string;
  variant: string;
  anchorId?: string;
  tone?: unknown;
  layout?: unknown;
  content: { type: string } & Record<string, unknown>;
};

export type RenderPage = {
  /** "" for the home page. */
  slug: string;
  title: string;
  order: number;
  showInNav: boolean;
  sections: RenderSection[];
};

export type RenderSite = {
  /** Which payload this model came from. Useful in a build log: a deploy that
   *  silently fell back to the checked-in content is the failure mode worth
   *  seeing. */
  source: "package" | "published";
  businessName: string;
  language: string;
  /** Theme tokens (palette, fontPair, radius, buttonStyle, appearance). */
  theme: Record<string, unknown>;
  pages: RenderPage[];
  /** assetId -> resolved url/dimensions. Empty for a local package, whose
   *  image refs still point at bundle files rather than published URLs. */
  assets: Record<string, ResolvedAsset>;
  /** Present only for a published model: the id of the publish it came from.
   *  Stable per publish, so it is the right build-cache key and the right
   *  thing to print when a deploy renders content nobody recognises. */
  versionId?: string;
  publishedAt?: number;
};

/** Page kinds that own a top-level route. Posts live under /news and jobs
 *  under /careers in the hosted renderer; a headless app that mapped them onto
 *  `/[[...slug]]` would publish two URLs for one page. */
function isRoutablePage(pageType: string | undefined): boolean {
  return pageType === undefined || pageType === "page";
}

/** Fractional-index keys sort as plain strings — that is the whole point of
 *  the encoding. Sections without a key keep their array position. */
function byOrderKey<T extends { order?: string }>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ak = a.item.order;
      const bk = b.item.order;
      if (ak === undefined && bk === undefined) return a.index - b.index;
      if (ak === undefined) return 1;
      if (bk === undefined) return -1;
      if (ak === bk) return a.index - b.index;
      return ak < bk ? -1 : 1;
    })
    .map((entry) => entry.item);
}

/** Normalize a published snapshot into the render model. */
export function renderModelFromPublished(published: PublishedSite): RenderSite {
  const snapshot = published.snapshot as SiteSnapshot;
  const pages: RenderPage[] = snapshot.pages
    .filter((page) => isRoutablePage(page.pageType))
    .map((page) => ({
      slug: page.slug,
      title: page.title,
      order: page.order,
      showInNav: page.showInNav,
      // Snapshot sections are already ordered and already publish-filtered:
      // hidden sections never reach a snapshot.
      sections: page.sections.map((section) => ({
        type: section.type,
        variant: section.variant,
        ...(section.anchorId ? { anchorId: section.anchorId } : {}),
        ...(section.tone ? { tone: section.tone } : {}),
        ...(section.layout ? { layout: section.layout } : {}),
        content: section.content as RenderSection["content"],
      })),
    }))
    .sort((a, b) => a.order - b.order);

  return {
    source: "published",
    businessName: snapshot.businessName,
    language: snapshot.language,
    theme: snapshot.theme as unknown as Record<string, unknown>,
    pages,
    assets: snapshot.resolvedAssets ?? {},
    versionId: published.versionId,
    publishedAt: published.publishedAt,
  };
}

/** Normalize a locally authored site package into the same render model. */
export function renderModelFromPackage(site: PortableSiteV1): RenderSite {
  const sectionsByPage = new Map<string, PortableSiteV1["sections"]>();
  for (const section of site.sections) {
    // `hidden` is the author's own "not yet" flag; a publish drops these, so a
    // local preview that showed them would flatter the draft.
    if (section.hidden) continue;
    const bucket = sectionsByPage.get(section.pageTmpId);
    if (bucket) bucket.push(section);
    else sectionsByPage.set(section.pageTmpId, [section]);
  }

  const pages: RenderPage[] = site.pages
    .filter((page) => isRoutablePage(page.pageType))
    .map((page) => ({
      slug: page.slug,
      title: page.title,
      order: page.order,
      showInNav: page.showInNav,
      sections: byOrderKey(sectionsByPage.get(page.tmpId) ?? []).map((section) => ({
        type: section.type,
        variant: section.variant,
        ...(section.anchorId ? { anchorId: section.anchorId } : {}),
        ...(section.tone ? { tone: section.tone } : {}),
        ...(section.layout ? { layout: section.layout } : {}),
        content: section.content as RenderSection["content"],
      })),
    }))
    .sort((a, b) => a.order - b.order);

  return {
    source: "package",
    businessName: site.site.businessName,
    language: site.site.language,
    theme: site.site.theme as unknown as Record<string, unknown>,
    pages,
    // A package's image refs point at bundle files that were never uploaded
    // anywhere. Nothing to resolve until the site has been imported+published.
    assets: {},
  };
}

/** Resolve an image reference against a model's published assets.
 *
 *  Returns `undefined` for a local package (nothing is resolved yet) and for a
 *  published snapshot whose asset was removed — callers render their own
 *  placeholder rather than a broken `<img>`. */
export function resolveAsset(
  model: RenderSite,
  ref: { assetId?: string } | null | undefined,
): ResolvedAsset | undefined {
  if (!ref?.assetId) return undefined;
  return model.assets[ref.assetId];
}

/** The page a path maps to. `""` is the home page. */
export function findPage(model: RenderSite, slug: string): RenderPage | undefined {
  return model.pages.find((page) => page.slug === slug);
}
