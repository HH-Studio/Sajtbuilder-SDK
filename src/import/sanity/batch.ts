// ---------------------------------------------------------------------------
// Splitting one converted dataset into runs the import will actually accept.
//
// The two asset caps behave differently, and that difference decides how this
// importer is built rather than being a detail of it:
//
//  - **The byte budget DEGRADES.** Past `maxTotalAssetBytes` the remaining
//    assets are marked `over_budget` and the import still lands.
//  - **The count is a HARD REJECTION.** `maxAssets` is 200, and a bundle
//    carrying 201 returns `too_many_assets` from validation, which fails the
//    WHOLE bundle. A portfolio hemsida with 300 images imports NOTHING.
//
// So the count cap cannot be handled by stopping and reporting. The payload is
// split into runs of at most `maxAssets`, and each later run is a MERGE into
// the same hemsida. That is also why the row merge had to exist first: without
// it, run two would duplicate every row run one wrote.
// ---------------------------------------------------------------------------

import type { PortableSiteV1 } from "../../convex/model/portable";
import { PORTABLE_CAPS } from "../../lib/portability/caps";

export type SanityBatch = {
  /** 1-based, so a CLI can honestly say "run 2 of 3". */
  index: number;
  total: number;
  /** The first run is the IMPORT; every later one is a merge into the hemsida
   *  the first one produced. */
  mode: "import" | "merge";
  site: PortableSiteV1;
  assetFiles: { fileName: string; bytes: Uint8Array }[];
};

/** Which export ids a value tree references. Mirrors the app's own
 *  `collectAssetIds` walk, in the small way this file needs it. */
function assetIdsIn(value: unknown, into: Set<string>, depth = 0): void {
  if (depth > 8 || !value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const entry of value) assetIdsIn(entry, into, depth + 1);
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === "assetId" && typeof entry === "string") into.add(entry);
    else assetIdsIn(entry, into, depth + 1);
  }
}

/**
 * Split a converted site into runs of at most `maxAssets` assets.
 *
 * Rows travel with their pictures, which is the only split that produces a
 * valid bundle: a row whose `assetId` names an asset that is not in the same
 * bundle imports pointing at nothing. Rows with no pictures ride the first run.
 *
 * Every run carries the same collections, because a collection is a shape and
 * a shape is cheap; the merge matches them on `externalKey` and writes each
 * one once.
 */
export function splitIntoBatches(
  site: PortableSiteV1,
  assetFiles: readonly { fileName: string; bytes: Uint8Array }[],
  maxAssets: number = PORTABLE_CAPS.maxAssets,
): SanityBatch[] {
  const rows = site.collectionRows ?? [];
  const assets = site.assets ?? [];
  if (assets.length <= maxAssets) {
    return [
      {
        index: 1,
        total: 1,
        mode: "import",
        site,
        assetFiles: [...assetFiles],
      },
    ];
  }

  const fileByName = new Map(assetFiles.map((file) => [file.fileName, file]));
  const assetById = new Map(assets.map((asset) => [asset.exportId, asset]));
  /** Rows grouped by the assets they need, so a row is never separated from a
   *  picture it points at. */
  const groups: { rowIndexes: number[]; assetIds: string[] }[] = [];
  const plain: number[] = [];
  rows.forEach((row, index) => {
    const ids = new Set<string>();
    assetIdsIn(row.values, ids);
    const usable = [...ids].filter((id) => assetById.has(id));
    if (usable.length === 0) {
      plain.push(index);
      return;
    }
    groups.push({ rowIndexes: [index], assetIds: usable });
  });

  // Greedy packing, in order. A cleverer bin-pack would fit marginally more per
  // run and make the order of an agency's properties depend on their file
  // sizes, which is a bad trade for a migration somebody has to eyeball.
  const runs: { rowIndexes: number[]; assetIds: Set<string> }[] = [];
  let current: { rowIndexes: number[]; assetIds: Set<string> } = {
    rowIndexes: [...plain],
    assetIds: new Set<string>(),
  };
  for (const group of groups) {
    const wouldBe = new Set(current.assetIds);
    for (const id of group.assetIds) wouldBe.add(id);
    if (wouldBe.size > maxAssets && current.assetIds.size > 0) {
      runs.push(current);
      current = { rowIndexes: [], assetIds: new Set<string>() };
    }
    current.rowIndexes.push(...group.rowIndexes);
    for (const id of group.assetIds) current.assetIds.add(id);
    // A single row needing more pictures than one run holds cannot be split.
    // It goes alone, over the cap, and the caller reports the rejection rather
    // than looping forever trying to make it fit.
    if (current.assetIds.size > maxAssets) {
      runs.push(current);
      current = { rowIndexes: [], assetIds: new Set<string>() };
    }
  }
  if (current.rowIndexes.length > 0 || current.assetIds.size > 0 || runs.length === 0) {
    runs.push(current);
  }

  return runs.map((run, index) => {
    const runAssets = assets.filter((asset) => run.assetIds.has(asset.exportId));
    const runRows = run.rowIndexes
      .slice()
      .sort((a, b) => a - b)
      .map((at) => rows[at]);
    return {
      index: index + 1,
      total: runs.length,
      mode: index === 0 ? ("import" as const) : ("merge" as const),
      site: {
        ...site,
        // The first run carries the pages; a later one carries none, so a merge
        // cannot re-add a page the agency has since deleted.
        pages: index === 0 ? site.pages : [],
        sections: index === 0 ? site.sections : [],
        assets: runAssets,
        collectionRows: runRows,
      },
      assetFiles: runAssets
        .map((asset) => fileByName.get(asset.url.split("/").pop() ?? ""))
        .filter((file): file is { fileName: string; bytes: Uint8Array } => !!file),
    };
  });
}
