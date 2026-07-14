import type { WxrDocument, WxrItem } from "./model";
import { assetRecord } from "../html/assets";
import type { HtmlIngestionResult } from "../html/input";
import { safeFetch, type SafeFetchOptions, type SafeFetchResult } from "../net/safeFetch";

export type WxrMediaIndex = {
  attachments: Map<string, WxrItem>;
  missingFeaturedMedia: Array<{ itemSourceId: string; mediaSourceId: string }>;
};

export function indexWxrMedia(document: WxrDocument): WxrMediaIndex {
  const attachments = new Map(
    document.items
      .filter((item) => item.type === "attachment")
      .map((item) => [item.sourceId, item]),
  );
  const missingFeaturedMedia = document.items.flatMap((item) => {
    const mediaSourceId = item.featuredMediaSourceId;
    return mediaSourceId && !attachments.has(mediaSourceId)
      ? [{ itemSourceId: item.sourceId, mediaSourceId }]
      : [];
  });
  return { attachments, missingFeaturedMedia };
}

export type WxrMediaFetchOptions = {
  maxAssets?: number;
  maxSingleBytes?: number;
  maxTotalBytes?: number;
  timeoutMs?: number;
  fetcher?: (input: string, options: SafeFetchOptions) => Promise<SafeFetchResult>;
};

/** Fetch WXR attachment URLs through the same SSRF-safe transport as HTML. */
export async function collectWxrMedia(
  document: WxrDocument,
  html: HtmlIngestionResult,
  options: WxrMediaFetchOptions = {},
): Promise<HtmlIngestionResult> {
  const maxAssets = options.maxAssets ?? 200;
  const maxSingleBytes = options.maxSingleBytes ?? 15 * 1024 * 1024;
  const maxTotalBytes = options.maxTotalBytes ?? 100 * 1024 * 1024;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const fetcher = options.fetcher ?? safeFetch;
  const existing = new Set(html.assets.flatMap((asset) => [asset.source, asset.path]));
  const availableSlots = Math.max(0, maxAssets - html.assets.length);
  const candidates = document.items
    .filter((item) => item.type === "attachment" && item.attachmentUrl && !existing.has(item.attachmentUrl))
    .slice(0, availableSlots);
  const assets = [...html.assets];
  const warnings = [...html.warnings];
  let totalBytes = html.totalBytes;

  for (let offset = 0; offset < candidates.length; offset += 4) {
    const batch = candidates.slice(offset, offset + 4);
    const settled = await Promise.allSettled(batch.map(async (item) => {
      const url = item.attachmentUrl!;
      const remaining = maxTotalBytes - totalBytes;
      if (remaining <= 0) throw new Error(`WordPress media total byte cap exceeded (${maxTotalBytes})`);
      const result = await fetcher(url, {
        maxBytes: Math.min(maxSingleBytes, remaining),
        maxRedirects: 5,
        timeoutMs,
      });
      if (result.status < 200 || result.status >= 300) throw new Error(`HTTP ${result.status} for ${url}`);
      return assetRecord(new URL(result.finalUrl).pathname.replace(/^\//, "") || `attachment-${item.sourceId}`, url, result.body, result.headers["content-type"]);
    }));
    settled.forEach((result, index) => {
      const item = batch[index]!;
      if (result.status === "rejected") {
        warnings.push(`WordPress attachment ${item.sourceId} was not imported: ${(result.reason as Error).message}`);
        return;
      }
      if (totalBytes + result.value.bytes.byteLength > maxTotalBytes) {
        warnings.push(`WordPress attachment ${item.sourceId} exceeded the remaining total byte budget`);
        return;
      }
      totalBytes += result.value.bytes.byteLength;
      assets.push(result.value);
    });
  }
  if (document.items.filter((item) => item.type === "attachment" && item.attachmentUrl && !existing.has(item.attachmentUrl)).length > availableSlots) {
    warnings.push(`WordPress attachment inventory exceeded the ${maxAssets} asset cap`);
  }
  return { ...html, assets, warnings, totalBytes };
}
