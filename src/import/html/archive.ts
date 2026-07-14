import { Inflate } from "fflate";

export type HtmlArchiveLimits = {
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
  maxArchiveBytes: number;
};

export const DEFAULT_HTML_ARCHIVE_LIMITS: Readonly<HtmlArchiveLimits> = Object.freeze({
  maxEntries: 1_000,
  maxEntryBytes: 32 * 1024 * 1024,
  maxTotalBytes: 128 * 1024 * 1024,
  maxArchiveBytes: 64 * 1024 * 1024,
});

export type HtmlArchiveFile = {
  /** Safe, relative, slash-separated path rooted inside the archive. */
  path: string;
  bytes: Uint8Array;
};

export type HtmlArchiveErrorCode =
  | "invalid_archive"
  | "zip64_unsupported"
  | "multi_disk_unsupported"
  | "too_many_entries"
  | "entry_too_large"
  | "archive_too_large"
  | "absolute_path"
  | "path_traversal"
  | "duplicate_path"
  | "symlink_entry"
  | "encrypted_entry"
  | "unsupported_compression"
  | "header_mismatch";

export class HtmlArchiveError extends Error {
  readonly code: HtmlArchiveErrorCode;

  constructor(code: HtmlArchiveErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "HtmlArchiveError";
    this.code = code;
  }
}

type CentralEntry = {
  path: string;
  rawName: string;
  directory: boolean;
  flags: number;
  method: number;
  crc32: number;
  compressedBytes: number;
  inflatedBytes: number;
  localHeaderOffset: number;
  centralDirectoryOffset: number;
};

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const MAX_EOCD_SEARCH = 65_535 + 22;
const ALLOWED_METHODS = new Set([0, 8]);

function fail(code: HtmlArchiveErrorCode, message: string, cause?: unknown): never {
  throw new HtmlArchiveError(code, message, cause === undefined ? undefined : { cause });
}

function ensureRange(bytes: Uint8Array, offset: number, length: number, label: string): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > bytes.byteLength) {
    fail("invalid_archive", `${label} lies outside the archive`);
  }
}

function findEocd(bytes: Uint8Array, view: DataView): number {
  const minimum = Math.max(0, bytes.byteLength - MAX_EOCD_SEARCH);
  for (let offset = bytes.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) !== EOCD_SIGNATURE) continue;
    const commentLength = view.getUint16(offset + 20, true);
    if (offset + 22 + commentLength === bytes.byteLength) return offset;
  }
  fail("invalid_archive", "missing or malformed ZIP end record");
}

function decodeName(bytes: Uint8Array, utf8: boolean): string {
  if (!utf8 && bytes.some((value) => value > 0x7f)) {
    fail("invalid_archive", "non-UTF-8 ZIP filenames are unsupported");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    fail("invalid_archive", "ZIP filename is not valid UTF-8", error);
  }
}

function canonicalizePath(rawName: string): { path: string; directory: boolean } {
  if (rawName.length === 0 || rawName.includes("\0")) {
    fail("invalid_archive", "ZIP entry has an empty or NUL-containing filename");
  }
  const slashName = rawName.replaceAll("\\", "/");
  if (slashName.startsWith("/") || /^[A-Za-z]:/.test(slashName)) {
    fail("absolute_path", `absolute archive path is forbidden: ${JSON.stringify(rawName)}`);
  }
  const parts = slashName.split("/");
  if (parts.includes("..")) {
    fail("path_traversal", `parent traversal is forbidden: ${JSON.stringify(rawName)}`);
  }
  const normalizedParts = parts
    .filter((part) => part !== "" && part !== ".")
    .map((part) => part.normalize("NFC"));
  if (normalizedParts.length === 0) {
    fail("invalid_archive", `archive path has no filename: ${JSON.stringify(rawName)}`);
  }
  return {
    path: normalizedParts.join("/"),
    directory: slashName.endsWith("/"),
  };
}

function inspectExtraFields(bytes: Uint8Array, start: number, length: number): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = start;
  const end = start + length;
  while (offset < end) {
    if (offset + 4 > end) fail("invalid_archive", "truncated ZIP extra field");
    const id = view.getUint16(offset, true);
    const fieldLength = view.getUint16(offset + 2, true);
    offset += 4;
    if (offset + fieldLength > end) fail("invalid_archive", "truncated ZIP extra-field value");
    if (id === 0x0001) fail("zip64_unsupported", "ZIP64 archives are unsupported");
    if (id === 0x9901) fail("encrypted_entry", "AES-encrypted ZIP entries are unsupported");
    offset += fieldLength;
  }
}

