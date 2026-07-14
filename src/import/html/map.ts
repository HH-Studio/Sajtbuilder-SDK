import { createHash } from "node:crypto";
import { extname } from "node:path";
import { generateKeyBetween } from "fractional-indexing";
import type { PortableSiteV1 } from "../../convex/model/portable";
import type { ThemeTokens } from "../../convex/model/theme";
import { DEFAULT_THEME } from "../../convex/model/theme";
import { SECTION_REGISTRY } from "../../lib/sections/registry";
import { validateSitePackage, type SiteKitReport } from "../../lib/site-kit/validate";
import type { EvidenceItemV1 } from "../evidence";
import {
  IMPORT_DISPOSITIONS,
  IMPORT_REPORT_FORMAT,
  IMPORT_REPORT_FORMAT_VERSION,
  IMPORT_REPORT_REVISION,
  PORTABLE_SITE_FORMAT_VERSION,
  type ImportDisposition,
  type ImportReportItemV1,
  type ImportReportV1,
  validateImportReport,
} from "../report";
import { detectHtmlBehavior, type BehaviorSignal } from "./behavior";
import type { HtmlDocumentInventory } from "./dom";
import type { HtmlIngestionResult } from "./input";

export type HtmlMappedAssetFile = { fileName: string; bytes: Uint8Array };
export type HtmlMappingResult = {
  site: PortableSiteV1;
  report: ImportReportV1;
  evidence: EvidenceItemV1[];
  validation: SiteKitReport;
  assetFiles: HtmlMappedAssetFile[];
};

export type HtmlMappingOptions = {
  startedAt?: string;
  completedAt?: string;
  cliVersion?: string;
};

