// ---------------------------------------------------------------------------
// Self-contained backup bundle (v1) - the ".zip you can restore anywhere".
//
// The plain-JSON export (`portability.exportSite` → PortableSiteV1) embeds LIVE
// Convex storage URLs for every image/font. That makes it re-importable ONLY
// while those URLs still resolve - delete the source site (or let its blobs get
// GC'd, or move deployments) and the import silently drops those assets
// (LEAK-1, docs/known-issues.md). A backup that can lose your images on restore
// isn't a backup.
//
// The bundle fixes that: it is a `.zip` containing the same `site.json`
// (PortableSiteV1) PLUS every referenced blob embedded under `assets/` and
// `fonts/`, with a `manifest.json` mapping each blob to its export id and a
// sha256 checksum. On import the bytes come from the zip (integrity-checked),
// never from a network fetch - so a restore is self-contained and survives the
// source site's deletion.
//
// Pure + isomorphic (Web Crypto + fetch only): shared by the Next.js export
// routes (build the zip) and the Convex import action (verify checksums).
// ---------------------------------------------------------------------------

import type { PortableSiteV1 } from "../../convex/model/portable";

export const BUNDLE_FORMAT = "sajt-backup" as const;
export const BUNDLE_VERSION = 1 as const;

/** Fixed entry names at the zip root. */
export const BUNDLE_SITE_JSON = "site.json";
export const BUNDLE_MANIFEST_JSON = "manifest.json";

export type BundleManifestAsset = {
  exportId: string;
  path: string;
  sha256: string;
  bytes: number;
  mimeType: string;
};

export type BundleManifestFont = {
  /** Font row export-local id (PortableSiteV1.fonts[].tmpId). */
  tmpId: string;
  /** Index within that font's `files[]` array. */
  index: number;
  path: string;
  sha256: string;
  bytes: number;
};

export type BundleManifest = {
  format: typeof BUNDLE_FORMAT;
  version: typeof BUNDLE_VERSION;
  exportedAt: string;
  assets: BundleManifestAsset[];
  fonts: BundleManifestFont[];
};

/** Stable staging key for a font face file (font tmpId + its files[] index). */
export function fontStageKey(tmpId: string, index: number): string {
  return `${tmpId}#${index}`;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "font/woff2": "woff2",
  "font/woff": "woff",
  "font/ttf": "ttf",
  "font/otf": "otf",
  "application/font-woff2": "woff2",
  "application/font-woff": "woff",
  "application/x-font-ttf": "ttf",
};

/** File extension for a blob, from its declared mime type then the URL tail. */
export function extForMime(mime: string, url: string): string {
  const clean = (mime || "").split(";")[0].trim().toLowerCase();
  if (EXT_BY_MIME[clean]) return EXT_BY_MIME[clean];
  const m = url.split("?")[0].match(/\.([a-z0-9]{2,5})$/i);
  if (m) return m[1].toLowerCase();
  if (clean.startsWith("font/")) return "woff2";
  return "bin";
}

/** Lowercase hex sha256 of the given bytes (Web Crypto - works in the browser,
 *  Node 20+, and the Convex default runtime). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Copy into a fresh ArrayBuffer-backed view: fflate/Convex hand back
  // `Uint8Array<ArrayBufferLike>`, which the DOM `BufferSource` type rejects
  // (it could in principle be SharedArrayBuffer-backed).
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  const view = new Uint8Array(digest);
  let out = "";
  for (let i = 0; i < view.length; i++) out += view[i].toString(16).padStart(2, "0");
  return out;
}

/** `assets/<exportId>.<ext>` - exportId is a Convex document id (URL/filename-safe). */
export function assetPath(exportId: string, ext: string): string {
  return `assets/${exportId}.${ext}`;
}

/** `fonts/<tmpId>__<index>.<ext>`. */
export function fontPath(tmpId: string, index: number, ext: string): string {
  return `fonts/${tmpId}__${index}.${ext}`;
}

export type BundleBlobs = {
  /** zip-entry path → bytes, for every embedded asset/font blob. */
  files: Record<string, Uint8Array>;
  manifest: BundleManifest;
  totalBytes: number;
  /** exportId / font key of blobs that couldn't be fetched at export time. */
  skipped: string[];
};

/** A self-contained backup is only truthful when every referenced blob made it
 * into the archive. Developer exports may choose best-effort behavior, but the
 * backup route must fail closed when this is false. */
export function bundleIsComplete(bundle: Pick<BundleBlobs, "skipped">): boolean {
  return bundle.skipped.length === 0;
}

/**
 * Fetch every image + uploaded-font blob referenced by a portable payload and
 * lay them out for the zip: returns the `files` map, a checksummed `manifest`,
 * and the list of anything that failed to fetch. Bounded by `maxTotalBytes` (the
 * whole zip is assembled in memory). `fetchImpl` is injected so the export route
 * can pass the platform `fetch` - the URLs are the owner's own Convex storage
 * URLs (public, signed), so no SSRF surface; a scheme guard is kept anyway.
 */
export async function collectBundleBlobs(
  payload: PortableSiteV1,
  fetchImpl: typeof fetch,
  maxTotalBytes: number,
  exportedAt: string,
): Promise<BundleBlobs> {
  const files: Record<string, Uint8Array> = {};
  const assets: BundleManifestAsset[] = [];
  const fonts: BundleManifestFont[] = [];
  const skipped: string[] = [];
  let totalBytes = 0;

  async function fetchBytes(url: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
    let scheme: string;
    try {
      scheme = new URL(url).protocol;
    } catch {
      return null;
    }
    if (scheme !== "http:" && scheme !== "https:") return null;
    try {
      const res = await fetchImpl(url);
      if (!res.ok) return null;
      const mime = (res.headers.get("content-type") || "").split(";")[0].trim();
      const bytes = new Uint8Array(await res.arrayBuffer());
      return { bytes, mime };
    } catch {
      return null;
    }
  }

  for (const a of payload.assets) {
    const got = await fetchBytes(a.url);
    if (!got) {
      skipped.push(a.exportId);
      continue;
    }
    if (totalBytes + got.bytes.byteLength > maxTotalBytes) {
      skipped.push(a.exportId);
      continue;
    }
    const mime = got.mime || a.mimeType;
    const path = assetPath(a.exportId, extForMime(mime, a.url));
    files[path] = got.bytes;
    totalBytes += got.bytes.byteLength;
    assets.push({
      exportId: a.exportId,
      path,
      sha256: await sha256Hex(got.bytes),
      bytes: got.bytes.byteLength,
      mimeType: mime,
    });
  }

  for (const f of payload.fonts) {
    if (f.source !== "upload" || !f.files) continue;
    for (let i = 0; i < f.files.length; i++) {
      const ff = f.files[i];
      const got = await fetchBytes(ff.url);
      if (!got) {
        skipped.push(fontStageKey(f.tmpId, i));
        continue;
      }
      if (totalBytes + got.bytes.byteLength > maxTotalBytes) {
        skipped.push(fontStageKey(f.tmpId, i));
        continue;
      }
      const path = fontPath(f.tmpId, i, extForMime(got.mime || `font/${ff.format}`, ff.url));
      files[path] = got.bytes;
      totalBytes += got.bytes.byteLength;
      fonts.push({
        tmpId: f.tmpId,
        index: i,
        path,
        sha256: await sha256Hex(got.bytes),
        bytes: got.bytes.byteLength,
      });
    }
  }

  return {
    files,
    manifest: { format: BUNDLE_FORMAT, version: BUNDLE_VERSION, exportedAt, assets, fonts },
    totalBytes,
    skipped,
  };
}
