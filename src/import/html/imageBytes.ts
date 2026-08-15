/**
 * Pixel facts read from an image blob, and the file name it should keep.
 *
 * The app registers images by URL and downloads them at commit time, so it can
 * afford nominal dimensions; a CLI package carries the bytes, and shipping a
 * nominal 1600x1066 for a 400px logo makes every layout that reasons about
 * aspect ratio wrong. These readers are header-only: no decoding, no
 * allocation proportional to the image, nothing executed.
 */
import { extname } from "node:path";

export function imageExtension(path: string, mediaType: string): string {
  const extension = extname(path).toLowerCase().replace(/[^.a-z0-9]/g, "");
  if (extension) return extension;
  return ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/avif": ".avif", "image/gif": ".gif" } as Record<string, string>)[mediaType] ?? ".bin";
}

export function imageDimensions(bytes: Uint8Array, mediaType: string): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const valid = (width: number, height: number) => Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0
    ? { width, height }
    : null;
  if (mediaType === "image/png" && bytes.byteLength >= 24 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)) {
    return valid(view.getUint32(16), view.getUint32(20));
  }
  const header = bytes.byteLength >= 12 ? new TextDecoder().decode(bytes.subarray(0, 12)) : "";
  if (mediaType === "image/gif" && bytes.byteLength >= 10 && (header.startsWith("GIF87a") || header.startsWith("GIF89a"))) {
    return valid(view.getUint16(6, true), view.getUint16(8, true));
  }
  if (mediaType === "image/jpeg" && bytes.byteLength >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    while (offset + 9 < bytes.byteLength) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1]!;
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
      const length = view.getUint16(offset + 2);
      if (length < 2 || offset + 2 + length > bytes.byteLength) return null;
      if (sof.has(marker)) return valid(view.getUint16(offset + 7), view.getUint16(offset + 5));
      offset += 2 + length;
    }
  }
  if (mediaType === "image/webp" && bytes.byteLength >= 30 && new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP") {
    const chunk = new TextDecoder().decode(bytes.subarray(12, 16));
    if (chunk === "VP8X") {
      const width = 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16);
      const height = 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16);
      return valid(width, height);
    }
    if (chunk === "VP8 " && bytes.byteLength >= 30) return valid(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
    if (chunk === "VP8L" && bytes.byteLength >= 25 && bytes[20] === 0x2f) {
      return valid(1 + bytes[21]! + ((bytes[22]! & 0x3f) << 8), 1 + (bytes[22]! >> 6) + (bytes[23]! << 2) + ((bytes[24]! & 0x0f) << 10));
    }
  }
  if (mediaType === "image/avif" && bytes.byteLength >= 16 && header.slice(4, 8) === "ftyp" && /(?:avif|avis)/.test(header.slice(8))) {
    for (let offset = 4; offset + 16 <= bytes.byteLength; offset += 1) {
      if (bytes[offset] === 0x69 && bytes[offset + 1] === 0x73 && bytes[offset + 2] === 0x70 && bytes[offset + 3] === 0x65) {
        return valid(view.getUint32(offset + 8), view.getUint32(offset + 12));
      }
    }
  }
  return null;
}
