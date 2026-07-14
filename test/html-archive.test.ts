import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  HtmlArchiveError,
  extractHtmlArchive,
  type HtmlArchiveErrorCode,
} from "../src/import/html/archive";

const encoder = new TextEncoder();

function zip(files: Record<string, string>): Uint8Array {
  return zipSync(
    Object.fromEntries(Object.entries(files).map(([name, value]) => [name, encoder.encode(value)])),
  );
}

function findSignature(bytes: Uint8Array, signature: number, from = 0): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = from; offset <= bytes.byteLength - 4; offset += 1) {
    if (view.getUint32(offset, true) === signature) return offset;
  }
  throw new Error(`signature ${signature.toString(16)} not found`);
}

function expectArchiveError(action: () => unknown, code: HtmlArchiveErrorCode): void {
  try {
    action();
    throw new Error(`expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(HtmlArchiveError);
    expect((error as HtmlArchiveError).code).toBe(code);
  }
}

describe("extractHtmlArchive", () => {
  it("extracts bounded files and returns canonical archive paths", () => {
    const result = extractHtmlArchive(
      zip({ "index.html": "<h1>Hello</h1>", "assets/site.css": "h1{color:red}" }),
    );

    expect(result.map((file) => file.path)).toEqual(["index.html", "assets/site.css"]);
    expect(new TextDecoder().decode(result[0]?.bytes)).toBe("<h1>Hello</h1>");
  });

  it.each([
    ["/index.html", "absolute_path"],
    ["C:/index.html", "absolute_path"],
    ["C:index.html", "absolute_path"],
    ["\\\\server\\index.html", "absolute_path"],
    ["../index.html", "path_traversal"],
    ["pages/../../index.html", "path_traversal"],
  ] as const)("rejects unsafe path %s", (name, code) => {
    expectArchiveError(() => extractHtmlArchive(zip({ [name]: "unsafe" })), code);
  });

  it("rejects duplicate normalized names", () => {
    expectArchiveError(
      () => extractHtmlArchive(zip({ "assets/site.css": "a", "assets/./site.css": "b" })),
      "duplicate_path",
    );
  });

  it("rejects duplicate Unicode-normalized names", () => {
    expectArchiveError(
      () => extractHtmlArchive(zip({ "café.html": "a", "cafe\u0301.html": "b" })),
      "duplicate_path",
    );
  });

  it("rejects entries over the per-entry cap before extraction", () => {
    expectArchiveError(
      () => extractHtmlArchive(zip({ "large.html": "x".repeat(33) }), { maxEntryBytes: 32 }),
      "entry_too_large",
    );
  });

  it("rejects archives over the total inflated-byte cap before extraction", () => {
    expectArchiveError(
      () => extractHtmlArchive(zip({ "a.html": "x".repeat(20), "b.html": "y".repeat(20) }), { maxTotalBytes: 32 }),
      "archive_too_large",
    );
  });

  it("rejects too many entries before extraction", () => {
    expectArchiveError(
      () => extractHtmlArchive(zip({ "a.html": "a", "b.html": "b" }), { maxEntries: 1 }),
      "too_many_entries",
    );
  });

  it("rejects encrypted entries", () => {
    const bytes = zip({ "index.html": "hello" }).slice();
    const local = findSignature(bytes, 0x04034b50);
    const central = findSignature(bytes, 0x02014b50);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    view.setUint16(local + 6, view.getUint16(local + 6, true) | 1, true);
    view.setUint16(central + 8, view.getUint16(central + 8, true) | 1, true);

    expectArchiveError(() => extractHtmlArchive(bytes), "encrypted_entry");
  });

  it("rejects unsupported compression methods", () => {
    const bytes = zip({ "index.html": "hello" }).slice();
    const local = findSignature(bytes, 0x04034b50);
    const central = findSignature(bytes, 0x02014b50);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    view.setUint16(local + 8, 12, true);
    view.setUint16(central + 10, 12, true);

    expectArchiveError(() => extractHtmlArchive(bytes), "unsupported_compression");
  });

  it("rejects Unix symlink entries", () => {
    const bytes = zip({ "link.html": "index.html" }).slice();
    const central = findSignature(bytes, 0x02014b50);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    view.setUint16(central + 4, (3 << 8) | 20, true);
    view.setUint32(central + 38, 0o120777 << 16, true);

    expectArchiveError(() => extractHtmlArchive(bytes), "symlink_entry");
  });

  it("rejects ZIP64 markers", () => {
    const bytes = zip({ "index.html": "hello" }).slice();
    const eocd = findSignature(bytes, 0x06054b50);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    view.setUint16(eocd + 10, 0xffff, true);

    expectArchiveError(() => extractHtmlArchive(bytes), "zip64_unsupported");
  });

  it("rejects a local-header name that disagrees with the central directory", () => {
    const bytes = zip({ "index.html": "hello" }).slice();
    const local = findSignature(bytes, 0x04034b50);
    bytes[local + 30] = "o".charCodeAt(0);

    expectArchiveError(() => extractHtmlArchive(bytes), "header_mismatch");
  });

  it("rejects corrupt actual output instead of returning partially checked files", () => {
    const bytes = zip({ "index.html": "hello" }).slice();
    const local = findSignature(bytes, 0x04034b50);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const nameLength = view.getUint16(local + 26, true);
    const extraLength = view.getUint16(local + 28, true);
    bytes[local + 30 + nameLength + extraLength] ^= 0xff;

    expectArchiveError(() => extractHtmlArchive(bytes), "invalid_archive");
  });

  it("bounds actual inflater output when headers advertise a smaller size", () => {
    const bytes = zip({ "index.html": "x".repeat(100_000) }).slice();
    const local = findSignature(bytes, 0x04034b50);
    const central = findSignature(bytes, 0x02014b50);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    view.setUint32(local + 22, 1, true);
    view.setUint32(central + 24, 1, true);

    expectArchiveError(
      () => extractHtmlArchive(bytes, { maxEntryBytes: 8, maxTotalBytes: 8 }),
      "invalid_archive",
    );
  });

  it("rejects overlapping local header and compressed-data regions", () => {
    const bytes = zip({ "one.html": "one", "two.html": "two" }).slice();
    const firstLocal = findSignature(bytes, 0x04034b50);
    const secondLocal = findSignature(bytes, 0x04034b50, firstLocal + 4);
    const firstCentral = findSignature(bytes, 0x02014b50);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const nameLength = view.getUint16(firstLocal + 26, true);
    const extraLength = view.getUint16(firstLocal + 28, true);
    const dataOffset = firstLocal + 30 + nameLength + extraLength;
    const overlappingCompressedBytes = secondLocal - dataOffset + 1;
    view.setUint32(firstLocal + 18, overlappingCompressedBytes, true);
    view.setUint32(firstCentral + 20, overlappingCompressedBytes, true);

    expectArchiveError(() => extractHtmlArchive(bytes), "invalid_archive");
  });
});