function sha256(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function stableId(prefix: string, index: number): string {
  return `${prefix}-${String(index + 1).padStart(3, "0")}`;
}

function cleanText(value: string, max = 1_000): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function localeFrom(pages: HtmlDocumentInventory[]): "sv" | "en" {
  const text = pages.map((page) => page.text).join(" ").toLowerCase();
  const swedish = (text.match(/\b(?:och|att|för|med|vår|våra|oss|kontakt|tjänster)\b/g) ?? []).length;
  return swedish >= 3 || /[åäö]/.test(text) ? "sv" : "en";
}

function slugFor(page: HtmlDocumentInventory, index: number): string {
  if (index === 0) return "";
  let path = page.url;
  try { path = new URL(page.url).pathname; } catch { /* local path */ }
  const last = path.split(/[\\/]/).filter(Boolean).pop()?.replace(/\.(?:html?|php)$/i, "") ?? `page-${index + 1}`;
  const slug = last.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || `page-${index + 1}`;
}

function uniqueSlugs(pages: HtmlDocumentInventory[]): string[] {
  const used = new Set<string>();
  return pages.map((page, index) => {
    const base = slugFor(page, index);
    let slug = base;
    let suffix = 2;
    while (used.has(slug)) slug = `${base}-${suffix++}`;
    used.add(slug);
    return slug;
  });
}

function themeFrom(input: HtmlIngestionResult): ThemeTokens {
  const colors = input.css.flatMap((css) => css.colors).join(" ").toLowerCase();
  const fonts = input.css.flatMap((css) => css.fontFamilies).join(" ").toLowerCase();
  const spacing = input.css.flatMap((css) => css.spacing).join(" ").toLowerCase();
  const palette = /(?:navy|#0[0-9a-f]{5}|#1[0-9a-f]{5})/.test(colors)
    ? "midnight"
    : /(?:blue|cyan|rgb\([^)]*\b(?:1[2-9]\d|2\d\d)\b)/.test(colors)
      ? "ocean"
      : /(?:green|lime|forest)/.test(colors)
        ? "forest"
        : /(?:pink|rose|magenta)/.test(colors)
          ? "rose"
          : /(?:black|white|#000|#fff)/.test(colors) && !/(?:red|blue|green|pink|orange|purple)/.test(colors)
            ? "mono"
            : DEFAULT_THEME.palette;
  return {
    ...DEFAULT_THEME,
    palette,
    fontPair: /serif/.test(fonts) ? "classic" : DEFAULT_THEME.fontPair,
    density: /(?:3rem|4rem|5rem|6rem)/.test(spacing) ? "spacious" : DEFAULT_THEME.density,
  };
}

function defaultVariant(type: keyof typeof SECTION_REGISTRY): string {
  return SECTION_REGISTRY[type].defaultVariant;
}

function externalContact(pages: HtmlDocumentInventory[]): {
  contact: { phone?: string; email?: string };
  phoneConflict: boolean;
  emailConflict: boolean;
  invalidContact: boolean;
} {
  const phones = new Set<string>();
  const emails = new Set<string>();
  let invalidContact = false;
  const safeDecode = (value: string): string | null => {
    try { return decodeURIComponent(value).trim(); } catch { invalidContact = true; return null; }
  };
  for (const link of pages.flatMap((page) => page.links)) {
    if (link.startsWith("tel:")) {
      const value = safeDecode(link.slice(4));
      if (value && /^[+()\d][+\d().\s-]{2,40}$/.test(value) && (value.match(/\d/g) ?? []).length >= 5) phones.add(value);
      else invalidContact = true;
    }
    if (link.startsWith("mailto:")) {
      const value = safeDecode(link.slice(7).split("?", 1)[0]!);
      if (value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) emails.add(value);
      else invalidContact = true;
    }
  }
  const phone = phones.size === 1 ? [...phones][0] : undefined;
  const email = emails.size === 1 ? [...emails][0] : undefined;
  return {
    contact: { ...(phone ? { phone } : {}), ...(email ? { email } : {}) },
    phoneConflict: phones.size > 1,
    emailConflict: emails.size > 1,
    invalidContact,
  };
}

function evidenceForSignal(signal: BehaviorSignal, sourceInputId: string, index: number): EvidenceItemV1 {
  const excerpt = signal.excerpt || `${signal.kind} evidence`;
  return {
    id: stableId("behavior", index),
    kind: signal.kind === "analytics" || signal.kind === "animation" || signal.kind === "script" ? "script" : "html_node",
    sourceInputId,
    locator: signal.locator.slice(0, 1_000),
    contentHash: sha256(excerpt),
    excerpt: excerpt.slice(0, 500),
  };
}

function reportSummary(items: ImportReportItemV1[]) {
  const byDisposition = Object.fromEntries(IMPORT_DISPOSITIONS.map((kind) => [kind, 0])) as Record<ImportDisposition, number>;
  for (const item of items) byDisposition[item.disposition] += 1;
  return { total: items.length, blocking: items.filter((item) => item.blocking).length, byDisposition };
}

function imageExtension(path: string, mediaType: string): string {
  const extension = extname(path).toLowerCase().replace(/[^.a-z0-9]/g, "");
  if (extension) return extension;
  return ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/avif": ".avif", "image/gif": ".gif" } as Record<string, string>)[mediaType] ?? ".bin";
}

function imageDimensions(bytes: Uint8Array, mediaType: string): { width: number; height: number } | null {
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

export function mapHtmlIngestion(input: HtmlIngestionResult, options: HtmlMappingOptions = {}): HtmlMappingResult {
  const sourceInputId = "source-001";
  const behavior = detectHtmlBehavior(input);
  const pageEvidence = input.pages.map((page, index): EvidenceItemV1 => ({
    id: stableId("page", index),
    kind: "html_node",
    sourceInputId,
    locator: page.url.slice(0, 1_000),
    contentHash: sha256(page.text || page.title || page.url),
    excerpt: cleanText(page.text || page.title || page.url, 500),
  }));
  const behaviorEvidence = behavior.signals.map((entry, index) => evidenceForSignal(entry, sourceInputId, index));
  const assetEvidence = input.assets.map((asset, index): EvidenceItemV1 => ({
    id: stableId("asset", index), kind: "asset", sourceInputId,
    locator: asset.source.slice(0, 1_000), contentHash: `sha256:${asset.sha256}`,
    excerpt: cleanText(`${asset.kind} ${asset.path} (${asset.mediaType}, ${asset.bytes.byteLength} bytes)`, 500),
  }));
  const cssEvidence = input.css.map((css, index): EvidenceItemV1 => {
    const excerpt = cleanText(`colors=${css.colors.join(",")}; fonts=${css.fontFamilies.join(",")}; spacing=${css.spacing.join(",")}; layout=${css.layout.join(",")}`, 500) || "Parsed CSS design evidence";
    return { id: stableId("css", index), kind: "css_rule", sourceInputId, locator: css.source.slice(0, 1_000), contentHash: sha256(excerpt), excerpt };
  });
  const evidence = [...pageEvidence, ...behaviorEvidence, ...assetEvidence, ...cssEvidence];
  const evidenceIdForSignal = (target: BehaviorSignal) => behaviorEvidence[behavior.signals.indexOf(target)]!.id;
  const locale = localeFrom(input.pages);
  const firstPage = input.pages[0];
  const businessName = cleanText(firstPage?.title || firstPage?.headings.find((heading) => heading.level === 1)?.text || (locale === "sv" ? "Importerad webbplats" : "Imported website"), 120);
  const slugs = uniqueSlugs(input.pages);
  const navTargets = new Set(input.pages.flatMap((page) => page.navigation.map((entry) => entry.href)));

  const imageInputs = input.assets
    .filter((asset) => asset.kind === "image" && asset.mediaType !== "image/svg+xml")
    .map((asset) => ({ asset, dimensions: imageDimensions(asset.bytes, asset.mediaType) }))
    .filter((entry): entry is { asset: typeof input.assets[number]; dimensions: { width: number; height: number } } => entry.dimensions !== null)
    .slice(0, 100);
  const assetByReference = new Map<string, string>();
  const assetFiles: HtmlMappedAssetFile[] = [];
  const assets: PortableSiteV1["assets"] = imageInputs.map(({ asset, dimensions }, index) => {
    const exportId = `image-${index + 1}`;
    const fileName = `${exportId}${imageExtension(asset.path, asset.mediaType)}`;
    assetFiles.push({ fileName, bytes: asset.bytes });
    assetByReference.set(asset.path, exportId);
    assetByReference.set(asset.source, exportId);
    return { exportId, url: asset.source, ...dimensions, mimeType: asset.mediaType, kind: "image", alt: businessName };
  });

  const pages: PortableSiteV1["pages"] = input.pages.map((page, index) => ({
    tmpId: `page-${index + 1}`,
    slug: slugs[index]!,
    title: cleanText(page.title || page.headings[0]?.text || (index === 0 ? businessName : `Page ${index + 1}`), 120),
    order: index * 10,
    showInNav: index === 0 || navTargets.has(page.url),
    seo: { sourceUrl: /^https?:\/\//.test(page.url) ? page.url : undefined },
  }));

  const sections: PortableSiteV1["sections"] = [];
  const items: ImportReportItemV1[] = [];
  let lastSectionOrder: string | null = null;
  const addSection = (pageIndex: number, type: keyof typeof SECTION_REGISTRY, content: unknown, evidenceIds: string[], anchorId?: string) => {
    const sectionIndex = sections.length;
    const order = generateKeyBetween(lastSectionOrder, null);
    lastSectionOrder = order;
    sections.push({
      pageTmpId: pages[pageIndex]!.tmpId,
      type,
      variant: defaultVariant(type),
      order,
      ...(anchorId ? { anchorId } : {}),
      content,
    });
    items.push({ id: stableId("section", sectionIndex), disposition: "converted", reason: `Mapped inert HTML evidence to native ${type} content`, evidenceIds, target: { kind: "section", id: `${pages[pageIndex]!.tmpId}:${type}` }, blocking: false });
  };

  input.pages.forEach((page, pageIndex) => {
    const pageEvidenceId = pageEvidence[pageIndex]!.id;
    const h1 = cleanText(page.headings.find((heading) => heading.level === 1)?.text || page.title || businessName, 160);
    const paragraphs = page.contentBlocks.filter((block) => block.kind === "paragraph").map((block) => cleanText(block.text, 1_200));
    const pageAssetIds = page.media.map((reference) => assetByReference.get(reference)).filter((id): id is string => Boolean(id));
    addSection(pageIndex, "hero", {
      type: "hero", headline: h1,
      ...(paragraphs[0] ? { subheadline: paragraphs[0].slice(0, 240) } : {}),
      ...(pageAssetIds[0] ? { media: { assetId: pageAssetIds[0], alt: h1 } } : {}),
    }, [pageEvidenceId]);

    const flow = page.contentBlocks.filter((block) => !(block.kind === "heading" && block.level === 1));
    const heroParagraphIndex = flow.findIndex((block) => block.kind === "paragraph" && cleanText(block.text, 1_200) === paragraphs[0]);
    if (heroParagraphIndex >= 0 && paragraphs[0]!.length <= 240) flow.splice(heroParagraphIndex, 1);
    const richBlocks: Array<{ kind: "h" | "p"; text: string } | { kind: "ul"; items: string[] }> = [];
    for (const block of flow.slice(0, 80)) {
      if (block.kind === "heading") richBlocks.push({ kind: "h", text: cleanText(block.text, 240) });
      else if (block.kind === "paragraph") richBlocks.push({ kind: "p", text: cleanText(block.text, 1_200) });
      else {
        const previous = richBlocks.at(-1);
        if (previous?.kind === "ul" && previous.items.length < 50) previous.items.push(cleanText(block.text, 300));
        else richBlocks.push({ kind: "ul", items: [cleanText(block.text, 300)] });
      }
    }
    if (richBlocks.length > 0) {
      addSection(pageIndex, "rich-text", {
        type: "rich-text",
        blocks: richBlocks,
      }, [pageEvidenceId]);
    }
    if (flow.length > 80) {
      items.push({
        id: stableId("content-truncated", pageIndex), disposition: "missing",
        reason: `${flow.length - 80} content blocks exceeded the safe per-page conversion cap and require manual review`,
        evidenceIds: [pageEvidenceId], blocking: true,
      });
    }
    const oversizedContent = page.contentBlocks.filter((block) => {
      const length = block.text.replace(/\s+/g, " ").trim().length;
      return block.kind === "heading" ? length > (block.level === 1 ? 160 : 240) : length > (block.kind === "paragraph" ? 1_200 : 300);
    });
    if (oversizedContent.length > 0) {
      items.push({
        id: stableId("content-value-truncated", pageIndex), disposition: "missing",
        reason: `${oversizedContent.length} text block(s) exceeded native field limits; bounded copy was preserved but the import requires manual reconstruction`,
        evidenceIds: [pageEvidenceId], blocking: true,
      });
    }
    const missingMedia = page.media.filter((reference) => !assetByReference.has(reference));
    if (missingMedia.length > 0) {
      items.push({
        id: stableId("media-unavailable", pageIndex), disposition: "missing",
        reason: `${missingMedia.length} referenced media files were not available as verified local blobs and were not imported`,
        evidenceIds: [pageEvidenceId], blocking: false,
      });
    }
    addSection(pageIndex, "footer", { type: "footer", businessName }, [pageEvidenceId]);
  });

  input.assets.forEach((asset, index) => {
    const mappedIndex = imageInputs.findIndex((entry) => entry.asset === asset);
    items.push({
      id: stableId(mappedIndex >= 0 ? "asset-mapped" : "asset-skipped", index),
      disposition: mappedIndex >= 0 ? "converted" : "skipped",
      reason: mappedIndex >= 0
        ? "Copied a verified inert image blob into the portable package"
        : `Preserved ${asset.mediaType} as evidence but did not place it in the native image-only asset set`,
      evidenceIds: [assetEvidence[index]!.id],
      ...(mappedIndex >= 0 ? { target: { kind: "asset", id: `image-${mappedIndex + 1}` } } : {}),
      blocking: false,
    });
  });
  if (cssEvidence.length > 0) items.push({
    id: "theme-signals", disposition: "converted",
    reason: "Mapped bounded CSS design signals to allowlisted SnabbSajt theme tokens; raw runtime CSS was discarded",
    evidenceIds: cssEvidence.slice(0, 256).map((entry) => entry.id), target: { kind: "theme", id: "site.theme" }, blocking: false,
  });

  const contactEvidence = externalContact(input.pages);
  const contact = contactEvidence.contact;
  if (contactEvidence.emailConflict || contactEvidence.phoneConflict) {
    items.push({
      id: "contact-conflict",
      disposition: "manual",
      reason: "Multiple conflicting contact values were found; no arbitrary value was selected",
      evidenceIds: pageEvidence.slice(0, 256).map((entry) => entry.id),
      blocking: false,
    });
  }
  if (contactEvidence.invalidContact) {
    items.push({
      id: "contact-invalid",
      disposition: "manual",
      reason: "Malformed or unsupported contact links were omitted instead of becoming native contact data",
      evidenceIds: pageEvidence.slice(0, 256).map((entry) => entry.id),
      blocking: false,
    });
  }
  for (const [provider, value] of Object.entries(behavior.tracking)) {
    const signalEntry = behavior.signals.find((entry) => entry.kind === "analytics" && entry.value === value)!;
    const evidenceId = evidenceIdForSignal(signalEntry);
    items.push({ id: `tracking-${provider}`, disposition: "converted", reason: `Converted verified ${provider} identifier to typed tracking settings`, evidenceIds: [evidenceId], target: { kind: "tracking", id: provider }, blocking: false });
    items.push({ id: `tracking-${provider}-consent`, disposition: "manual", reason: `${provider} remains governed by SnabbSajt consent settings and requires operator review before packing`, evidenceIds: [evidenceId], blocking: false });
  }
  behavior.trackingConflicts.forEach((entry, index) => items.push({
    id: stableId("tracking-conflict", index), disposition: "manual",
    reason: `Conflicting ${entry.provider} identifiers were not imported`,
    evidenceIds: [evidenceIdForSignal(entry.signal)], blocking: false,
  }));

  behavior.booking.slice(0, 1).forEach((entry) => {
    const pageIndex = Math.max(0, input.pages.findIndex((page) => page.url === entry.pageUrl));
    addSection(pageIndex, "booking", { type: "booking", source: { kind: "provider", url: entry.url, ctaLabel: locale === "sv" ? "Boka" : "Book" } }, [evidenceIdForSignal(entry.signal)], "booking");
  });
  behavior.booking.slice(1).forEach((entry, index) => items.push({
    id: stableId("booking-review", index), disposition: "manual",
    reason: "Additional verified booking URL was preserved for review; only one primary booking section is created automatically",
    evidenceIds: [evidenceIdForSignal(entry.signal)], blocking: false,
  }));
  behavior.forms.forEach((entry, index) => {
    const evidenceId = evidenceIdForSignal(entry.signal);
    if (!entry.native) {
      items.push({ id: stableId("form-review", index), disposition: "manual", reason: "Form was not converted because a verified mailto recipient, POST method, and supported named fields were not all present", evidenceIds: [evidenceId], blocking: false });
      return;
    }
    if (contactEvidence.emailConflict || (contact.email && contact.email !== entry.native.recipient)) {
      items.push({ id: stableId("form-review", index), disposition: "manual", reason: "Form recipient conflicts with another verified contact email", evidenceIds: [evidenceId], blocking: false });
      return;
    }
    contact.email = entry.native.recipient;
    const pageIndex = Math.max(0, input.pages.findIndex((page) => page.url === entry.pageUrl));
    addSection(pageIndex, "lead-form", {
      type: "lead-form",
      heading: locale === "sv" ? "Kontakta oss" : "Contact us",
      fields: entry.native.fields,
      submitLabel: locale === "sv" ? "Skicka" : "Send",
      successMessage: locale === "sv" ? "Tack. Vi återkommer snart." : "Thanks. We will get back to you soon.",
    }, [evidenceId], "contact");
  });
  behavior.maps.forEach((entry, index) => items.push({ id: stableId("map-review", index), disposition: "manual", reason: "Map evidence was preserved, but no native location was created without a verified structured address", evidenceIds: [evidenceIdForSignal(entry)], blocking: false }));
  behavior.galleries.forEach((entry, index) => {
    const pageIndex = input.pages.findIndex((page) => page.url === entry.pageUrl);
    const assetIds = entry.references.map((reference) => assetByReference.get(reference)).filter((id): id is string => Boolean(id));
    const mapped = pageIndex >= 0 && new Set(assetIds).size >= 3;
    if (mapped) {
      addSection(pageIndex, "gallery", { type: "gallery", images: [...new Set(assetIds)].slice(0, 24).map((assetId) => ({ assetId, alt: businessName })) }, [evidenceIdForSignal(entry.signal)]);
    } else {
      items.push({
        id: stableId("gallery-signal", index), disposition: "manual",
        reason: "Gallery-like media references lacked enough importable image blobs and require review",
        evidenceIds: [evidenceIdForSignal(entry.signal)],
        blocking: false,
      });
    }
  });
  const addSkippedSignalBatches = (prefix: string, entries: BehaviorSignal[], reason: (count: number) => string) => {
    for (let offset = 0; offset < entries.length; offset += 256) {
      const batch = entries.slice(offset, offset + 256);
      items.push({
        id: stableId(prefix, offset / 256), disposition: "skipped", reason: reason(batch.length),
        evidenceIds: batch.map(evidenceIdForSignal), blocking: false,
      });
    }
  };
  addSkippedSignalBatches("animation-skipped", behavior.animations, (count) => `${count} animation signal(s) were preserved as evidence until SnabbSajt has a shared motion preset contract`);
  for (const kind of ["script", "embed", "handler"] as const) {
    addSkippedSignalBatches(`active-source-${kind}`, behavior.signals.filter((entry) => entry.kind === kind), (count) => `${count} ${kind} source(s) were retained as inert evidence and will never execute in SnabbSajt`);
  }
  const citedBehaviorEvidence = new Set(items.flatMap((item) => item.evidenceIds).filter((id) => id.startsWith("behavior-")));
  behavior.signals.forEach((entry, index) => {
    const evidenceId = evidenceIdForSignal(entry);
    if (citedBehaviorEvidence.has(evidenceId)) return;
    const inert = ["script", "embed", "handler", "animation"].includes(entry.kind);
    items.push({
      id: stableId("behavior-review", index),
      disposition: inert ? "skipped" : "manual",
      reason: inert
        ? `${entry.kind} evidence was retained inertly but exceeded the detailed conversion inventory`
        : `${entry.kind} evidence was retained for manual review because no safe native conversion was selected`,
      evidenceIds: [evidenceId],
      blocking: false,
    });
  });
  input.warnings.forEach((warning, index) => {
    const evidenceItem: EvidenceItemV1 = { id: stableId("warning", index), kind: "metadata", sourceInputId, locator: "ingestion", contentHash: sha256(warning), excerpt: cleanText(warning, 500) };
    evidence.push(evidenceItem);
    items.push({ id: stableId("warning-review", index), disposition: "manual", reason: warning, evidenceIds: [evidenceItem.id], blocking: false });
  });
  if (input.truncated) items.push({ id: "input-truncated", disposition: "missing", reason: "Input hit a bounded ingestion cap; review the incomplete draft", evidenceIds: [pageEvidence[0]!.id], blocking: true });

  const startedAt = options.startedAt ?? new Date().toISOString();
  const completedAt = options.completedAt ?? new Date().toISOString();
  const reviewRequired = items.some((item) => item.blocking || ["manual", "missing", "unsafe", "ai_proposed"].includes(item.disposition));
  const report: ImportReportV1 = {
    format: IMPORT_REPORT_FORMAT,
    revision: IMPORT_REPORT_REVISION,
    status: items.some((item) => item.blocking) ? "blocked" : reviewRequired ? "review_required" : "ready",
    adapter: { id: "html", version: "1" },
    sourceInputs: [{ id: sourceInputId, kind: input.source.kind === "url" ? "url" : "file", locator: input.source.value.slice(0, 1_000) }],
    detectedPlatform: { id: "html", confidence: 1 },
    timestamps: { startedAt, completedAt },
    requiredVersions: { reportFormat: IMPORT_REPORT_FORMAT_VERSION, portableSiteFormat: PORTABLE_SITE_FORMAT_VERSION, cli: options.cliVersion ?? "0.1.0" },
    evidence,
    items,
    summary: reportSummary(items),
  };

  const site: PortableSiteV1 = {
    format: "sajt-site", version: 1, exportedAt: completedAt,
    site: {
      businessName, vertical: "generic", goal: behavior.booking.length > 0 ? "get_bookings" : "show_services", language: locale,
      theme: themeFrom(input), contact,
      ...(Object.keys(behavior.tracking).length > 0 ? { tracking: behavior.tracking } : {}),
    },
    folders: [], pages, sections, fonts: [], assets,
  };
  const validation = validateSitePackage(site, { assetFileNames: new Set(assetFiles.map((asset) => asset.fileName)), fontFileNames: new Set() });
  const reportValidation = validateImportReport(report);
  if (!reportValidation.ok) {
    throw new Error(`generated an invalid import report: ${reportValidation.issues[0]?.path} ${reportValidation.issues[0]?.message}`);
  }
  return { site, report, evidence, validation, assetFiles };
}
