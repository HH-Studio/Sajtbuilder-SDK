/**
 * Turn bounded HTML evidence into the SAME sections the in-app importer builds.
 *
 * This module is the seam between the SDK's own ingestion (safe fetch, archive
 * extraction, asset blobs, inert script evidence) and the canonical section
 * mapper mirrored from the app under `src/mirror`. Before it existed the CLI
 * carried a mapper of its own that emitted a fixed hero → rich-text → footer on
 * every page, so a nine-block source page converted to three sections while the
 * in-app import of the same page produced services, pricing, gallery and
 * contact bands. One product, two answers, and the CLI had the wrong one.
 *
 * What stays the SDK's job, because the app has no equivalent:
 *
 * - **Bytes.** The app registers image URLs and downloads them at commit time;
 *   a CLI package carries the blobs, so every asset the mapper registered must
 *   be matched to real bytes or removed. `assetKeys` does the matching and
 *   `pruneMissingAssets` removes what cannot be backed — a declared asset with
 *   no `assets/<id>.<ext>` file is a package that fails its own validator.
 * - **Honesty about what was lost.** `unmappedHeadings` compares the source's
 *   own headings against the headings the emitted sections actually show, so
 *   the report can still name every block that did not survive.
 */
import type { PortableSiteV1 } from "../../convex/model/portable";
import type { HtmlIngestionResult } from "./input";
import {
  multiPageToPortableSite,
  type ImportPageInput,
} from "../../mirror/lib/import/htmlToSections";
import { validateSitePackage } from "../../lib/site-kit/validate";
import { imageDimensions, imageExtension } from "./imageBytes";

export type MappedAssetFile = { fileName: string; bytes: Uint8Array };

export type MirrorMappingResult = {
  site: PortableSiteV1;
  assetFiles: MappedAssetFile[];
  /** Images the mapper placed but the package cannot carry (never fetched, or
   *  past a cap). Their sections were pruned rather than left dangling. */
  droppedAssetUrls: string[];
  /** Ingested asset paths that made it into the package, so the report can say
   *  which of the source's files were placed and which were only evidence. */
  usedAssetPaths: Set<string>;
  /** Sections removed because pruning a missing image left them invalid. */
  droppedSections: Array<{ pageTmpId: string; type: string }>;
  /** Per page: headings the source shows that no emitted section shows. */
  unmappedHeadings: Array<{ pageUrl: string; headings: string[] }>;
  /** Per page: how much of the source's own prose the import does not carry.
   *  Headings alone miss the loss that has no heading — a page of unbroken
   *  paragraphs can lose every word of it and report nothing. */
  lostProse: Array<{ pageUrl: string; missing: number; total: number }>;
  /** Source page URL → the portable page it became, for report targets. */
  pageTmpIdByUrl: Map<string, string>;
};

const MAX_STYLESHEET_CHARS = 2 * 1024 * 1024;
const MAX_SCRIPT_CHARS = 512 * 1024;

/** Every string an ingested asset could be addressed by, so a URL the mapper
 *  read out of the markup finds the blob the ingester stored. Zip pages are
 *  parsed against `https://archive.invalid/<path>` and then localized to the
 *  archive path, so both spellings have to resolve to the same file. */
export function assetKeys(value: string): string[] {
  const keys = new Set<string>([value]);
  const withoutQuery = value.split(/[?#]/, 1)[0]!;
  keys.add(withoutQuery);
  try {
    const url = new URL(value);
    const path = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (path) {
      keys.add(path);
      keys.add(`/${path}`);
    }
  } catch {
    keys.add(withoutQuery.replace(/^\/+/, ""));
  }
  try {
    keys.add(decodeURIComponent(withoutQuery));
  } catch {
    // A malformed escape is not a second spelling of the same file.
  }
  return [...keys].filter(Boolean);
}

const MISSING_REF_KEY = /^(?:assetId|assetRef|logoAssetId|posterAssetId|imageAssetId)$/;

/** Remove every object that directly references an asset the package cannot
 *  carry. An object holding a dead reference IS the reference — a
 *  `{ assetId, alt }` media object without its image is not a caption, and a
 *  gallery item without its picture is not an item — so it goes rather than
 *  being left half-formed for the validator to reject. */
function pruneMissingAssets(value: unknown, missing: ReadonlySet<string>): { value: unknown; dead: boolean } {
  if (Array.isArray(value)) {
    const kept = value
      .map((entry) => pruneMissingAssets(entry, missing))
      .filter((entry) => !entry.dead)
      .map((entry) => entry.value);
    return { value: kept, dead: false };
  }
  if (value === null || typeof value !== "object") return { value, dead: false };
  const object = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(object)) {
    if (typeof entry === "string" && MISSING_REF_KEY.test(key) && missing.has(entry)) {
      return { value: undefined, dead: true };
    }
    const pruned = pruneMissingAssets(entry, missing);
    if (pruned.dead) continue;
    next[key] = pruned.value;
  }
  return { value: next, dead: false };
}

/** Every string a built section renders, joined — the text an owner will
 *  actually see on the imported page. */
function textOf(content: unknown, depth = 0): string[] {
  if (depth > 8 || content === null || content === undefined) return [];
  if (typeof content === "string") return [content];
  if (typeof content !== "object") return [];
  if (Array.isArray(content)) return content.flatMap((entry) => textOf(entry, depth + 1));
  return Object.values(content as Record<string, unknown>).flatMap((entry) => textOf(entry, depth + 1));
}

/** Headings a built section actually shows, so the accounting below compares
 *  what the page said with what the import renders rather than with a count. */
function headingsOf(content: unknown, depth = 0): string[] {
  if (depth > 6 || content === null || typeof content !== "object") return [];
  if (Array.isArray(content)) return content.flatMap((entry) => headingsOf(entry, depth + 1));
  const out: string[] = [];
  for (const [key, value] of Object.entries(content as Record<string, unknown>)) {
    if (typeof value === "string" && /^(?:heading|headline|title|name|question|label)$/.test(key)) out.push(value);
    else out.push(...headingsOf(value, depth + 1));
  }
  return out;
}

const normalizeHeading = (value: string) => value.toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]+/gu, "").trim();

