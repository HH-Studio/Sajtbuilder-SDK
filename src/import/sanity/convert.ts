// ---------------------------------------------------------------------------
// Documents plus a confirmed mapping -> `PortableSiteV1`.
//
// This is the deterministic half. No model runs here, no schema file is
// executed, no GROQ is evaluated, nothing is fetched. It reads the documents
// the export carried, applies the mapping the agency committed, and returns a
// portable site plus an honest list of what did not survive.
//
// The one rule that decides every hard case: **a thing we cannot express
// becomes a reported loss, never a guess.** A Portable Text block with no home
// is named. A reference into a type nobody mapped is named. A field whose value
// does not fit its chosen type is named. Silence is the failure.
// ---------------------------------------------------------------------------

import { generateKeyBetween } from "fractional-indexing";
import type { PortableSiteV1 } from "../../convex/model/portable";
import { DEFAULT_THEME } from "../../convex/model/theme";
import { PORTABLE_CAPS } from "../../lib/portability/caps";
import { imageDimensions, imageExtension } from "../html/imageBytes";
import { detectI18n, pickLocale } from "./i18n";
import type { MappingField, MappingType, SanityMapping } from "./mapping";
import {
  SANITY_EXPORT_LIMITS,
  type SanityDocument,
  type SanityExport,
} from "./model";
import { isPortableText, portableTextToPlain } from "./portableText";

export type SanityLoss = {
  /** The document this happened in, by `_id`, so an agency can open it. */
  documentId: string;
  /** The Sanity field, when the loss was about one. */
  field?: string;
  reason: string;
  excerpt?: string;
};

export type SanityConvertResult = {
  site: PortableSiteV1;
  /** The asset blobs the bundle references, ready to be written beside it. */
  assetFiles: { fileName: string; bytes: Uint8Array }[];
  losses: SanityLoss[];
  /** Every locale seen, and which one was kept. */
  i18n: { convention: string; locales: string[]; kept?: string };
  counts: {
    collections: number;
    rows: number;
    pages: number;
    assets: number;
    documentsRead: number;
    documentsSkipped: number;
  };
};

export class SanityConvertError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SanityConvertError";
  }
}

const MIME_BY_EXT: Readonly<Record<string, string>> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  svg: "image/svg+xml",
};

function slugify(value: string, fallback: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || fallback;
}

/** The `_ref` an image or file value points at, whatever shape it came in. */
function assetRefOf(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as { asset?: { _ref?: unknown }; _ref?: unknown };
  const ref = rec.asset?._ref ?? rec._ref;
  return typeof ref === "string" ? ref : null;
}

/** The document `_id` a reference value points at. */
function documentRefOf(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as { _ref?: unknown; _type?: unknown };
  return rec._type === "reference" && typeof rec._ref === "string" ? rec._ref : null;
}

/** Sanity's `hotspot` is `{x, y}` in 0..1, which is exactly the focal point
 *  the portable page image already carries. The `crop` is NOT expressible, so
 *  it is reported rather than approximated. */
function hotspotOf(value: unknown): { x: number; y: number } | null {
  if (!value || typeof value !== "object") return null;
  const spot = (value as { hotspot?: { x?: unknown; y?: unknown } }).hotspot;
  if (!spot || typeof spot.x !== "number" || typeof spot.y !== "number") return null;
  return { x: spot.x, y: spot.y };
}

export type ConvertOptions = {
  /** Business identity for the portable site's `site` block. The importer does
   *  not invent one: a Sanity dataset holds a client's content, not their
   *  company registration. */
  businessName: string;
  language?: "sv" | "en";
  /** When the dataset is localised, which language to keep. Defaults to the
   *  mapping's own `locale`, then to the site language. */
  locale?: string;
  /** Bundle-relative prefix for asset urls. */
  assetPrefix?: string;
};

