import { createHash } from "node:crypto";
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
import { assetKeys, buildSiteFromMirror } from "./sections";

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
  // Everything above this line is the SDK's own work: bounded ingestion, inert
  // evidence, real blobs. The SECTIONS are the app's, mirrored under
  // `src/mirror` and driven here — one mapper for the CLI and the in-app
  // import, so the same page converts the same way in both.
  const mirror = buildSiteFromMirror(input);
  const site = mirror.site;
  const locale: "sv" | "en" = site.site.language === "en" ? "en" : "sv";
  const businessName = site.site.businessName;
  const pages = site.pages;
  const sections = site.sections;
  const assets = site.assets ?? [];
  const assetFiles: HtmlMappedAssetFile[] = mirror.assetFiles;
  const pageIndexByTmpId = new Map(pages.map((page, index) => [page.tmpId, index]));
  const evidenceIdForPage = (tmpId: string) => pageEvidence[pageIndexByTmpId.get(tmpId) ?? 0]!.id;
  /** Source reference → the export id the mapper gave it, so a band this file
   *  adds from behaviour evidence points at the blob already in the package. */
  const assetByReference = new Map<string, string>();
  for (const asset of assets) {
    // Every spelling, through the same normalizer the reconciliation used. A
    // zip's page is parsed against `https://archive.invalid/<path>` and then
    // localized to the archive path, so comparing the two raw strings finds
    // nothing — and a gallery the mapper had already built reported itself as
    // "not enough importable blobs".
    const keys = new Set(assetKeys(asset.url ?? ""));
    const ingested = input.assets.find((entry) =>
      [...assetKeys(entry.source), ...assetKeys(entry.path)].some((key) => keys.has(key)),
    );
    for (const key of [...keys, ...(ingested ? [...assetKeys(ingested.path), ...assetKeys(ingested.source)] : [])]) {
      if (key && !assetByReference.has(key)) assetByReference.set(key, asset.exportId);
    }
  }

  const items: ImportReportItemV1[] = [];
  sections.forEach((section, index) => items.push({
    id: stableId("section", index),
    disposition: "converted",
    reason: `Mapped inert HTML evidence to native ${section.type} content`,
    evidenceIds: [evidenceIdForPage(section.pageTmpId)],
    target: { kind: "section", id: `${section.pageTmpId}:${section.type}` },
    blocking: false,
  }));

  // A band added from BEHAVIOUR evidence — a verified booking provider, a
  // mailto form, a gallery grid — but only where the mapper did not already
  // read one of that type off the page itself. Two contact bands on one page
  // is a worse import than one.
  const lastOrderByPage = new Map<string, string>();
  for (const section of sections) {
    if (section.order === undefined) continue;
    const current = lastOrderByPage.get(section.pageTmpId);
    if (current === undefined || section.order > current) lastOrderByPage.set(section.pageTmpId, section.order);
  }
  const addSection = (
    pageIndex: number,
    type: keyof typeof SECTION_REGISTRY,
    content: unknown,
    evidenceIds: string[],
    anchorId?: string,
  ): "added" | "already" | "no-page" => {
    const page = pages[pageIndex];
    if (!page) return "no-page";
    if (sections.some((section) => section.pageTmpId === page.tmpId && section.type === type)) {
      // The mapper read one off the page itself, which is the better band — it
      // kept the source's own grouping. Still CITE the evidence: an uncited
      // signal falls through to the catch-all below and reports a converted
      // gallery as "no safe native conversion was selected".
      items.push({
        id: stableId("section-already", items.length),
        disposition: "converted",
        reason: `The source's own ${type} band was already mapped from the page structure; this evidence agrees with it`,
        evidenceIds,
        target: { kind: "section", id: `${page.tmpId}:${type}` },
        blocking: false,
      });
      return "already";
    }
    const order = generateKeyBetween(lastOrderByPage.get(page.tmpId) ?? null, null);
    lastOrderByPage.set(page.tmpId, order);
    sections.push({
      pageTmpId: page.tmpId,
      type,
      variant: defaultVariant(type),
      order,
      ...(anchorId ? { anchorId } : {}),
      content,
    } as PortableSiteV1["sections"][number]);
    items.push({
      id: stableId("section-behavior", sections.length),
      disposition: "converted",
      reason: `Converted verified behaviour evidence to a native ${type} section`,
      evidenceIds,
      target: { kind: "section", id: `${page.tmpId}:${type}` },
      blocking: false,
    });
    return "added";
  };

  // What the source shows that the import does not. The mapper reads the real
  // structure now, so this list is usually short — but it is the plan's promise
  // ("nothing vanishes silently"), and it is checked against the headings the
  // emitted sections actually render rather than against a guess about them.
  mirror.unmappedHeadings.forEach(({ pageUrl, headings }, index) => {
    const pageIndex = Math.max(0, input.pages.findIndex((page) => page.url === pageUrl));
    const evidenceId = pageEvidence[pageIndex]!.id;
    const named = headings.slice(0, 12).map((heading) => `"${heading}"`).join(", ");
    const rest = headings.length > 12 ? ` and ${headings.length - 12} more` : "";
    items.push({
      id: stableId("structure-unmapped", index),
      disposition: "merged",
      reason: `${headings.length} heading(s) the source shows are not shown by any imported section: ${named}${rest}. Their copy may have been merged into a neighbouring band, and their own layout was not preserved.`,
      evidenceIds: [evidenceId],
      blocking: false,
    });
    // A page that lost this much shape is not something to publish unreviewed.
    if (headings.length > 3) {
      items.push({
        id: stableId("structure-unmapped-review", index),
        disposition: "manual",
        reason: `Compare this page with its source before publishing: ${headings.length} of its headings are missing from the import`,
        evidenceIds: [evidenceId],
        blocking: false,
      });
    }
  });
  // Loss with no heading over it. A page of unbroken paragraphs can lose every
  // word and produce no unmapped heading at all, which is how a 100-paragraph
  // page reported `ready` with nothing on it but a hero and a footer.
  mirror.lostProse.forEach(({ pageUrl, missing, total }, index) => {
    const pageIndex = Math.max(0, input.pages.findIndex((page) => page.url === pageUrl));
    const evidenceId = pageEvidence[pageIndex]!.id;
    items.push({
      id: stableId("prose-missing", index),
      disposition: "missing",
      reason: `${missing} of this page's ${total} paragraphs are not shown by any imported section; their copy is in the source evidence but not on the imported page`,
      evidenceIds: [evidenceId],
      blocking: false,
    });
    items.push({
      id: stableId("prose-missing-review", index),
      disposition: "manual",
      reason: "Copy the missing paragraphs across from the source before publishing this page",
      evidenceIds: [evidenceId],
      blocking: false,
    });
  });
  if (mirror.droppedAssetUrls.length > 0) {
    items.push({
      id: "assets-unavailable",
      disposition: "missing",
      reason: `${mirror.droppedAssetUrls.length} image(s) the source used were not available as verified local blobs; the bands that used them were removed rather than shipped pointing at nothing`,
      evidenceIds: [pageEvidence[0]!.id],
      blocking: false,
    });
  }
  mirror.droppedSections.forEach((dropped, index) => items.push({
    id: stableId("section-dropped", index),
    disposition: "missing",
    reason: `A ${dropped.type} section could not be kept once its unavailable images were removed; rebuild it by hand`,
    evidenceIds: [evidenceIdForPage(dropped.pageTmpId)],
    blocking: false,
  }));

  input.assets.forEach((asset, index) => {
    const placed = mirror.usedAssetPaths.has(asset.path)
      ? assets.find((entry) => assetByReference.get(asset.path) === entry.exportId)
      : undefined;
    items.push({
      id: stableId(placed ? "asset-mapped" : "asset-skipped", index),
      disposition: placed ? "converted" : "skipped",
      reason: placed
        ? "Copied a verified inert image blob into the portable package"
        : `Preserved ${asset.mediaType} as evidence but no imported section referenced it`,
      evidenceIds: [assetEvidence[index]!.id],
      ...(placed ? { target: { kind: "asset" as const, id: placed.exportId } } : {}),
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
    const outcome = pageIndex >= 0 && new Set(assetIds).size >= 3
      ? addSection(pageIndex, "gallery", { type: "gallery", images: [...new Set(assetIds)].slice(0, 24).map((assetId) => ({ assetId, alt: businessName })) }, [evidenceIdForSignal(entry.signal)])
      : "no-page";
    // "already" means the mapper read a gallery off this page itself, which is
    // the better one — it kept the source's own grouping. Only a grid we could
    // neither map nor back with blobs is worth an operator's time.
    if (outcome === "no-page") {
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

  // The mapper's site, with the two facts this file is stricter about. It sees
  // one page at a time and takes the first `tel:`/`mailto:` it trusts; the
  // ingester has read every page, so where IT found two different values the
  // honest answer is none — a wrong phone number on an imported site is worse
  // than a missing one, because nobody checks a field that looks filled in.
  const contactConflictFree = { ...(site.site.contact ?? {}), ...contact };
  if (contactEvidence.emailConflict) delete contactConflictFree.email;
  if (contactEvidence.phoneConflict) delete contactConflictFree.phone;
  // Tracking ids come from the SDK's own VERIFIED detection, not the mapper's.
  // The mapper reads any `G-`/`GTM-` string it finds, which is right for an
  // in-app import an owner is watching; a package written to disk has to hold a
  // higher bar, and `detectHtmlBehavior` is where that bar lives — it rejects
  // placeholder and prose ids, and reports two conflicting ones instead of
  // picking. Writing a bogus measurement id into a customer's site is a defect
  // nobody notices for months.
  const conflictingProviders = new Set<string>(behavior.trackingConflicts.map((entry) => entry.provider));
  const tracking = { ...behavior.tracking };
  for (const provider of Object.keys(tracking) as Array<keyof typeof tracking>) {
    if (conflictingProviders.has(provider)) delete tracking[provider];
  }
  site.exportedAt = completedAt;
  const nextSite = {
    ...site.site,
    contact: contactConflictFree,
    ...(behavior.booking.length > 0 ? { goal: "get_bookings" as const } : {}),
  };
  if (Object.keys(tracking).length > 0) nextSite.tracking = tracking;
  else delete nextSite.tracking;
  site.site = nextSite;
  const validation = validateSitePackage(site, { assetFileNames: new Set(assetFiles.map((asset) => asset.fileName)), fontFileNames: new Set() });
  const reportValidation = validateImportReport(report);
  if (!reportValidation.ok) {
    throw new Error(`generated an invalid import report: ${reportValidation.issues[0]?.path} ${reportValidation.issues[0]?.message}`);
  }
  return { site, report, evidence, validation, assetFiles };
}
