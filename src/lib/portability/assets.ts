// ---------------------------------------------------------------------------
// Asset-reference helpers for the portable site format (pure, no Convex/React).
// Section `content` references images by `{ assetId, alt, focalX?, focalY? }`
// (see convex/model/content.ts `assetRef`). On EXPORT we collect every assetId
// so their files can be carried; on IMPORT we remap those ids to the freshly
// re-uploaded assets. Mirrors the `collectAssetIds` walker in convex/publish.ts.
// ---------------------------------------------------------------------------

type Json = unknown;

/** Every distinct assetId referenced anywhere inside a section's content. */
export function collectAssetIds(content: Json): string[] {
  const out = new Set<string>();
  walk(content, out);
  return [...out];
}

function walk(node: Json, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const n of node) walk(n, out);
    return;
  }
  if (node && typeof node === "object") {
    const rec = node as Record<string, Json>;
    if (typeof rec.assetId === "string") out.add(rec.assetId);
    for (const val of Object.values(rec)) walk(val, out);
  }
}

/**
 * Every assetId referenced as *logo art* — an assetRef sitting at a `logo` key
 * (`logos.items[].logo`, `certifications.items[].logo`, and any future section
 * with the same field). Keyed on the field name rather than the section type so
 * a new logo-bearing section is covered without touching this walker.
 *
 * The import uses this to exempt logo art from the render-layout image guards
 * (aspect ratio and the minDim floor): a wordmark is legitimately a wide, short
 * strip and a partner badge is legitimately tiny, but neither is rendered as
 * section media. Derived from what the sections actually REFERENCE, never from
 * the caller-supplied `assets[].kind`, which is untrusted.
 */
export function collectLogoAssetIds(content: Json): string[] {
  const out = new Set<string>();
  walkLogos(content, out, false);
  return [...out];
}

function walkLogos(node: Json, out: Set<string>, underLogo: boolean): void {
  if (Array.isArray(node)) {
    for (const n of node) walkLogos(n, out, underLogo);
    return;
  }
  if (node && typeof node === "object") {
    const rec = node as Record<string, Json>;
    if (underLogo && typeof rec.assetId === "string") out.add(rec.assetId);
    for (const [key, val] of Object.entries(rec)) {
      walkLogos(val, out, underLogo || key === "logo");
    }
  }
}

/** Map from an exported assetId (the original `_id` string) to the new local id. */
export type AssetIdMap = Record<string, string>;

const DROP = Symbol("drop-asset-ref");

/**
 * Deep-clone `content`, swapping every assetRef.assetId via `map`. An assetRef
 * whose id is NOT in `map` (its image failed to re-upload) is dropped entirely:
 * removed from arrays, omitted from objects - so no dangling reference can
 * survive into the database. The result is re-validated by Convex on insert.
 */
export function remapAssetRefs<T>(content: T, map: AssetIdMap): T {
  const r = remap(content, map);
  return (r === DROP ? undefined : r) as T;
}

function remap(node: Json, map: AssetIdMap): Json | typeof DROP {
  if (Array.isArray(node)) {
    const out: Json[] = [];
    for (const el of node) {
      const r = remap(el, map);
      if (r !== DROP) out.push(r);
    }
    return out;
  }
  if (node && typeof node === "object") {
    const rec = node as Record<string, Json>;
    if (typeof rec.assetId === "string") {
      const mapped = map[rec.assetId];
      if (!mapped) return DROP; // unresolved image - drop the whole ref
      return { ...rec, assetId: mapped };
    }
    const out: Record<string, Json> = {};
    for (const [k, val] of Object.entries(rec)) {
      const r = remap(val, map);
      if (r !== DROP) out[k] = r;
    }
    return out;
  }
  return node; // primitive
}

/**
 * Post-remap repair for the two section types a dropped ref leaves *lying*.
 *
 * `before-after` pairs (`{ before, after, label? }`) need both images: a pair
 * that lost one is not schema-valid, so it is dropped.
 *
 * `documents` items are schema-valid without their file — the ref is optional
 * so a freshly added item validates before any upload — but an item that USED
 * to have a file and lost it during remap is a download link with nothing
 * behind it. The commit path is strict on purpose (`%PDF-` magic, size cap,
 * quota), so a lost PDF is a real outcome, and an item promising a price list
 * the visitor cannot open is worse than one we never claimed to have.
 *
 * `before` is the pre-remap content, and it is what tells those two cases
 * apart: an item that never had a `document` is the owner's own placeholder
 * and is left exactly where they put it. Without it, exporting a site with an
 * unfilled document row and importing it back would silently delete the row.
 * Omit `before` and the check is skipped rather than guessed at.
 */
export function sanitizeAfterRemap(type: string, content: Json, before?: Json): Json {
  if (type === "documents" && content && typeof content === "object" && before) {
    const rec = content as Record<string, Json>;
    const priorItems = (before as Record<string, Json>).items;
    if (!Array.isArray(rec.items) || !Array.isArray(priorItems)) return content;
    const hadDocument = (item: Json): boolean =>
      !!item && typeof item === "object" && !!(item as Record<string, Json>).document;
    // Remap drops a failed ref from its parent object but keeps the object, so
    // the two arrays stay index-aligned.
    const kept = rec.items.filter((item, i) => hadDocument(item) || !hadDocument(priorItems[i]));
    return { ...rec, items: kept };
  }
  if (type !== "before-after" || !content || typeof content !== "object") {
    return content;
  }
  const rec = content as Record<string, Json>;
  if (!Array.isArray(rec.pairs)) return content;
  const hasImg = (v: Json): boolean =>
    !!v && typeof v === "object" && typeof (v as Record<string, Json>).assetId === "string";
  const kept = rec.pairs.filter(
    (p) =>
      p &&
      typeof p === "object" &&
      hasImg((p as Record<string, Json>).before) &&
      hasImg((p as Record<string, Json>).after),
  );
  return { ...rec, pairs: kept };
}