export function convertSanityExport(
  exported: SanityExport,
  mapping: SanityMapping,
  options: ConvertOptions,
): SanityConvertResult {
  const losses: SanityLoss[] = [];
  const language = options.language ?? "sv";
  const detection = detectI18n(exported.documents.values());
  if (detection.convention === "ambiguous") {
    throw new SanityConvertError(
      [
        "This dataset uses more than one way of storing translations, and picking the wrong one would drop half the content without saying so.",
        `What was found: ${detection.evidence.join("; ")}.`,
        "Export one language at a time, or tell us which convention to read, and run this again.",
      ].join(" "),
    );
  }
  const keptLocale =
    options.locale ??
    mapping.locale ??
    (detection.locales.includes(language) ? language : detection.locales[0]);

  const typeByName = new Map<string, MappingType>(
    mapping.types.map((type) => [type.from, type]),
  );

  // --- assets -------------------------------------------------------------
  // Only the blobs something actually references are carried. An export
  // routinely holds every image the client ever uploaded, and shipping the
  // unreferenced ones is how a 300-image bundle appears out of a 40-image site.
  const wantedAssets = new Set<string>();
  const collectWanted = (value: unknown, depth = 0): void => {
    if (depth > 8 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const entry of value) collectWanted(entry, depth + 1);
      return;
    }
    const ref = assetRefOf(value);
    if (ref) wantedAssets.add(ref);
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectWanted(entry, depth + 1);
    }
  };

  // --- which documents are in scope --------------------------------------
  const inScope: SanityDocument[] = [];
  let documentsSkipped = 0;
  for (const doc of exported.documents.values()) {
    const type = typeByName.get(doc._type);
    if (!type || type.becomes === "skip") {
      documentsSkipped += 1;
      continue;
    }
    inScope.push(doc);
  }
  // A draft with no published twin is real unpublished content. Carried, and
  // marked so publishing leaves it out - the same promise the app's
  // `excludeFromPublish` already makes.
  const draftOnly: SanityDocument[] = [];
  for (const [id, draft] of exported.drafts) {
    if (exported.documents.has(id)) continue;
    const type = typeByName.get(draft._type);
    if (!type || type.becomes === "skip") continue;
    draftOnly.push(draft);
    losses.push({
      documentId: draft._id,
      reason:
        "this was still a draft in Sanity, so it came across hidden. Publish it in SnabbSajt when it is ready.",
    });
  }
  for (const doc of [...inScope, ...draftOnly]) collectWanted(doc);

  const assets: PortableSiteV1["assets"] = [];
  const assetFiles: { fileName: string; bytes: Uint8Array }[] = [];
  const exportIdByRef = new Map<string, string>();
  const prefix = options.assetPrefix ?? "assets/";
  // The two asset caps behave differently, and only one of them is handled
  // here. The COUNT cap is a hard rejection of the whole bundle, so it is
  // answered by splitting into runs (`./batch.ts`). The BYTE budget degrades:
  // past it the import marks the rest `over_budget` and still lands. Degrading
  // is fine; degrading SILENTLY is not, so the pictures that will not fit are
  // left out here and named, one by one, rather than discovered as blank cards
  // on a client's hemsida.
  let assetBytes = 0;
  for (const ref of [...wantedAssets].sort()) {
    const file = exported.assets.get(ref);
    if (!file) {
      losses.push({
        documentId: ref,
        reason:
          "a picture the content points at is not in the export archive, so nothing was imported for it.",
      });
      continue;
    }
    const ext = (file.path.split(".").pop() ?? "bin").toLowerCase();
    const mimeType = MIME_BY_EXT[ext] ?? "application/octet-stream";
    if (!mimeType.startsWith("image/")) {
      // Documents, videos and everything else. A collection field holds a
      // picture or a link, never an arbitrary file, so this is named rather
      // than smuggled in as an image.
      losses.push({
        documentId: ref,
        reason: `this is a ${ext.toUpperCase()} file, and a list field holds a picture or a web address. Upload it in SnabbSajt and link to it.`,
      });
      continue;
    }
    if (file.bytes.byteLength > PORTABLE_CAPS.maxSingleAssetBytes) {
      losses.push({
        documentId: ref,
        reason: `this picture is ${Math.round(file.bytes.byteLength / (1024 * 1024))} MB, and one import takes ${Math.round(PORTABLE_CAPS.maxSingleAssetBytes / (1024 * 1024))} MB per file. Shrink it and add it in SnabbSajt.`,
      });
      continue;
    }
    if (assetBytes + file.bytes.byteLength > PORTABLE_CAPS.maxTotalAssetBytes) {
      losses.push({
        documentId: ref,
        reason: `this picture is past the ${Math.round(PORTABLE_CAPS.maxTotalAssetBytes / (1024 * 1024))} MB one import carries in total, so it was left out. Add it in SnabbSajt, or export fewer documents at a time.`,
      });
      continue;
    }
    assetBytes += file.bytes.byteLength;
    const exportId = `sanity-${assets.length + 1}`;
    const fileName = `${exportId}${imageExtension(file.path, mimeType)}`;
    const size = imageDimensions(file.bytes, mimeType);
    assets.push({
      exportId,
      url: `${prefix}${fileName}`,
      width: size?.width ?? 0,
      height: size?.height ?? 0,
      mimeType,
      kind: "image",
    });
    assetFiles.push({ fileName, bytes: file.bytes });
    exportIdByRef.set(ref, exportId);
  }

  // --- collections and pages ---------------------------------------------
  const contentCollections: NonNullable<PortableSiteV1["contentCollections"]> = [];
  const collectionRows: NonNullable<PortableSiteV1["collectionRows"]> = [];
  const pages: PortableSiteV1["pages"] = [];
  /** Sanity `_id` -> the row slug it landed under, so a reference can name it.
   *  Filled before any reference is resolved, which is what lets a cycle be
   *  recorded rather than followed. */
  const rowSlugById = new Map<string, string>();
  const collectionKeyById = new Map<string, string>();

  const collectionTypes = mapping.types.filter(
    (type) => type.becomes === "collection" && type.key,
  );
  collectionTypes.forEach((type, index) => {
    contentCollections.push({
      tmpId: type.key!,
      kind: "custom",
      name: type.name ?? type.from,
      slugPrefix: type.slugPrefix ?? type.key!,
      order: (index + 1) * 10,
      externalKey: `sanity:${type.from}`,
      fields: type.fields
        .filter((field) => field.type !== "skip")
        .map((field, at) => ({
          key: field.to,
          label: field.label ?? field.to,
          type: field.type,
          order: at,
          ...(field.options ? { options: field.options } : {}),
          // A reference names the TARGET COLLECTION's tmpId here, which the
          // import remaps to a real id. That is the portable format's own
          // convention; a Convex id could not survive a file.
          ...(field.referenceCollectionKey
            ? { referenceCollectionId: field.referenceCollectionKey }
            : {}),
        })),
    });
  });

  // Pass one: every row's slug, so a reference can be written in pass two
  // without following the graph. A visited set is unnecessary once the slugs
  // are known up front, which is the cheapest possible answer to "reference
  // cycles hang the converter".
  const takenSlugs = new Map<string, Set<string>>();
  const rowsToWrite: { doc: SanityDocument; type: MappingType; slug: string; hidden: boolean }[] = [];
  const pagesToWrite: { doc: SanityDocument; type: MappingType; slug: string; hidden: boolean }[] = [];
  const takenPageSlugs = new Set<string>();
  const assign = (doc: SanityDocument, type: MappingType, hidden: boolean): void => {
    const rawSlug =
      (type.slugField ? readSlug(doc[type.slugField]) : undefined) ??
      (type.titleField ? asText(doc[type.titleField], keptLocale) : undefined) ??
      doc._id;
    if (type.becomes === "page") {
      let slug = slugify(rawSlug, "sida");
      let n = 2;
      while (takenPageSlugs.has(slug)) {
        slug = `${slugify(rawSlug, "sida")}-${n}`;
        n += 1;
      }
      takenPageSlugs.add(slug);
      pagesToWrite.push({ doc, type, slug, hidden });
      return;
    }
    const key = type.key!;
    const taken = takenSlugs.get(key) ?? new Set<string>();
    let slug = slugify(rawSlug, "rad");
    let n = 2;
    while (taken.has(slug)) {
      slug = `${slugify(rawSlug, "rad")}-${n}`;
      n += 1;
    }
    taken.add(slug);
    takenSlugs.set(key, taken);
    rowSlugById.set(doc._id, slug);
    collectionKeyById.set(doc._id, key);
    rowsToWrite.push({ doc, type, slug, hidden });
  };
  for (const doc of inScope) {
    assign(doc, typeByName.get(doc._type)!, false);
  }
  for (const doc of draftOnly) {
    // A draft's `_id` still carries the prefix; strip it so a later publish of
    // the same document in Sanity re-imports onto the same row.
    assign(
      { ...doc, _id: doc._id.replace(/^drafts\./, "") },
      typeByName.get(doc._type)!,
      true,
    );
  }

  // Pass two: the values.
  let order: string | null = null;
  for (const { doc, type, slug, hidden } of rowsToWrite) {
    const values: Record<string, unknown> = {};
    for (const field of type.fields) {
      if (field.type === "skip") continue;
      const raw = doc[field.from];
      if (raw === undefined || raw === null) continue;
      const converted = convertValue(raw, field, {
        doc,
        keptLocale,
        exportIdByRef,
        rowSlugById,
        collectionKeyById,
        losses,
      });
      if (converted !== undefined) values[field.to] = converted;
    }
    order = generateKeyBetween(order, null);
    collectionRows.push({
      collectionTmpId: type.key!,
      // The Sanity id, which is what makes a second run update this row rather
      // than write a second copy of the same property. It is the single field
      // that turns this from a one-shot conversion into a migration an agency
      // can iterate on.
      externalKey: `sanity:${doc._id}`,
      slug,
      title:
        (type.titleField ? asText(doc[type.titleField], keptLocale) : undefined) ||
        slug,
      values,
      order,
      ...(hidden ? { hidden: true } : {}),
    });
  }

  pagesToWrite.forEach((entry, index) => {
    const { doc, type, slug, hidden } = entry;
    const body = type.fields.find(
      (field) => field.type === "longText" && isPortableText(doc[field.from]),
    );
    if (body) {
      const converted = portableTextToPlain(doc[body.from]);
      for (const loss of converted.losses) {
        losses.push({
          documentId: doc._id,
          field: body.from,
          reason: loss.reason,
          ...(loss.excerpt ? { excerpt: loss.excerpt } : {}),
        });
      }
    }
    // A page carries no sections here on purpose. A Sanity document is data,
    // and inventing a hero and three bands out of it would be exactly the
    // "converter that silently invents markup" this lane refuses to be. The
    // page arrives with its title and its address, and the agency lays it out
    // in the editor with the content in front of them.
    losses.push({
      documentId: doc._id,
      reason:
        "this document came across as an empty page with its title and address. Its text is in the list above; lay the page out in the editor.",
    });
    pages.push({
      tmpId: `sanity-page-${index + 1}`,
      externalKey: `sanity:${doc._id}`,
      slug,
      title:
        (type.titleField ? asText(doc[type.titleField], keptLocale) : undefined) ||
        slug,
      order: (index + 1) * 10,
      showInNav: false,
      ...(hidden ? { excludeFromPublish: true } : {}),
    });
  });

  // A bundle with no pages at all is not a site the importer may hand over: a
  // hemsida has to have a home. One is added, empty, and said so.
  if (pages.length === 0) {
    pages.push({
      tmpId: "sanity-home",
      slug: "",
      title: options.businessName,
      order: 0,
      showInNav: true,
    });
  }

  const site: PortableSiteV1 = {
    format: "sajt-site",
    version: 1,
    exportedAt: new Date().toISOString(),
    site: {
      businessName: options.businessName,
      vertical: "consultant",
      goal: "show_services",
      language,
      // Our default tokens, not a guess at the client's brand. A dataset holds
      // content and says nothing about colour, and inventing a palette from
      // nothing is how an import looks like it worked and reads like it did
      // not. The agency sets the brand in the editor, or a repo declares it.
      theme: { ...DEFAULT_THEME },
    },
    folders: [],
    pages,
    sections: [],
    fonts: [],
    assets,
    ...(contentCollections.length > 0 ? { contentCollections } : {}),
    ...(collectionRows.length > 0 ? { collectionRows } : {}),
  };

  return {
    site,
    assetFiles,
    losses,
    i18n: {
      convention: detection.convention,
      locales: detection.locales,
      ...(keptLocale ? { kept: keptLocale } : {}),
    },
    counts: {
      collections: contentCollections.length,
      rows: collectionRows.length,
      pages: pages.length,
      assets: assets.length,
      documentsRead: inScope.length + draftOnly.length,
      documentsSkipped,
    },
  };
}

