import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type LocalFileLimits = {
  maxFiles: number;
  maxSingleBytes: number;
  maxTotalBytes: number;
};

export type LocalFilesResult = {
  files: Record<string, Uint8Array>;
  totalBytes: number;
};

/** Read one flat package-blob directory only after every entry passes size and symlink checks. */
export function readBoundedLocalFiles(
  dir: string,
  limits: LocalFileLimits,
): LocalFilesResult {
  if (!existsSync(dir)) return { files: {}, totalBytes: 0 };
  if (lstatSync(dir).isSymbolicLink()) {
    throw new Error(`${dir} must be a real directory, not a symbolic link`);
  }

  const entries = readdirSync(dir, { withFileTypes: true });
  if (entries.length > limits.maxFiles) {
    throw new Error(`${dir} has ${entries.length} entries, over the ${limits.maxFiles} file cap`);
  }

  const planned: Array<{ name: string; path: string; bytes: number }> = [];
  let totalBytes = 0;
  for (const entry of entries) {
    const path = join(dir, entry.name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`${path} must not be a symbolic link`);
    if (!stat.isFile()) throw new Error(`${path} must be a regular file`);
    if (stat.size > limits.maxSingleBytes) {
      throw new Error(`${path} is ${stat.size} bytes, over the ${limits.maxSingleBytes} byte cap`);
    }
    totalBytes += stat.size;
    if (totalBytes > limits.maxTotalBytes) {
      throw new Error(`${dir} exceeds the ${limits.maxTotalBytes} total byte cap`);
    }
    planned.push({ name: entry.name, path, bytes: stat.size });
  }

  const files: Record<string, Uint8Array> = {};
  let actualTotal = 0;
  for (const item of planned) {
    const bytes = new Uint8Array(readFileSync(item.path));
    if (bytes.byteLength !== item.bytes || bytes.byteLength > limits.maxSingleBytes) {
      throw new Error(`${item.path} changed while it was being read`);
    }
    actualTotal += bytes.byteLength;
    if (actualTotal > limits.maxTotalBytes) {
      throw new Error(`${dir} exceeds the ${limits.maxTotalBytes} total byte cap`);
    }
    files[item.name] = bytes;
  }
  return { files, totalBytes: actualTotal };
}
