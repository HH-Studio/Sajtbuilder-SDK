import type { BlockLibrary } from "./defineBlock";
import type { ResolvedBlock } from "./pages";
import type { RenderCollection, RenderSite } from "../delivery/renderModel";

// ---------------------------------------------------------------------------
// Drawing a list, and the page one row gets to itself.
//
// Plan: the app's P1-2026-08-19-content-collections.md, and slice 3.4 of
// P0-2026-08-19-agency-program-master.md. The app half shipped first and the
// master plan recorded the honest gap it left: "nothing DRAWS a collection".
// This is that half.
//
// The shape of the answer follows from one decision the app already made: a
// row is drawn by a BLOCK the agency registered, and the collection's template
// says which block and which field goes in which slot. So there is no list
// component here, and there is no card component here. What there is:
//
//   rowsFor()            the rows, in order, for the agency's own list markup
//   resolveRowBlock()    one row as a ResolvedBlock, drawn by the same switch
//                        the page renderer already has for sections
//   rowForSegments()     the /<slugPrefix>/<slug> address, for the catch-all
//   collectionRowParams() every row address, for generateStaticParams
//
// Three rules, each one a thing an agency would otherwise meet in front of a
// client:
//
//  1. **A row with no template renders NOTHING, and says so.** The same
//     promise `pages.ts` makes about an unknown block: a live page must never
//     grow a grey box because a deploy went out before the component did.
//  2. **A binding is one way.** `bindings` reads block-slot -> field-key, so
//     one card block can draw two different collections.
//  3. **Values are passed through as data.** An image stays `{assetId, alt}`
//     and a reference stays `{rowSlug}`; `resolveAsset` and `referencedRow`
//     turn them into a URL and a row when the component asks. Resolving them
//     eagerly would make every list load every other list.
// ---------------------------------------------------------------------------

/** One row of a collection, as the snapshot froze it. */
export type CollectionRow = RenderCollection["rows"][number];
/** One field of a collection's shape. */
export type CollectionFieldShape = RenderCollection["fields"][number];
/** One stored value. The three object shapes are an image, a link, and a
 *  pointer at another row. */
export type CollectionRowValue = CollectionRow["values"][string];

/** Every list on the site, in the order they were published. */
export function collectionsFor(site: RenderSite): RenderCollection[] {
  return site.collections ?? [];
}

/** One list, by the prefix its rows are addressed under.
 *
 *  The prefix is the identity on this side rather than the repo's `key`,
 *  because a snapshot carries no key: a published list is the words, the rows
 *  and the address, and the address is the part a route has in hand. */
export function collectionForPrefix(
  site: RenderSite,
  slugPrefix: string,
): RenderCollection | undefined {
  const wanted = slugPrefix.replace(/^\/+|\/+$/g, "");
  return collectionsFor(site).find((collection) => collection.slugPrefix === wanted);
}

/** The rows of one list, ready to map over. Empty for a list nobody has filled
 *  in yet, and empty for a prefix that does not exist — a list that vanished
 *  from a deploy should leave a quiet page, not a crash. */
export function rowsFor(site: RenderSite, slugPrefix: string): CollectionRow[] {
  return collectionForPrefix(site, slugPrefix)?.rows ?? [];
}

/** The row at an address, for the catch-all route.
 *
 *  Takes the same `string[]` Next hands a catch-all, so a route file reads
 *  `rowForSegments(site, params.slug)` and nothing else. Exactly two segments
 *  are a row: `/objekt/villa-4` is one, `/objekt` is the list page the agency
 *  built themselves, and a third segment is not an address we make. */
export function rowForSegments(
  site: RenderSite,
  segments: string[] | undefined,
): { collection: RenderCollection; row: CollectionRow } | undefined {
  const parts = (segments ?? []).filter(Boolean);
  if (parts.length !== 2) return undefined;
  const collection = collectionForPrefix(site, parts[0] as string);
  if (!collection) return undefined;
  const row = collection.rows.find((candidate) => candidate.slug === parts[1]);
  return row ? { collection, row } : undefined;
}

/** Every row address on the site, for `generateStaticParams`.
 *
 *  Kept apart from `staticParamsFor`, which answers for PAGES: an app whose
 *  rows live under their own route file wants one list and not the other, and
 *  an app with a single catch-all concatenates them. Rows of a list with no
 *  `detailBlockType` are left out, because their address would render nothing
 *  and a build that pre-rendered it would publish a blank page. */
export function collectionRowParams(site: RenderSite): { slug: string[] }[] {
  const params: { slug: string[] }[] = [];
  for (const collection of collectionsFor(site)) {
    if (!collection.template?.detailBlockType) continue;
    for (const row of collection.rows) {
      params.push({ slug: [collection.slugPrefix, row.slug] });
    }
  }
  return params;
}

/** The props one row hands its block.
 *
 *  `bindings` decides the slot names; a field nobody bound is passed under its
 *  own key, so an agency that named the block's props after the fields can
 *  leave `bindings` out entirely and it still draws. `title` and `slug` always
 *  ride along, because a card that links to itself needs the address and
 *  almost every card shows the name. */
