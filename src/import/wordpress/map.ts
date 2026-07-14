import { createHash } from "node:crypto";
import { generateKeyBetween } from "fractional-indexing";
import type { PortableSiteV1 } from "../../convex/model/portable";
import { SECTION_REGISTRY } from "../../lib/sections/registry";
import { validateSitePackage, type SiteKitReport } from "../../lib/site-kit/validate";
import type { EvidenceItemV1 } from "../evidence";
import { mapHtmlIngestion, type HtmlMappedAssetFile } from "../html/map";
import type { HtmlIngestionResult } from "../html/input";
import { IMPORT_DISPOSITIONS, IMPORT_REPORT_FORMAT, IMPORT_REPORT_FORMAT_VERSION, IMPORT_REPORT_REVISION, PORTABLE_SITE_FORMAT_VERSION, type ImportDisposition, type ImportReportItemV1, type ImportReportV1, validateImportReport } from "../report";
import type { WxrDocument, WxrItem } from "./model";
import { reconcileWxrWithHtml, type WordpressConflict } from "./reconcile";

export type WordpressMappingOptions = {
  wxrLocator: string;
  startedAt?: string;
  completedAt?: string;
  cliVersion?: string;
};

export type WordpressMappingResult = {
  site: PortableSiteV1;
  report: ImportReportV1;
  evidence: EvidenceItemV1[];
  validation: SiteKitReport;
  assetFiles: HtmlMappedAssetFile[];
  conflicts: WordpressConflict[];
};

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function clean(value: string, max: number): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\[[^\]]*]/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim().slice(0, max);
}

function slug(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page";
}

function sourcePath(item: WxrItem): string | null {
  if (!item.link) return null;
  try { return decodeURIComponent(new URL(item.link).pathname).replace(/^\/+|\/+$/g, ""); }
  catch { return null; }
}

function targetPath(item: WxrItem, pageSlug: string): string {
  return item.type === "post" ? `news/${pageSlug}` : pageSlug;
}

function summary(items: ImportReportItemV1[]) {
  const byDisposition = Object.fromEntries(IMPORT_DISPOSITIONS.map((kind) => [kind, 0])) as Record<ImportDisposition, number>;
  for (const item of items) byDisposition[item.disposition] += 1;
  return { total: items.length, blocking: items.filter((item) => item.blocking).length, byDisposition };
}

function publishedAt(item: WxrItem): number | undefined {
  if (item.status !== "publish" || !item.publishedAt) return undefined;
  const normalized = item.publishedAt.includes("T") ? item.publishedAt : `${item.publishedAt.replace(" ", "T")}Z`;
  const value = Date.parse(normalized);
  return Number.isFinite(value) ? value : undefined;
}