export function buildSiteFromMirror(input: HtmlIngestionResult): MirrorMappingResult {
  if (input.pages.length === 0) throw new Error("no HTML page was ingested");
  const home = input.pages[0]!;
  const styleSheets = (() => {
    const texts: string[] = [];
    let budget = MAX_STYLESHEET_CHARS;
    for (const sheet of input.styleSheets) {
      if (budget <= 0) break;
      const text = sheet.text.slice(0, budget);
      budget -= text.length;
      texts.push(text);
    }
    return texts;
  })();
  // Script TEXT, for motion and platform detection only. It is parsed as data
  // (see the mirrored objectLiteral reader) and never executed, here or later.
  const homeScripts = home.evidence.scripts
    .map((script) => script.externalText ?? script.inline ?? "")
    .filter(Boolean)
    .map((text) => text.slice(0, MAX_SCRIPT_CHARS))
    .slice(0, 24);

  const pageInputs: ImportPageInput[] = input.pages.map((page, index) => ({
    url: page.baseUrl,
    html: page.html,
    title: page.title,
    // Design is read from the HOME page alone in the app, so the CSS and the
    // scripts ride with it — carrying them on every page would let a subpage's
    // stylesheet repaint the site.
    ...(index === 0 ? { css: styleSheets, scripts: homeScripts } : {}),
  }));

  const mapped = multiPageToPortableSite(pageInputs, home.baseUrl);
  // Google-font entries ride along: they are named families, not uploads, so
  // the package needs no `fonts/` blob for them and `fontsAssignment` keeps
  // pointing at something real. Dropping them left every import declaring a
  // typeface it had not declared.
  const site: PortableSiteV1 = { ...mapped.site, fonts: mapped.site.fonts ?? [] };

  // --- assets: every declared asset needs one blob in the package -----------
  const byKey = new Map<string, HtmlIngestionResult["assets"][number]>();
  for (const asset of input.assets) {
    for (const key of [...assetKeys(asset.source), ...assetKeys(asset.path)]) {
      if (!byKey.has(key)) byKey.set(key, asset);
    }
  }
  const assetFiles: MappedAssetFile[] = [];
  const droppedAssetUrls: string[] = [];
  const usedAssetPaths = new Set<string>();
  const missingIds = new Set<string>();
  const assets: PortableSiteV1["assets"] = [];
  for (const declared of site.assets ?? []) {
    const found = assetKeys(declared.url ?? "").map((key) => byKey.get(key)).find(Boolean);
    if (!found) {
      missingIds.add(declared.exportId);
      droppedAssetUrls.push(declared.url ?? declared.exportId);
      continue;
    }
    usedAssetPaths.add(found.path);
    assetFiles.push({
      fileName: `${declared.exportId}${imageExtension(found.path, found.mediaType)}`,
      bytes: found.bytes,
    });
    // The mapper's width/height are nominal because the app never holds the
    // bytes. We do, so the package ships the real ones where the header can be
    // read; an unreadable header (SVG, an exotic encoder) keeps the nominal
    // value rather than inventing a different guess.
    const measured = imageDimensions(found.bytes, found.mediaType);
    assets.push({ ...declared, mimeType: found.mediaType, ...(measured ?? {}) });
  }
  site.assets = assets;

  if (missingIds.size > 0) {
    if (site.site.logoAssetId && missingIds.has(site.site.logoAssetId)) {
      const { logoAssetId: _dropped, ...rest } = site.site;
      site.site = rest;
    }
    site.pages = site.pages.map((page) =>
      page.featuredImage && missingIds.has(page.featuredImage.assetId)
        ? (({ featuredImage: _dropped, ...rest }) => rest)(page)
        : page,
    );
    site.sections = site.sections.flatMap((section) => {
      const pruned = pruneMissingAssets(section.content, missingIds);
      return pruned.dead ? [] : [{ ...section, content: pruned.value as typeof section.content }];
    });
  }

  // Pruning an image can leave a band that no longer satisfies its own schema
  // (a gallery is three pictures or it is not a gallery). Ask the real
  // validator which sections those are and drop them, rather than shipping a
  // package whose own `site validate` fails.
  const droppedSections: MirrorMappingResult["droppedSections"] = [];
  for (let pass = 0; pass < 3; pass += 1) {
    const report = validateSitePackage(site, {
      assetFileNames: new Set(assetFiles.map((file) => file.fileName)),
      fontFileNames: new Set(),
    });
    const offending = new Set(
      report.issues
        .filter((issue) => issue.level === "error")
        .map((issue) => /^sections\[(\d+)\]/.exec(issue.path)?.[1])
        .filter((index): index is string => index !== undefined)
        .map(Number),
    );
    if (offending.size === 0) break;
    site.sections = site.sections.filter((section, index) => {
      if (!offending.has(index)) return true;
      droppedSections.push({ pageTmpId: section.pageTmpId, type: section.type });
      return false;
    });
  }

  // --- what the source said that the import does not show -------------------
  const pageTmpIdByUrl = new Map<string, string>();
  const unmappedHeadings: MirrorMappingResult["unmappedHeadings"] = [];
  const lostProse: MirrorMappingResult["lostProse"] = [];
  input.pages.forEach((page, index) => {
    const portablePage = site.pages[index];
    if (portablePage) pageTmpIdByUrl.set(page.url, portablePage.tmpId);
    const own = site.sections.filter((section) => section.pageTmpId === portablePage?.tmpId);
    const shown = new Set(
      own
        .flatMap((section) => headingsOf(section.content))
        .map(normalizeHeading)
        .filter(Boolean),
    );
    // Prose the import does not carry. A paragraph counts as carried when a
    // distinctive opening slice of it survives somewhere on the page — the
    // mapper legitimately trims, joins and bounds copy, so comparing whole
    // strings would report a loss on every successful import.
    const rendered = normalizeHeading(own.flatMap((section) => textOf(section.content)).join(" "));
    const paragraphs = page.contentBlocks
      .filter((block) => block.kind === "paragraph")
      .map((block) => normalizeHeading(block.text))
      // Below a sentence's worth of text a "paragraph" is a label, a date or a
      // caption, and the mapper drops those on purpose.
      .filter((text) => text.length >= 30);
    // Two slices, not one: neighbouring paragraphs on a real page routinely
    // open with the same words ("Vi erbjuder…"), so an opening slice alone
    // reports a lost paragraph as carried because a DIFFERENT one survived.
    // The middle slice is what makes the check per-paragraph.
    const carried = (text: string) =>
      rendered.includes(text.slice(0, 40)) && rendered.includes(text.slice(Math.floor(text.length / 2)).slice(0, 40));
    const missingProse = paragraphs.filter((text) => !carried(text));
    const missingChars = missingProse.reduce((total, text) => total + text.length, 0);
    // Either shape of loss: most of a page's paragraphs gone, or a lot of words
    // gone even if it was only one or two very long ones. The second clause is
    // what catches a single 2 000-character "about the practice" block reduced
    // to a 200-character hero line.
    if ((paragraphs.length >= 3 && missingProse.length > paragraphs.length / 2) || missingChars >= 800) {
      lostProse.push({ pageUrl: page.url, missing: missingProse.length, total: paragraphs.length });
    }
    const missing = page.headings
      .filter((heading) => heading.level >= 1 && heading.level <= 3)
      .map((heading) => heading.text)
      .filter((text) => text.length > 1)
      .filter((text) => {
        const key = normalizeHeading(text);
        if (!key) return false;
        // A heading the import shows as something OTHER than a heading is still
        // shown: comparing headings only with headings reported every hero
        // subtitle taken from the source's own tagline as lost — a false alarm
        // on nearly every import. So: any rendered heading that contains it,
        // or the page's rendered text.
        if (rendered.includes(key)) return false;
        return ![...shown].some((entry) => entry === key || entry.includes(key) || key.includes(entry));
      });
    const unique = [...new Set(missing)];
    if (unique.length > 0) unmappedHeadings.push({ pageUrl: page.url, headings: unique });
  });

  return { site, assetFiles, droppedAssetUrls, usedAssetPaths, droppedSections, unmappedHeadings, lostProse, pageTmpIdByUrl };
}