function inspectCentralDirectory(bytes: Uint8Array, limits: HtmlArchiveLimits): CentralEntry[] {
  if (bytes.byteLength > limits.maxArchiveBytes) {
    fail("archive_too_large", `compressed archive exceeds ${limits.maxArchiveBytes} bytes`);
  }
  if (bytes.byteLength < 22) fail("invalid_archive", "archive is too short to be a ZIP file");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(bytes, view);
  if (eocd >= 20 && view.getUint32(eocd - 20, true) === ZIP64_LOCATOR_SIGNATURE) {
    fail("zip64_unsupported", "ZIP64 archives are unsupported");
  }

  const disk = view.getUint16(eocd + 4, true);
  const centralDisk = view.getUint16(eocd + 6, true);
  const diskEntries = view.getUint16(eocd + 8, true);
  const totalEntries = view.getUint16(eocd + 10, true);
  const centralBytes = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (disk === 0xffff || centralDisk === 0xffff || diskEntries === 0xffff || totalEntries === 0xffff || centralBytes === 0xffffffff || centralOffset === 0xffffffff) {
    fail("zip64_unsupported", "ZIP64 archive markers are unsupported");
  }
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== totalEntries) {
    fail("multi_disk_unsupported", "multi-disk ZIP archives are unsupported");
  }
  if (totalEntries > limits.maxEntries) {
    fail("too_many_entries", `archive has ${totalEntries} entries; limit is ${limits.maxEntries}`);
  }
  ensureRange(bytes, centralOffset, centralBytes, "central directory");
  if (centralOffset + centralBytes !== eocd) {
    fail("invalid_archive", "central directory size or offset does not match the ZIP end record");
  }

  const entries: CentralEntry[] = [];
  const paths = new Set<string>();
  let inflatedTotal = 0;
  let offset = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    ensureRange(bytes, offset, 46, `central entry ${index}`);
    if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      fail("invalid_archive", `central entry ${index} has an invalid signature`);
    }
    const madeBy = view.getUint16(offset + 4, true);
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const crc32 = view.getUint32(offset + 16, true);
    const compressedBytes = view.getUint32(offset + 20, true);
    const inflatedBytes = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const startDisk = view.getUint16(offset + 34, true);
    const externalAttributes = view.getUint32(offset + 38, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const recordBytes = 46 + nameLength + extraLength + commentLength;
    ensureRange(bytes, offset, recordBytes, `central entry ${index}`);

    if (compressedBytes === 0xffffffff || inflatedBytes === 0xffffffff || localHeaderOffset === 0xffffffff) {
      fail("zip64_unsupported", "ZIP64 entry markers are unsupported");
    }
    if (startDisk !== 0) fail("multi_disk_unsupported", "entry points to another ZIP disk");
    if ((flags & (0x0001 | 0x0040 | 0x2000)) !== 0) {
      fail("encrypted_entry", "encrypted ZIP entries are unsupported");
    }
    if (!ALLOWED_METHODS.has(method)) {
      fail("unsupported_compression", `ZIP compression method ${method} is unsupported`);
    }
    const hostSystem = madeBy >>> 8;
    const unixMode = externalAttributes >>> 16;
    if ((hostSystem === 3 || unixMode !== 0) && (unixMode & 0o170000) === 0o120000) {
      fail("symlink_entry", "symbolic links are forbidden in HTML archives");
    }
    if (inflatedBytes > limits.maxEntryBytes) {
      fail("entry_too_large", `entry ${index} exceeds ${limits.maxEntryBytes} inflated bytes`);
    }
    inflatedTotal += inflatedBytes;
    if (!Number.isSafeInteger(inflatedTotal) || inflatedTotal > limits.maxTotalBytes) {
      fail("archive_too_large", `archive exceeds ${limits.maxTotalBytes} total inflated bytes`);
    }

    const nameStart = offset + 46;
    const rawName = decodeName(bytes.subarray(nameStart, nameStart + nameLength), (flags & 0x0800) !== 0);
    const { path, directory } = canonicalizePath(rawName);
    if (paths.has(path)) fail("duplicate_path", `duplicate normalized archive path: ${JSON.stringify(path)}`);
    paths.add(path);
    inspectExtraFields(bytes, nameStart + nameLength, extraLength);
    entries.push({ path, rawName, directory, flags, method, crc32, compressedBytes, inflatedBytes, localHeaderOffset, centralDirectoryOffset: centralOffset });
    offset += recordBytes;
  }
  if (offset !== eocd) fail("invalid_archive", "central directory contains unparsed bytes");
  return entries;
}

type LocalEntry = {
  entry: CentralEntry;
  dataOffset: number;
  dataEnd: number;
};