export function rowProps(
  collection: RenderCollection,
  row: CollectionRow,
): Record<string, unknown> {
  const bindings = collection.template?.bindings;
  const props: Record<string, unknown> = {
    title: row.title,
    slug: row.slug,
    href: `/${collection.slugPrefix}/${row.slug}`,
  };
  if (bindings && Object.keys(bindings).length > 0) {
    for (const [slot, fieldKey] of Object.entries(bindings)) {
      props[slot] = row.values[fieldKey];
    }
    return props;
  }
  for (const field of collection.fields) {
    props[field.key] = row.values[field.key];
  }
  return props;
}

/** Which of a collection's two blocks to draw a row with. */
export type CollectionSurface = "card" | "detail";

/**
 * One row, resolved against the repo's block library, in the same shape
 * `resolveBlockSection` returns for a section.
 *
 * That sameness is the point: a headless app already has one switch that turns
 * a `ResolvedBlock` into a component, and a row goes through it unchanged. An
 * app with no such switch has one function to write instead of two.
 *
 * `undefined` when the collection has no block for that surface, or when the
 * repo does not declare the block it names. Both mean the same thing to a
 * visitor and are handled the same way: draw nothing, and let the build log
 * complain.
 */
export function resolveCollectionRow(
  collection: RenderCollection,
  row: CollectionRow,
  library: BlockLibrary,
  surface: CollectionSurface = "card",
): ResolvedBlock | undefined {
  const blockType =
    surface === "detail"
      ? collection.template?.detailBlockType
      : collection.template?.cardBlockType;
  if (!blockType) return undefined;
  const definition = library[blockType];
  if (!definition) return undefined;
  return {
    blockType,
    version: definition.version ?? 1,
    props: rowProps(collection, row),
    // A row has no variant of its own: the template picked the block, and the
    // block's own default is what the agency wrote it against.
    variant: definition.variants?.[0] ?? "default",
    definition,
  };
}

/** Blocks a template names that the repo does not declare.
 *
 *  The honest failure list, the twin of `missingBlocks` for sections, and the
 *  same cause every time: a deploy that went out before the component did. */
export function missingCollectionBlocks(
  site: RenderSite,
  library: BlockLibrary,
): string[] {
  const missing = new Set<string>();
  for (const collection of collectionsFor(site)) {
    for (const blockType of [
      collection.template?.cardBlockType,
      collection.template?.detailBlockType,
    ]) {
      if (blockType && !library[blockType]) missing.add(blockType);
    }
  }
  return [...missing].sort();
}

/** True when a value is an image reference. */
export function isImageValue(
  value: CollectionRowValue | undefined,
): value is { assetId: string; alt?: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "assetId" in value &&
    typeof (value as { assetId: unknown }).assetId === "string"
  );
}

/** True when a value is a typed link: an href, and the words on it. */
export function isLinkValue(
  value: CollectionRowValue | undefined,
): value is { href: string; label?: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "href" in value &&
    typeof (value as { href: unknown }).href === "string"
  );
}

/** True when a value points at another row. */
export function isReferenceValue(
  value: CollectionRowValue | undefined,
): value is { rowSlug: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "rowSlug" in value &&
    typeof (value as { rowSlug: unknown }).rowSlug === "string"
  );
}

/**
 * The row a `reference` value points at.
 *
 * A slug is unique only inside its own list, so the target list has to be
 * named, and the snapshot names it on the FIELD (`referenceCollection`) rather
 * than on the value. Hence the field key: without it two lists could both hold
 * an `albin` and the answer would be whichever came first.
 *
 * `undefined` when the target list is not in this snapshot, or the row it
 * named is gone. A card then draws the rest of itself, which is the right
 * outcome: one missing link must not blank a page.
 */
export function referencedRow(
  site: RenderSite,
  collection: RenderCollection,
  fieldKey: string,
  value: CollectionRowValue | undefined,
): { collection: RenderCollection; row: CollectionRow } | undefined {
  if (!isReferenceValue(value)) return undefined;
  const field = collection.fields.find((candidate) => candidate.key === fieldKey);
  const targetPrefix = field?.referenceCollection;
  if (!targetPrefix) return undefined;
  const target = collectionForPrefix(site, targetPrefix);
  if (!target) return undefined;
  const row = target.rows.find((candidate) => candidate.slug === value.rowSlug);
  return row ? { collection: target, row } : undefined;
}

/** The address of the row a `reference` points at, or `undefined` when that
 *  row is not in this snapshot. What a card's "read more" href wants. */
export function referencedHref(
  site: RenderSite,
  collection: RenderCollection,
  fieldKey: string,
  value: CollectionRowValue | undefined,
): string | undefined {
  const target = referencedRow(site, collection, fieldKey, value);
  return target ? `/${target.collection.slugPrefix}/${target.row.slug}` : undefined;
}
