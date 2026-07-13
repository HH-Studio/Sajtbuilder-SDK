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
 * Post-remap repair for the only section type with a *required* image ref:
 * `before-after` pairs (`{ before, after, label? }`, both images required and
 * living inside the `pairs` array). If a pair lost an image during remap, drop
 * that pair so the content stays schema-valid. Every other media ref is either
 * optional or an array element, so generic remap already leaves valid content.
 */
export function sanitizeAfterRemap(type: string, content: Json): Json {
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
