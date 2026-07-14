// ---------------------------------------------------------------------------
// Site Kit — pack a validated site package directory into the self-contained
// backup `.zip` that Settings → "Backup & move" → import accepts
// (`portability.importSiteBundle`). Mirrors the layout `lib/export/bundle.ts`
// produces: site.json + manifest.json + assets/<exportId>.<ext> +
// fonts/<tmpId>__<i>.<ext>, with a sha256 per blob. Pure (bytes in → bytes
// out); the CLI wrapper does the fs work.
// ---------------------------------------------------------------------------

import { zipSync } from "fflate";
import type { PortableSiteV1 } from "../../convex/model/portable";
import {
  BUNDLE_FORMAT,
  BUNDLE_VERSION,
  BUNDLE_SITE_JSON,
  BUNDLE_MANIFEST_JSON,
  type BundleManifest,
  type BundleManifestAsset,
  type BundleManifestFont,
  sha256Hex,
} from "../export/bundle";
import { PORTABLE_CAPS } from "../portability/caps";
import { validateSitePackage } from "./validate";

export type PackInput = {
  site: PortableSiteV1;
  /** Blob file name → bytes, as found under the package's `assets/` dir
   *  (names are `<exportId>.<ext>`). */
  assetFiles: Record<string, Uint8Array>;
  /** Blob file name → bytes from `fonts/` (names are `<tmpId>__<index>.<ext>`). */
  fontFiles?: Record<string, Uint8Array>;
  /** Injectable for tests; defaults to now. */
  exportedAt?: string;
  /** Explicit label embedded in a bundle produced from an unresolved import report. */
  reviewDraft?: {
    reportStatus: "review_required" | "blocked";
    acknowledgedAt: string;
    files?: Partial<Record<ReviewArtifactName, Uint8Array>>;
  };
};

export const REVIEW_ARTIFACT_NAMES = [
  "import-report.json",
  "import-report.md",
  "evidence.json",
  "validation.json",
  "import-provenance.json",
  "REVIEW-DRAFT.md",
] as const;
export type ReviewArtifactName = (typeof REVIEW_ARTIFACT_NAMES)[number];

export type PackResult = {
  zip: Uint8Array;
  manifest: BundleManifest;
  /** exportIds / font keys declared in site.json with no blob file provided.
   *  The import falls back to fetching their `url` (and skips on failure). */
  missing: string[];
};

/** Build the importable bundle zip. Throws on total-size cap violation. */
export async function packSitePackage(input: PackInput): Promise<PackResult> {
  const { site, assetFiles } = input;
  const fontFiles = input.fontFiles ?? {};
  const validation = validateSitePackage(site, {
    assetFileNames: new Set(Object.keys(assetFiles)),
    fontFileNames: new Set(Object.keys(fontFiles)),
  });
  if (!validation.ok) {
    const messages = validation.issues
      .filter((issue) => issue.level === "error")
      .map((issue) => `${issue.path}: ${issue.message}`);
    throw new Error(`cannot pack an invalid site package:\n${messages.join("\n")}`);
  }
  const files: Record<string, Uint8Array> = {};
  const assets: BundleManifestAsset[] = [];
  const fonts: BundleManifestFont[] = [];
  const missing: string[] = [];
  let totalBytes = 0;

  for (const a of site.assets) {
    const matches = Object.keys(assetFiles).filter((n) => n.startsWith(`${a.exportId}.`));
    if (matches.length > 1) {
      throw new Error(`ambiguous blobs for asset "${a.exportId}": ${matches.join(", ")}`);
    }
    const name = matches[0];
    if (!name) {
      missing.push(a.exportId);
      continue;
    }
    const bytes = assetFiles[name];
    const path = `assets/${name}`;
    files[path] = bytes;
    totalBytes += bytes.byteLength;
    assets.push({
      exportId: a.exportId,
      path,
      sha256: await sha256Hex(bytes),
      bytes: bytes.byteLength,
      mimeType: a.mimeType,
    });
  }

  for (const f of site.fonts) {
    if (f.source !== "upload" || !f.files) continue;
    for (let i = 0; i < f.files.length; i++) {
      const key = `${f.tmpId}__${i}`;
      const matches = Object.keys(fontFiles).filter((n) => n.startsWith(`${key}.`));
      if (matches.length > 1) {
        throw new Error(`ambiguous blobs for font face "${key}": ${matches.join(", ")}`);
      }
      const name = matches[0];
      if (!name) {
        missing.push(`${f.tmpId}#${i}`);
        continue;
      }
      const bytes = fontFiles[name];
      const path = `fonts/${name}`;
      files[path] = bytes;
      totalBytes += bytes.byteLength;
      fonts.push({
        tmpId: f.tmpId,
        index: i,
        path,
        sha256: await sha256Hex(bytes),
        bytes: bytes.byteLength,
      });
    }
  }

  const manifest: BundleManifest = {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    assets,
    fonts,
  };

  const enc = new TextEncoder();
  const sitePath = input.reviewDraft ? "REVIEW-DRAFT/site.json" : BUNDLE_SITE_JSON;
  files[sitePath] = enc.encode(JSON.stringify(site));
  files[BUNDLE_MANIFEST_JSON] = enc.encode(JSON.stringify(manifest));
  if (input.reviewDraft) {
    const { files: reviewFiles, ...reviewMetadata } = input.reviewDraft;
    files["REVIEW-DRAFT.json"] = enc.encode(JSON.stringify({
      kind: "snabbsajt-review-draft",
      publishReady: false,
      ...reviewMetadata,
    }));
    for (const name of REVIEW_ARTIFACT_NAMES) {
      const bytes = reviewFiles?.[name];
      if (!bytes) continue;
      files[`REVIEW-DRAFT/${name}`] = bytes;
      totalBytes += bytes.byteLength;
    }
  }
  totalBytes += files[sitePath].byteLength + files[BUNDLE_MANIFEST_JSON].byteLength;
  if (files["REVIEW-DRAFT.json"]) totalBytes += files["REVIEW-DRAFT.json"].byteLength;

  if (totalBytes > PORTABLE_CAPS.maxBundleBytes) {
    throw new Error(
      `bundle would be ${totalBytes} bytes, over the ${PORTABLE_CAPS.maxBundleBytes} import cap`,
    );
  }

  return { zip: zipSync(files), manifest, missing };
}
