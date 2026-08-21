import type { PortableSiteV1 } from "../../convex/model/portable";
import type { DraftSite, PublishedSite } from "./client";
import type {
  ResolvedAsset,
  SiteSnapshot,
  SnapshotCollection,
} from "../../convex/model/snapshot";

/** One row as a package carries it, before `collectionsFromPackage` joins it
 *  to the shape it belongs to. */
type PortableCollectionRow = NonNullable<PortableSiteV1["collectionRows"]>[number];

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

/** One list, ready to render: the shape, the template, and the rows.
 *
 *  Structurally the snapshot's own collection, re-exported under a render name
 *  so a component never imports a Convex model type to draw a card. */
export type RenderCollection = SnapshotCollection;

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
  /** Owner-defined lists and their rows.
   *
   *  Both builders always fill this in. It is OPTIONAL on the type for the
   *  repositories that build a `RenderSite` by hand, which were written before
   *  lists existed and must keep compiling; every reader here treats an absent
   *  one as an empty one. */
  collections?: RenderCollection[];
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

/** Normalize a delivered snapshot into the render model.
 *
 *  Takes a DRAFT answer as readily as a published one, which is the whole
 *  point of headless staging: the same components render both, so a preview
 *  deployment cannot drift from production. A draft simply arrives with no
 *  `versionId` and no `publishedAt`, and those pass straight through as
 *  undefined - the render model already declared them optional. */
export function renderModelFromPublished(
  published: PublishedSite | DraftSite,
): RenderSite {
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
    collections: snapshot.collections ?? [],
    versionId: "versionId" in published ? published.versionId : undefined,
    publishedAt: "publishedAt" in published ? published.publishedAt : undefined,
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
    collections: collectionsFromPackage(site),
  };
}

/** Put a package's two collection halves back together into the one shape the
 *  renderer reads.
 *
 *  A package keeps the SHAPE (`contentCollections`) apart from the ROWS
 *  (`collectionRows`) because a row is the thing there are hundreds of. A
 *  snapshot has already joined them, so this is the package doing the same
 *  join, and it is why one component draws a pulled repo and a published site.
 *
 *  Two differences from a snapshot, both deliberate:
 *   - **`blog` and `news` lists are skipped.** Their rows are post PAGES, which
 *     already come through `pages`, so including them here would draw every
 *     post twice.
 *   - **A hidden row is dropped**, the same call the section loop above makes:
 *     a publish drops them, so a local preview that showed them would flatter
 *     the draft. */
function collectionsFromPackage(site: PortableSiteV1): RenderCollection[] {
  const declared = (site.contentCollections ?? []).filter(
    (collection) => collection.kind === "custom",
  );
  if (declared.length === 0) return [];

  const rowsByCollection = new Map<string, PortableCollectionRow[]>();
  for (const row of site.collectionRows ?? []) {
    if (row.hidden) continue;
    const bucket = rowsByCollection.get(row.collectionTmpId);
    if (bucket) bucket.push(row);
    else rowsByCollection.set(row.collectionTmpId, [row]);
  }

  // A package's `reference` field names its target by the target's tmpId, and
  // the render side addresses a list by its slug prefix. Translated once here,
  // so `referencedRow` asks the same question of both sources.
  const prefixByTmpId = new Map(
    declared.map((collection) => [collection.tmpId, collection.slugPrefix]),
  );

  return declared
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((collection) => ({
      name: collection.name,
      slugPrefix: collection.slugPrefix,
      fields: (Array.isArray(collection.fields) ? collection.fields : []).map(
        (field: Record<string, unknown>) => {
          const target = field.referenceCollectionId;
          const prefix =
            typeof target === "string" ? prefixByTmpId.get(target) : undefined;
          return {
            key: String(field.key ?? ""),
            label: String(field.label ?? field.key ?? ""),
            type: String(field.type ?? "text"),
            ...(Array.isArray(field.options)
              ? { options: field.options.map((option) => String(option)) }
              : {}),
            ...(prefix ? { referenceCollection: prefix } : {}),
          };
        },
      ),
      ...(collection.template ? { template: collection.template } : {}),
      rows: byOrderKey(rowsByCollection.get(collection.tmpId) ?? []).map((row) => ({
        slug: row.slug,
        title: row.title,
        values: (row.values ?? {}) as RenderCollection["rows"][number]["values"],
      })),
    }));
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