export function mapWordpressImport(wxr: WxrDocument, html: HtmlIngestionResult, options: WordpressMappingOptions): WordpressMappingResult {
  const completedAt = options.completedAt ?? new Date().toISOString();
  const startedAt = options.startedAt ?? completedAt;
  const htmlMapped = mapHtmlIngestion(html, { startedAt, completedAt, cliVersion: options.cliVersion });
  const conflicts = reconcileWxrWithHtml(wxr, html);
  const sourceInputs = [
    { id: "url-source", kind: "url" as const, locator: html.source.value.slice(0, 1_000) },
    { id: "wxr-source", kind: "file" as const, locator: options.wxrLocator.slice(0, 1_000) },
  ];
  const wxrItems = wxr.items.filter((item) => item.type === "page" || item.type === "post");
  const evidence: EvidenceItemV1[] = wxrItems.map((item, index) => ({
    id: `wxr-item-${String(index + 1).padStart(3, "0")}`,
    kind: "wxr_item",
    sourceInputId: "wxr-source",
    locator: `item[wp:post_id='${item.sourceId}']`,
    contentHash: sha256(JSON.stringify(item)),
    excerpt: clean(`${item.type} ${item.status} ${item.title} ${item.content}`, 500) || `${item.type} ${item.sourceId}`,
  }));
  const publicEvidence: EvidenceItemV1[] = html.pages.map((page, index) => ({
    id: `public-page-${String(index + 1).padStart(3, "0")}`,
    kind: "url",
    sourceInputId: "url-source",
    locator: page.url.slice(0, 1_000),
    contentHash: sha256(page.text || page.title || page.url),
    excerpt: clean(page.text || page.title || page.url, 500),
  }));
  evidence.push(...publicEvidence);
  const evidenceFor = (item: WxrItem) => evidence[wxrItems.indexOf(item)]!.id;
  const items: ImportReportItemV1[] = [];

  const usedSlugs = new Set<string>();
  let homeAssigned = false;
  const pages: PortableSiteV1["pages"] = wxrItems.map((item, index) => {
    const isHome = item.type === "page" && sourcePath(item) === "" && !homeAssigned;
    if (isHome) homeAssigned = true;
    const base = isHome ? "" : slug(item.slug || item.title || item.sourceId);
    let pageSlug = base;
    let suffix = 2;
    while (usedSlugs.has(pageSlug)) pageSlug = `${base}-${suffix++}`;
    usedSlugs.add(pageSlug);
    const author = wxr.authors.find((candidate) => candidate.login === item.creator)?.displayName ?? item.creator;
    const media = item.featuredMediaSourceId
      ? wxr.items.find((candidate) => candidate.type === "attachment" && candidate.sourceId === item.featuredMediaSourceId)
      : undefined;
    const portableAsset = media?.attachmentUrl
      ? htmlMapped.site.assets.find((asset) => asset.url === media.attachmentUrl)
      : undefined;
    const isDraft = item.status !== "publish";
    items.push({
      id: `content-${item.sourceId}`,
      disposition: "converted",
      reason: `Mapped authoritative WXR ${item.type} content to a native ${item.type === "post" ? "blog post" : "page"}${isDraft ? " held from publishing" : ""}`,
      evidenceIds: [evidenceFor(item)],
      target: { kind: "page", id: `wxr-${item.sourceId}` },
      blocking: false,
    });
    if (item.terms.length > 0) {
      items.push({ id: `taxonomy-${item.sourceId}`, disposition: "manual", reason: `Preserved ${item.terms.length} WordPress taxonomy relationship(s) in evidence; SnabbSajt v1 has no category/tag fields`, evidenceIds: [evidenceFor(item)], blocking: false });
    }
    if (item.featuredMediaSourceId && !portableAsset) {
      items.push({ id: `media-${item.sourceId}`, disposition: "missing", reason: `Featured media ${item.featuredMediaSourceId} was not available as a verified blob from the public crawl`, evidenceIds: [evidenceFor(item)], blocking: false });
    }
    if (item.status === "publish" && !publishedAt(item)) {
      items.push({ id: `date-${item.sourceId}`, disposition: "manual", reason: "Published WXR item has no valid publication date; SnabbSajt will set it on first publish", evidenceIds: [evidenceFor(item)], blocking: false });
    }
    return {
      tmpId: `wxr-${item.sourceId}`,
      slug: pageSlug,
      title: clean(item.title, 120),
      order: index * 10,
      showInNav: item.type === "page" && item.status === "publish",
      pageType: item.type as "page" | "post",
      ...(item.type === "post" ? { collectionTmpId: "wordpress-blog", excerpt: clean(item.excerpt || item.content, 300), ...(author ? { author } : {}) } : {}),
      ...(portableAsset ? { featuredImage: { assetId: portableAsset.exportId, alt: clean(media?.title || item.title, 200) } } : {}),
      ...(publishedAt(item) ? { firstPublishedAt: publishedAt(item) } : {}),
      ...(isDraft ? { excludeFromPublish: true } : {}),
      seo: {
        ...(item.seo?.title ? { metaTitle: clean(item.seo.title, 160) } : {}),
        ...(item.seo?.description ? { metaDescription: clean(item.seo.description, 320) } : {}),
        ...(item.seo?.canonical ? { canonical: item.seo.canonical } : {}),
        ...(item.link ? { sourceUrl: item.link } : {}),
        ...(isDraft ? { noindex: true } : {}),
      },
    };
  });

  if (!homeAssigned && pages.length > 0) pages[0]!.slug = "";
  const pageBySource = new Map(wxrItems.map((item, index) => [item.sourceId, pages[index]!]));
  const sections: PortableSiteV1["sections"] = [];
  const lastOrder = new Map<string, string | null>();
  const assetByAttachmentId = new Map(wxr.items.flatMap((item) => {
    if (item.type !== "attachment" || !item.attachmentUrl) return [];
    const asset = htmlMapped.site.assets.find((candidate) => candidate.url === item.attachmentUrl);
    return asset ? [[item.sourceId, asset.exportId] as const] : [];
  }));
  const addSection = (pageTmpId: string, type: "hero" | "rich-text" | "gallery" | "footer", content: unknown) => {
    const order = generateKeyBetween(lastOrder.get(pageTmpId) ?? null, null);
    lastOrder.set(pageTmpId, order);
    sections.push({ pageTmpId, type, variant: SECTION_REGISTRY[type].defaultVariant, order, content });
  };
  for (const item of wxrItems) {
    const page = pageBySource.get(item.sourceId)!;
    addSection(page.tmpId, "hero", { type: "hero", headline: clean(item.title, 160), ...(clean(item.excerpt || "", 240) ? { subheadline: clean(item.excerpt || "", 240) } : {}) });
    const text = clean(item.content, 4_000);
    if (text) addSection(page.tmpId, "rich-text", { type: "rich-text", blocks: [{ kind: "p", text }] });
    const galleryIds = item.content.match(/\[(?:gallery|synthetic_gallery)\b[^\]]*\bids=["']([^"']+)["'][^\]]*]/i)?.[1]
      ?.split(",")
      .map((id) => id.trim())
      .filter(Boolean) ?? [];
    const galleryAssets = galleryIds.map((id) => assetByAttachmentId.get(id)).filter((id): id is string => Boolean(id));
    if (galleryIds.length > 0 && galleryAssets.length === galleryIds.length && galleryAssets.length >= 3) {
      addSection(page.tmpId, "gallery", { type: "gallery", images: galleryAssets.map((assetId) => ({ assetId, alt: clean(item.title, 200) })) });
      items.push({ id: `gallery-${item.sourceId}`, disposition: "converted", reason: "Converted verified WordPress gallery attachment relationships to a native gallery", evidenceIds: [evidenceFor(item)], target: { kind: "section", id: `${page.tmpId}:gallery` }, blocking: false });
    }
    if (page.slug === "") addSection(page.tmpId, "footer", { type: "footer", businessName: clean(wxr.title, 120) });
    const shortcodeMatches = item.content.match(/\[[a-z0-9_-]+[^\]]*]/gi) ?? [];
    const unresolvedShortcodes = shortcodeMatches.filter((shortcode) => !/^\[(?:gallery|synthetic_gallery)\b/i.test(shortcode) || galleryAssets.length !== galleryIds.length || galleryAssets.length < 3);
    if (unresolvedShortcodes.length > 0) {
      items.push({ id: `plugin-${item.sourceId}`, disposition: "manual", reason: `${unresolvedShortcodes.length} plugin shortcode(s) remain inert; create a native booking, form, or gallery only after required facts are verified`, evidenceIds: [evidenceFor(item)], blocking: false });
    }
  }

  const redirects: NonNullable<PortableSiteV1["redirects"]> = [];
  const redirectKeys = new Set<string>();
  const addRedirect = (fromPath: string, toPath: string, item: WxrItem) => {
    const normalizedFrom = fromPath.replace(/^\/+|\/+$/g, "").toLowerCase();
    if (!normalizedFrom || normalizedFrom === toPath || redirectKeys.has(normalizedFrom)) return;
    redirectKeys.add(normalizedFrom);
    redirects.push({ fromPath: normalizedFrom, toPath });
    items.push({ id: `redirect-${item.sourceId}-${redirects.length}`, disposition: "redirect", reason: `Mapped old WordPress path /${normalizedFrom} to /${toPath}`, evidenceIds: [evidenceFor(item)], target: { kind: "redirect", id: normalizedFrom }, blocking: false });
  };
  for (const item of wxrItems) {
    const page = pageBySource.get(item.sourceId)!;
    const target = targetPath(item, page.slug);
    if (item.status !== "publish") {
      if (item.metadata._wp_old_slug) items.push({ id: `draft-redirect-${item.sourceId}`, disposition: "manual", reason: "Old slug belongs to a held draft and cannot redirect to a public target yet", evidenceIds: [evidenceFor(item)], blocking: false });
      continue;
    }
    const oldPath = sourcePath(item);
    if (oldPath) addRedirect(oldPath, target, item);
    if (item.metadata._wp_old_slug) addRedirect(item.metadata._wp_old_slug, target, item);
  }

  conflicts.forEach((conflict, index) => {
    const source = conflict.sourceId ? wxrItems.find((item) => item.sourceId === conflict.sourceId) : undefined;
    const publicIndex = conflict.url ? html.pages.findIndex((page) => page.url === conflict.url) : -1;
    items.push({
      id: `conflict-${String(index + 1).padStart(3, "0")}`,
      disposition: "manual",
      reason: `${conflict.code}: ${conflict.detail}`,
      evidenceIds: source ? [evidenceFor(source)] : publicIndex >= 0 ? [publicEvidence[publicIndex]!.id] : [evidence[0]!.id],
      blocking: conflict.code === "duplicate_slug",
    });
  });

  const status = items.some((item) => item.blocking) ? "blocked" : items.some((item) => ["manual", "missing", "unsafe", "ai_proposed"].includes(item.disposition)) ? "review_required" : "ready";
  const report: ImportReportV1 = {
    format: IMPORT_REPORT_FORMAT,
    revision: IMPORT_REPORT_REVISION,
    status,
    adapter: { id: "wordpress", version: "1" },
    sourceInputs,
    detectedPlatform: { id: "wordpress", version: `wxr-${wxr.version}`, confidence: 1 },
    timestamps: { startedAt, completedAt },
    requiredVersions: { reportFormat: IMPORT_REPORT_FORMAT_VERSION, portableSiteFormat: PORTABLE_SITE_FORMAT_VERSION, cli: options.cliVersion ?? "0.1.0" },
    evidence,
    items,
    summary: summary(items),
  };
  const site: PortableSiteV1 = {
    format: "sajt-site",
    version: 1,
    exportedAt: completedAt,
    site: { ...htmlMapped.site.site, businessName: clean(wxr.title, 120) },
    contentCollections: wxrItems.some((item) => item.type === "post") ? [{ tmpId: "wordpress-blog", kind: "blog", name: "Blog", slugPrefix: "news", order: 0 }] : undefined,
    folders: [],
    pages,
    redirects,
    sections,
    fonts: [],
    assets: htmlMapped.site.assets,
  };
  const validation = validateSitePackage(site, { assetFileNames: new Set(htmlMapped.assetFiles.map((asset) => asset.fileName)), fontFileNames: new Set() });
  const reportValidation = validateImportReport(report);
  if (!reportValidation.ok) throw new Error(`generated an invalid WordPress report: ${reportValidation.issues[0]?.path} ${reportValidation.issues[0]?.message}`);
  return { site, report, evidence, validation, assetFiles: htmlMapped.assetFiles, conflicts };
}
