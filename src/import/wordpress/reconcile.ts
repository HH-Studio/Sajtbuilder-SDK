import type { HtmlIngestionResult } from "../html/input";
import type { WxrDocument, WxrItem } from "./model";

export type WordpressConflict = {
  code: "public_only" | "wxr_only" | "title_mismatch" | "content_mismatch" | "duplicate_slug" | "missing_attachment";
  sourceId?: string;
  url?: string;
  detail: string;
};

function normalizedPath(value: string): string | null {
  try {
    const path = new URL(value).pathname.replace(/\/+$/, "") || "/";
    return decodeURIComponent(path).toLowerCase();
  } catch {
    return null;
  }
}

function normalizedText(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\[[^\]]*]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

export function reconcileWxrWithHtml(wxr: WxrDocument, html: HtmlIngestionResult): WordpressConflict[] {
  const conflicts: WordpressConflict[] = [];
  const importable = wxr.items.filter((item) => item.type === "page" || item.type === "post");
  const byPath = new Map(importable.flatMap((item) => {
    const path = item.link ? normalizedPath(item.link) : null;
    return path ? [[path, item] as const] : [];
  }));
  const publicByPath = new Map(html.pages.flatMap((page) => {
    const path = normalizedPath(page.url);
    return path ? [[path, page] as const] : [];
  }));

  for (const [path, page] of publicByPath) {
    const item = byPath.get(path);
    if (!item) {
      conflicts.push({ code: "public_only", url: page.url, detail: "Public URL is absent from WXR and requires an explicit disposition" });
      continue;
    }
    if (page.title.trim() && item.title.trim() && page.title.trim().toLowerCase() !== item.title.trim().toLowerCase()) {
      conflicts.push({ code: "title_mismatch", sourceId: item.sourceId, url: page.url, detail: `WXR title "${item.title}" differs from public title "${page.title}"` });
    }
    const wxrText = normalizedText(item.content);
    const publicText = normalizedText(page.text);
    if (wxrText.length >= 20 && publicText.length >= 20 && !publicText.includes(wxrText.slice(0, 200))) {
      conflicts.push({ code: "content_mismatch", sourceId: item.sourceId, url: page.url, detail: "WXR content differs from the currently rendered public page" });
    }
  }
  for (const item of importable) {
    const path = item.link ? normalizedPath(item.link) : null;
    if (item.status === "publish" && path && !publicByPath.has(path)) {
      conflicts.push({ code: "wxr_only", sourceId: item.sourceId, url: item.link, detail: "Published WXR item was not found in the bounded public crawl" });
    }
  }

  const slugOwner = new Map<string, WxrItem>();
  for (const item of importable) {
    const normalized = item.slug.trim().toLowerCase();
    const existing = slugOwner.get(normalized);
    if (existing) conflicts.push({ code: "duplicate_slug", sourceId: item.sourceId, detail: `Slug "${item.slug}" is also used by source item ${existing.sourceId}` });
    else slugOwner.set(normalized, item);
  }

  const attachmentIds = new Set(wxr.items.filter((item) => item.type === "attachment").map((item) => item.sourceId));
  for (const item of importable) {
    if (item.featuredMediaSourceId && !attachmentIds.has(item.featuredMediaSourceId)) {
      conflicts.push({ code: "missing_attachment", sourceId: item.sourceId, detail: `Featured attachment ${item.featuredMediaSourceId} is missing from WXR` });
    }
  }
  return conflicts;
}
