// ---------------------------------------------------------------------------
// Reading a `sanity dataset export` tarball.
//
// The tar reader is hand-written rather than a dependency, for two reasons that
// both matter here: this package ships to agencies and every dependency it adds
// is one they audit, and a tar entry is a 512-byte header with a name and a
// size, which is small enough to read correctly and to bound explicitly.
//
// **Nothing in this file executes anything.** A dataset export is data, which
// is what makes this lane easier than the HTML one - but the rule is the same
// rule: external source material is evidence, never the runtime.
// ---------------------------------------------------------------------------

import { gunzipSync } from "node:zlib";
import {
  SANITY_EXPORT_LIMITS,
  type SanityDocument,
  type SanityExport,
  type SanityExportAsset,
} from "./model";

export class SanityExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SanityExportError";
  }
}

type TarEntry = { name: string; bytes: Uint8Array };

/** Octal fields in a tar header are NUL- or space-terminated, and a field that
 *  is entirely padding means zero. */
function readOctal(header: Uint8Array, offset: number, length: number): number {
  let text = "";
  for (let i = offset; i < offset + length; i += 1) {
    const code = header[i];
    if (code === 0 || code === 32) break;
    text += String.fromCharCode(code);
  }
  const value = Number.parseInt(text.trim(), 8);
  return Number.isFinite(value) ? value : 0;
}

function readString(header: Uint8Array, offset: number, length: number): string {
  let text = "";
  for (let i = offset; i < offset + length; i += 1) {
    const code = header[i];
    if (code === 0) break;
    text += String.fromCharCode(code);
  }
  return text;
}

/** Walk a POSIX tar archive. Handles the GNU/PAX long-name records a Sanity
 *  export can carry (`L` and `x`), skips everything that is not a regular
 *  file, and never follows a link entry - a symlink inside an archive we
 *  unpack in memory has nothing to point at, and honouring one is how archive
 *  readers get talked into reading files outside themselves. */
export function readTar(archive: Uint8Array): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;
  let pendingLongName: string | null = null;
  while (offset + 512 <= archive.byteLength) {
    const header = archive.subarray(offset, offset + 512);
    // Two consecutive zero blocks end the archive; one is enough to stop on,
    // since a real header always carries a name.
    if (header.every((byte) => byte === 0)) break;
    const rawName = readString(header, 0, 100);
    const prefix = readString(header, 345, 155);
    const size = readOctal(header, 124, 12);
    const typeFlag = String.fromCharCode(header[156] || 48);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > archive.byteLength) {
      throw new SanityExportError(
        "the export archive ends in the middle of a file, so it is truncated or not a tar",
      );
    }
    const body = archive.subarray(dataStart, dataEnd);
    // Advance past the data, rounded up to the 512-byte block.
    offset = dataStart + Math.ceil(size / 512) * 512;

    if (typeFlag === "L" || typeFlag === "x") {
      // GNU long name, or a PAX extended header whose `path` record names the
      // next entry. Both describe the entry that FOLLOWS, so remember it.
      const text = Buffer.from(body).toString("utf8");
      const paxPath = /(?:^|\n)\d+ path=([^\n]+)\n/.exec(text);
      pendingLongName = (paxPath ? paxPath[1] : text.replace(/\0+$/, "")).trim();
      continue;
    }
    const name = pendingLongName ?? (prefix ? `${prefix}/${rawName}` : rawName);
    pendingLongName = null;
    // "0" and "\0" are a regular file. Everything else - directory, symlink,
    // hard link, device, FIFO - carries no content we want.
    if (typeFlag !== "0" && typeFlag !== "\0") continue;
    entries.push({ name, bytes: body });
  }
  return entries;
}

/** `images/8f2c…-1200x800.jpg` -> `image-8f2c…-1200x800-jpg`, which is the id
 *  the documents reference. The export names the FILE after the asset, so the
 *  mapping is mechanical and does not need the asset documents. */
