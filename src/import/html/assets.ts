import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from "node:fs";
import { basename, dirname, extname, join, posix, resolve, sep } from "node:path";

export type AssetKind = "image" | "font" | "media" | "other";
export type IngestedAsset = {
  path: string;
  source: string;
  kind: AssetKind;
  mediaType: string;
  bytes: Uint8Array;
  sha256: string;
};

const MEDIA_TYPES: Record<string, string> = {
  ".avif": "image/avif", ".gif": "image/gif", ".jpeg": "image/jpeg", ".jpg": "image/jpeg",
  ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
};

export function classifyAsset(path: string, contentType?: string): { kind: AssetKind; mediaType: string } {
  const extension = extname(new URL(path, "https://asset.invalid").pathname).toLowerCase();
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase() || MEDIA_TYPES[extension] || "application/octet-stream";
  const kind: AssetKind = mediaType.startsWith("image/")
    ? "image"
    : mediaType.startsWith("font/") || [".woff", ".woff2", ".ttf", ".otf"].includes(extension)
      ? "font"
      : mediaType.startsWith("video/") || mediaType.startsWith("audio/")
        ? "media"
        : "other";
  return { kind, mediaType };
}

export function assetRecord(path: string, source: string, bytes: Uint8Array, contentType?: string): IngestedAsset {
  const classification = classifyAsset(path, contentType);
  return {
    path,
    source,
    ...classification,
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function resolveArchiveReference(fromPath: string, reference: string): string | null {
  if (!reference || reference.startsWith("#") || /^(?:data|javascript|mailto|tel):/i.test(reference)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(reference) || reference.startsWith("//")) return null;
  let pathname: string;
  try {
    pathname = decodeURIComponent(reference.split(/[?#]/, 1)[0]).replace(/\\/g, "/");
  } catch {
    return null;
  }
  const joined = pathname.startsWith("/")
    ? posix.normalize(pathname.slice(1))
    : posix.normalize(posix.join(posix.dirname(fromPath), pathname));
  if (!joined || joined === "." || joined === ".." || joined.startsWith("../") || posix.isAbsolute(joined)) return null;
  return joined;
}

export function resolveSameOrigin(reference: string, base: string, origin: string): URL | null {
  try {
    const resolved = new URL(reference, base);
    resolved.hash = "";
    if (!['http:', 'https:'].includes(resolved.protocol) || resolved.origin !== origin) return null;
    return resolved;
  } catch {
    return null;
  }
}

function isWithin(root: string, target: string): boolean {
  return target === root || target.startsWith(`${root}${sep}`);
}

type ReadLocalFileTestHooks = {
  /** Test-only race injection after the descriptor is opened and validated. */
  afterOpen?: () => void;
  /** Test-only race injection after the bounded read and before revalidation. */
  afterRead?: () => void;
};

export function readLocalFile(options: {
  root: string;
  path: string;
  maxBytes: number;
  capLabel: string;
}, testHooks?: ReadLocalFileTestHooks): Uint8Array {
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 0) {
    throw new RangeError("maxBytes must be a non-negative safe integer");
  }

  const lexicalRoot = resolve(options.root);
  const lexicalTarget = resolve(lexicalRoot, options.path);
  if (!isWithin(lexicalRoot, lexicalTarget)) throw new Error(`path is outside selected root: ${options.path}`);
  if (lstatSync(lexicalRoot).isSymbolicLink()) throw new Error(`selected root must not be a symbolic link: ${options.root}`);

  let canonicalRoot: string;
  let canonicalParent: string;
  try {
    canonicalRoot = realpathSync(lexicalRoot);
    canonicalParent = realpathSync(dirname(lexicalTarget));
  } catch {
    throw new Error(`referenced file not found: ${options.path}`);
  }
  if (!isWithin(canonicalRoot, canonicalParent)) throw new Error(`path is outside selected root: ${options.path}`);

  const canonicalTarget = join(canonicalParent, basename(lexicalTarget));
  let descriptor: number | undefined;
  try {
    const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
    descriptor = openSync(canonicalTarget, constants.O_RDONLY | noFollow);
    const before = fstatSync(descriptor);
    if (!before.isFile()) throw new Error(`referenced file not found: ${options.path}`);
    if (before.size > options.maxBytes) throw new Error(`${options.capLabel} byte cap exceeded by ${options.path}`);

    testHooks?.afterOpen?.();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total <= options.maxBytes) {
      const remaining = options.maxBytes + 1 - total;
      const chunk = new Uint8Array(Math.min(64 * 1024, remaining));
      const count = readSync(descriptor, chunk, 0, chunk.byteLength, total);
      if (count === 0) break;
      chunks.push(chunk.subarray(0, count));
      total += count;
    }
    if (total > options.maxBytes) throw new Error(`${options.capLabel} byte cap exceeded by ${options.path}`);

    testHooks?.afterRead?.();
    const after = fstatSync(descriptor);
    const current = lstatSync(canonicalTarget);
    if (
      before.dev !== after.dev || before.ino !== after.ino || before.mode !== after.mode ||
      before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs ||
      current.isSymbolicLink() || current.dev !== after.dev || current.ino !== after.ino
    ) {
      throw new Error(`file changed while being read: ${options.path}`);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } catch (error) {
    if (error instanceof Error && [
      "path is outside selected root:",
      "selected root must not be a symbolic link:",
      "referenced file not found:",
      `${options.capLabel} byte cap exceeded by`,
      "file changed while being read:",
    ].some((prefix) => error.message.startsWith(prefix))) throw error;
    throw new Error(`referenced file not found or unsafe: ${options.path}`, { cause: error });
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