function readSlug(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const current = (value as { current?: unknown }).current;
    if (typeof current === "string") return current;
  }
  return undefined;
}

/** A value read as plain text, one locale at a time. */
function asText(value: unknown, locale?: string): string | undefined {
  const picked = locale ? pickLocale(value, locale) : undefined;
  const target = picked ? picked.value : value;
  if (typeof target === "string") return target.trim() || undefined;
  if (typeof target === "number") return String(target);
  if (isPortableText(target)) return portableTextToPlain(target, 200).text || undefined;
  return undefined;
}

type ConvertContext = {
  doc: SanityDocument;
  keptLocale?: string;
  exportIdByRef: Map<string, string>;
  rowSlugById: Map<string, string>;
  collectionKeyById: Map<string, string>;
  losses: SanityLoss[];
};

/** One field's value, converted into what its chosen SnabbSajt type holds.
 *  `undefined` means "nothing to store", and every reason it can happen is
 *  either harmless (an empty field) or already recorded as a loss. */
function convertValue(
  raw: unknown,
  field: MappingField,
  ctx: ConvertContext,
): unknown {
  const localised = ctx.keptLocale ? pickLocale(raw, ctx.keptLocale) : undefined;
  if (localised && localised.droppedLocales.length > 0) {
    ctx.losses.push({
      documentId: ctx.doc._id,
      field: field.from,
      reason: `kept the ${ctx.keptLocale} version; ${localised.droppedLocales.join(", ")} did not come across. A hemsida holds one language per site.`,
    });
  }
  const value = localised ? localised.value : raw;
  if (value === undefined || value === null) return undefined;

  switch (field.type) {
    case "text": {
      const text = asText(value);
      return text?.slice(0, 500);
    }
    case "longText": {
      if (isPortableText(value)) {
        const converted = portableTextToPlain(value);
        for (const loss of converted.losses) {
          ctx.losses.push({
            documentId: ctx.doc._id,
            field: field.from,
            reason: loss.reason,
            ...(loss.excerpt ? { excerpt: loss.excerpt } : {}),
          });
        }
        return converted.text || undefined;
      }
      return asText(value);
    }
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? value : undefined;
    case "boolean":
      return typeof value === "boolean" ? value : undefined;
    case "date": {
      const text = typeof value === "string" ? value : readSlug(value);
      return text && /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : undefined;
    }
    case "choice": {
      const text = asText(value);
      if (!text) return undefined;
      if (field.options && field.options.length > 0 && !field.options.includes(text)) {
        ctx.losses.push({
          documentId: ctx.doc._id,
          field: field.from,
          reason: `the value "${text}" is not one of the choices this field allows, so it was left empty.`,
        });
        return undefined;
      }
      return text;
    }
    case "link": {
      const href = typeof value === "string" ? value : readSlug(value);
      return href && /^(https?:|mailto:|tel:|\/)/.test(href) ? { href } : undefined;
    }
    case "image": {
      const ref = assetRefOf(value);
      if (!ref) return undefined;
      const exportId = ctx.exportIdByRef.get(ref);
      if (!exportId) return undefined;
      const spot = hotspotOf(value);
      const crop = (value as { crop?: unknown }).crop;
      if (crop) {
        ctx.losses.push({
          documentId: ctx.doc._id,
          field: field.from,
          reason:
            "the picture was cropped in Sanity. The full picture came across and the crop did not, so check how it sits.",
        });
      }
      if (spot) {
        // A row's image value holds an id and an alt text and nothing else, so
        // the hotspot has nowhere to live. Said out loud rather than dropped,
        // because a portrait cropping through a face is exactly what a hotspot
        // was set to prevent.
        ctx.losses.push({
          documentId: ctx.doc._id,
          field: field.from,
          reason:
            "the picture had a focal point set in Sanity. Set it again in SnabbSajt if the crop looks wrong.",
        });
      }
      const alt = (value as { alt?: unknown }).alt;
      return {
        assetId: exportId,
        ...(typeof alt === "string" && alt.trim() ? { alt: alt.trim().slice(0, 200) } : {}),
      };
    }
    case "reference": {
      const ref = documentRefOf(value);
      if (!ref) return undefined;
      const slug = ctx.rowSlugById.get(ref);
      if (!slug) {
        ctx.losses.push({
          documentId: ctx.doc._id,
          field: field.from,
          reason:
            "this points at a document that is not part of this import, so the link was left empty.",
        });
        return undefined;
      }
      // The portable format names a reference target by the target row's SLUG,
      // and the import resolves it. A cycle costs nothing here: the slug was
      // decided before any value was read, so nothing recurses.
      return { rowSlug: slug };
    }
    default:
      return undefined;
  }
}

export { SANITY_EXPORT_LIMITS };