export function assetIdFromPath(path: string): string | null {
  const file = path.split("/").pop() ?? "";
  const folder = path.includes("/") ? path.split("/")[0] : "";
  const dot = file.lastIndexOf(".");
  if (dot <= 0) return null;
  const stem = file.slice(0, dot);
  const ext = file.slice(dot + 1).toLowerCase();
  if (!stem || !ext) return null;
  const kind = folder === "files" ? "file" : "image";
  return `${kind}-${stem}-${ext}`;
}

/** Parse a dataset export tarball, gzipped or not.
 *
 *  Drafts are separated rather than dropped: a `drafts.` document with no
 *  published twin is real unpublished content, and the converter imports it
 *  with `excludeFromPublish` set instead of pretending it is not there. */
export function readSanityExport(archive: Uint8Array): SanityExport {
  if (archive.byteLength > SANITY_EXPORT_LIMITS.maxArchiveBytes) {
    throw new SanityExportError(
      `the export is larger than the ${SANITY_EXPORT_LIMITS.maxArchiveBytes} byte ceiling this reader accepts`,
    );
  }
  // gzip magic. `sanity dataset export` writes `.tar.gz`, but an agency that
  // has already unpacked one step should not be told to repack it.
  const raw =
    archive.byteLength > 2 && archive[0] === 0x1f && archive[1] === 0x8b
      ? new Uint8Array(gunzipSync(Buffer.from(archive)))
      : archive;
  const entries = readTar(raw);
  if (entries.length === 0) {
    throw new SanityExportError("the export archive contains no files");
  }

  const documents = new Map<string, SanityDocument>();
  const drafts = new Map<string, SanityDocument>();
  const assets = new Map<string, SanityExportAsset>();
  const typeCounts = new Map<string, number>();

  for (const entry of entries) {
    const name = entry.name.replace(/^\.\/+/, "");
    if (name.endsWith(".ndjson")) {
      readNdjson(entry.bytes, documents, drafts);
      continue;
    }
    if (!name.startsWith("images/") && !name.startsWith("files/")) continue;
    if (assets.size >= SANITY_EXPORT_LIMITS.maxAssets) continue;
    if (entry.bytes.byteLength > SANITY_EXPORT_LIMITS.maxAssetBytes) continue;
    const assetId = assetIdFromPath(name);
    if (!assetId) continue;
    assets.set(assetId, { path: name, assetId, bytes: entry.bytes });
  }

  if (documents.size === 0 && drafts.size === 0) {
    throw new SanityExportError(
      "the export archive has no data.ndjson, so it is not a `sanity dataset export`",
    );
  }
  for (const doc of documents.values()) {
    typeCounts.set(doc._type, (typeCounts.get(doc._type) ?? 0) + 1);
  }
  return { documents, drafts, assets, typeCounts };
}

function readNdjson(
  bytes: Uint8Array,
  documents: Map<string, SanityDocument>,
  drafts: Map<string, SanityDocument>,
): void {
  const text = Buffer.from(bytes).toString("utf8");
  let count = 0;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    count += 1;
    if (count > SANITY_EXPORT_LIMITS.maxDocuments) {
      throw new SanityExportError(
        `the export holds more than ${SANITY_EXPORT_LIMITS.maxDocuments} documents, which is past what this importer reads in one run`,
      );
    }
    if (trimmed.length > SANITY_EXPORT_LIMITS.maxDocumentBytes) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // One unreadable line is not a reason to refuse the dataset. It is
      // counted by the caller through the document totals, which is where a
      // gap shows up honestly.
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const doc = parsed as SanityDocument;
    if (typeof doc._id !== "string" || typeof doc._type !== "string") continue;
    // `sanity.imageAsset` / `sanity.fileAsset` documents describe the files we
    // already read out of the tarball. Keeping them would make every asset
    // look like a content type in the mapping proposal.
    if (doc._type.startsWith("sanity.")) continue;
    if (doc._id.startsWith("drafts.")) {
      drafts.set(doc._id.slice("drafts.".length), doc);
    } else {
      documents.set(doc._id, doc);
    }
  }
}