function inspectLocalHeaders(bytes: Uint8Array, entries: readonly CentralEntry[]): LocalEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const localEntries: LocalEntry[] = [];
  for (const entry of entries) {
    const offset = entry.localHeaderOffset;
    ensureRange(bytes, offset, 30, `local header for ${entry.path}`);
    if (view.getUint32(offset, true) !== LOCAL_SIGNATURE) fail("header_mismatch", `invalid local header for ${entry.path}`);
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const localCrc32 = view.getUint32(offset + 14, true);
    const localCompressedBytes = view.getUint32(offset + 18, true);
    const localInflatedBytes = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const dataOffset = offset + 30 + nameLength + extraLength;
    ensureRange(bytes, offset, 30 + nameLength + extraLength, `local header for ${entry.path}`);
    ensureRange(bytes, dataOffset, entry.compressedBytes, `compressed data for ${entry.path}`);
    if (dataOffset + entry.compressedBytes > entry.centralDirectoryOffset) {
      fail("invalid_archive", `compressed data overlaps the central directory for ${entry.path}`);
    }
    if (flags !== entry.flags || method !== entry.method) fail("header_mismatch", `local and central flags/method differ for ${entry.path}`);
    if (
      (flags & 0x0008) === 0 &&
      (localCrc32 !== entry.crc32 || localCompressedBytes !== entry.compressedBytes || localInflatedBytes !== entry.inflatedBytes)
    ) {
      fail("header_mismatch", `local and central checksums/sizes differ for ${entry.path}`);
    }
    const rawName = decodeName(bytes.subarray(offset + 30, offset + 30 + nameLength), (flags & 0x0800) !== 0);
    if (rawName !== entry.rawName) fail("header_mismatch", `local and central filenames differ for ${entry.path}`);
    inspectExtraFields(bytes, offset + 30 + nameLength, extraLength);
    localEntries.push({ entry, dataOffset, dataEnd: dataOffset + entry.compressedBytes });
  }

  const ordered = [...localEntries].sort((left, right) => left.entry.localHeaderOffset - right.entry.localHeaderOffset);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!;
    const current = ordered[index]!;
    if (current.entry.localHeaderOffset < previous.dataEnd) {
      fail("invalid_archive", `local ZIP regions overlap for ${previous.entry.path} and ${current.entry.path}`);
    }
  }
  return localEntries;
}

let crcTable: Uint32Array | undefined;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let value = n;
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      crcTable[n] = value >>> 0;
    }
  }
  let result = 0xffffffff;
  for (const byte of bytes) result = crcTable[(result ^ byte) & 0xff]! ^ (result >>> 8);
  return (result ^ 0xffffffff) >>> 0;
}

function resolveLimits(overrides?: Partial<HtmlArchiveLimits>): HtmlArchiveLimits {
  const limits = { ...DEFAULT_HTML_ARCHIVE_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 0) fail("invalid_archive", `${name} must be a non-negative safe integer`);
  }
  return limits;
}

function inflateEntry(bytes: Uint8Array, local: LocalEntry): Uint8Array {
  const { entry, dataOffset, dataEnd } = local;
  const compressed = bytes.subarray(dataOffset, dataEnd);
  if (entry.method === 0) {
    if (entry.compressedBytes !== entry.inflatedBytes) {
      fail("invalid_archive", `stored entry sizes differ for ${entry.path}`);
    }
    return compressed.slice();
  }

  const output = new Uint8Array(entry.inflatedBytes);
  let outputOffset = 0;
  let finished = false;
  try {
    const inflater = new Inflate((chunk, final) => {
      if (outputOffset + chunk.byteLength > output.byteLength) {
        fail("invalid_archive", `actual inflated output exceeds the declared bounded size for ${entry.path}`);
      }
      output.set(chunk, outputOffset);
      outputOffset += chunk.byteLength;
      if (final) finished = true;
    });
    // Small compressed chunks bound transient inflater output even when a
    // hostile stream advertises an artificially tiny uncompressed size.
    const chunkBytes = 64;
    if (compressed.byteLength === 0) inflater.push(compressed, true);
    for (let offset = 0; offset < compressed.byteLength; offset += chunkBytes) {
      const end = Math.min(offset + chunkBytes, compressed.byteLength);
      inflater.push(compressed.subarray(offset, end), end === compressed.byteLength);
    }
  } catch (error) {
    if (error instanceof HtmlArchiveError) throw error;
    fail("invalid_archive", `ZIP extraction failed for ${entry.path}`, error);
  }
  if (!finished || outputOffset !== entry.inflatedBytes) {
    fail("invalid_archive", `actual size differs for ${entry.path}`);
  }
  return output;
}

/**
 * Inspect and extract a static-site ZIP without trusting its paths or inflated
 * sizes. All central and local headers are accepted or rejected before fflate
 * sees compressed data; each entry is then streamed into a pre-bounded output
 * buffer and its actual size and CRC are re-verified.
 */
export function extractHtmlArchive(
  bytes: Uint8Array,
  limitOverrides?: Partial<HtmlArchiveLimits>,
): HtmlArchiveFile[] {
  const limits = resolveLimits(limitOverrides);
  const entries = inspectCentralDirectory(bytes, limits);
  const localEntries = inspectLocalHeaders(bytes, entries);

  const files: HtmlArchiveFile[] = [];
  let actualTotal = 0;
  for (const local of localEntries) {
    const { entry } = local;
    const actual = inflateEntry(bytes, local);
    actualTotal += actual.byteLength;
    if (actual.byteLength > limits.maxEntryBytes || actualTotal > limits.maxTotalBytes) {
      fail("archive_too_large", "actual extracted output exceeds configured limits");
    }
    if (crc32(actual) !== entry.crc32) fail("invalid_archive", `CRC check failed for ${entry.path}`);
    if (!entry.directory) files.push({ path: entry.path, bytes: actual });
  }
  return files;
}
