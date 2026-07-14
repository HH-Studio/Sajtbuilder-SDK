import { existsSync, lstatSync } from "node:fs";
import { basename, dirname, extname, resolve, sep } from "node:path";
import { extractHtmlArchive } from "./archive";
import { assetRecord, readLocalFile, resolveArchiveReference, resolveSameOrigin, type IngestedAsset } from "./assets";
import { parseCssEvidence, type CssEvidence } from "./css";
import { parseHtmlDocument, type FormEvidence, type HtmlDocumentInventory, type ScriptEvidence } from "./dom";
import { safeFetch, type SafeFetchOptions, type SafeFetchResult } from "../net/safeFetch";

export type HtmlInputLimits = {
  maxPages: number;
  maxAssets: number;
  maxFiles: number;
  maxHtmlBytes: number;
  maxCssBytes: number;
  maxScriptBytes: number;
  maxSingleAssetBytes: number;
  maxTotalBytes: number;
  maxArchiveBytes: number;
  maxConcurrency: number;
  maxRedirects: number;
  timeoutMs: number;
};

export const DEFAULT_HTML_INPUT_LIMITS: Readonly<HtmlInputLimits> = Object.freeze({
  maxPages: 25,
  maxAssets: 200,
  maxFiles: 1_000,
  maxHtmlBytes: 5 * 1024 * 1024,
  maxCssBytes: 2 * 1024 * 1024,
  maxScriptBytes: 2 * 1024 * 1024,
  maxSingleAssetBytes: 20 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
  maxArchiveBytes: 64 * 1024 * 1024,
  maxConcurrency: 4,
  maxRedirects: 5,
  timeoutMs: 30_000,
});

export type HtmlIngestionOptions = Partial<HtmlInputLimits> & {
  fetchOptions?: Omit<SafeFetchOptions, "maxBytes" | "maxRedirects" | "timeoutMs" | "allowedOrigin">;
  fetcher?: (input: string, options: SafeFetchOptions) => Promise<SafeFetchResult>;
};

export type HtmlIngestionResult = {
  source: { kind: "url" | "html-file" | "zip"; value: string };
  pages: HtmlDocumentInventory[];
  css: CssEvidence[];
  assets: IngestedAsset[];
  evidence: {
    scripts: ScriptEvidence[];
    forms: FormEvidence[];
    inlineHandlers: HtmlDocumentInventory["evidence"]["inlineHandlers"];
    embeds: HtmlDocumentInventory["evidence"]["embeds"];
    thirdPartyHosts: string[];
  };
  warnings: string[];
  truncated: boolean;
  totalBytes: number;
};

const HTML_EXTENSIONS = new Set([".html", ".htm"]);
const TEXT_DECODER = new TextDecoder("utf-8");
const EVIDENCE_TEXT_CAP = 64 * 1024;

function isHtmlResponse(response: SafeFetchResult): boolean {
  const contentType = response.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
  return !contentType || contentType === "text/html" || contentType === "application/xhtml+xml";
}

function limitsFrom(options: HtmlIngestionOptions): HtmlInputLimits {
  const limits = { ...DEFAULT_HTML_INPUT_LIMITS };
  for (const key of Object.keys(limits) as Array<keyof HtmlInputLimits>) {
    if (options[key] !== undefined) limits[key] = options[key]!;
    if (!Number.isSafeInteger(limits[key]) || limits[key] <= 0) throw new RangeError(`${key} must be a positive integer`);
  }
  return limits;
}

function syntheticUrl(path: string): string {
  return `https://archive.invalid/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function syntheticPath(reference: string): string | null {
  try {
    const url = new URL(reference);
    if (url.origin !== "https://archive.invalid") return null;
    return decodeURIComponent(url.pathname.slice(1));
  } catch {
    return null;
  }
}

function localize(reference: string): string {
  return syntheticPath(reference) ?? reference;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && /not found/.test(error.message);
}

function mergePageEvidence(result: HtmlIngestionResult, page: HtmlDocumentInventory): void {
  result.evidence.scripts.push(...page.evidence.scripts);
  result.evidence.forms.push(...page.evidence.forms);
  result.evidence.inlineHandlers.push(...page.evidence.inlineHandlers);
  result.evidence.embeds.push(...page.evidence.embeds);
  for (const host of page.evidence.thirdPartyHosts) {
    if (!result.evidence.thirdPartyHosts.includes(host)) result.evidence.thirdPartyHosts.push(host);
  }
}

type VirtualProvider = {
  read(path: string, maxBytes: number, label: string): Uint8Array;
  has(path: string): boolean;
  paths: string[];
};

async function ingestVirtual(
  provider: VirtualProvider,
  initialPages: string[],
  source: HtmlIngestionResult["source"],
  limits: HtmlInputLimits,
): Promise<HtmlIngestionResult> {
  const result: HtmlIngestionResult = {
    source,
    pages: [],
    css: [],
    assets: [],
    evidence: { scripts: [], forms: [], inlineHandlers: [], embeds: [], thirdPartyHosts: [] },
    warnings: [],
    truncated: false,
    totalBytes: 0,
  };
  const consumed = new Set<string>();
  const loadedResources = new Set<string>();
  const reservedAssets = new Set<string>();
  const pageQueue: string[] = [];
  const queuedPages = new Set<string>();

  const consume = (path: string, maxBytes: number, label: string): Uint8Array => {
    if (consumed.has(path)) return provider.read(path, maxBytes, label);
    if (consumed.size >= limits.maxFiles) throw new Error(`file cap exceeded (${limits.maxFiles})`);
    const remaining = limits.maxTotalBytes - result.totalBytes;
    if (remaining <= 0) throw new Error(`total byte cap exceeded (${limits.maxTotalBytes})`);
    let bytes: Uint8Array;
    try {
      bytes = provider.read(path, Math.min(maxBytes, remaining), label);
    } catch (error) {
      if (remaining < maxBytes && error instanceof Error && /byte cap/.test(error.message)) {
        throw new Error(`total byte cap exceeded (${limits.maxTotalBytes})`);
      }
      throw error;
    }
    result.totalBytes += bytes.byteLength;
    if (result.totalBytes > limits.maxTotalBytes) throw new Error(`total byte cap exceeded (${limits.maxTotalBytes})`);
    consumed.add(path);
    return bytes;
  };
  const queuePage = (path: string): void => {
    if (queuedPages.has(path)) return;
    if (queuedPages.size >= limits.maxPages) {
      result.truncated = true;
      return;
    }
    queuedPages.add(path);
    pageQueue.push(path);
  };
  initialPages.forEach(queuePage);

  const reserveAsset = (path: string): void => {
    if (reservedAssets.has(path)) return;
    if (reservedAssets.size >= limits.maxAssets) throw new Error(`asset cap exceeded (${limits.maxAssets})`);
    reservedAssets.add(path);
  };

  const addAsset = (path: string, sourceReference: string): void => {
    if (result.assets.some((asset) => asset.path === path)) return;
    reserveAsset(path);
    try {
      const bytes = consume(path, limits.maxSingleAssetBytes, "asset");
      result.assets.push(assetRecord(path, sourceReference, bytes));
    } catch (error) {
      if (isMissing(error)) result.warnings.push((error as Error).message);
      else throw error;
    }
  };

  const loadScript = (path: string, script: ScriptEvidence): void => {
    if (loadedResources.has(`script:${path}`)) return;
    reserveAsset(path);
    loadedResources.add(`script:${path}`);
    try {
      const bytes = consume(path, limits.maxScriptBytes, "script evidence");
      script.externalText = TEXT_DECODER.decode(bytes).slice(0, EVIDENCE_TEXT_CAP);
      script.src = path;
    } catch (error) {
      if (isMissing(error)) result.warnings.push((error as Error).message);
      else throw error;
    }
  };

  const loadCss = (path: string): void => {
    if (loadedResources.has(`css:${path}`)) return;
    reserveAsset(path);
    loadedResources.add(`css:${path}`);
    let bytes: Uint8Array;
    try {
      bytes = consume(path, limits.maxCssBytes, "CSS");
    } catch (error) {
      if (isMissing(error)) {
        result.warnings.push((error as Error).message);
        return;
      }
      throw error;
    }
    const evidence = parseCssEvidence(TEXT_DECODER.decode(bytes), syntheticUrl(path));
    evidence.source = path;
    result.css.push(evidence);
    for (const imported of evidence.imports) {
      const resolved = syntheticPath(imported) ?? resolveArchiveReference(path, imported);
      if (resolved) loadCss(resolved);
      else if (/^https?:/i.test(imported)) result.evidence.thirdPartyHosts.push(new URL(imported).hostname);
    }
    for (const media of evidence.media) {
      const resolved = syntheticPath(media) ?? resolveArchiveReference(path, media);
      if (resolved) addAsset(resolved, media);
      else if (/^https?:/i.test(media)) result.evidence.thirdPartyHosts.push(new URL(media).hostname);
    }
    evidence.imports = evidence.imports.map((reference) => syntheticPath(reference) ?? reference);
    evidence.media = evidence.media.map((reference) => syntheticPath(reference) ?? reference);
  };

  const recordInlineCss = (css: string, sourceUrl: string): void => {
    const evidence = parseCssEvidence(css, sourceUrl);
    result.css.push(evidence);
    for (const imported of evidence.imports) {
      const resolved = syntheticPath(imported);
      if (resolved) loadCss(resolved);
      else if (/^https?:/i.test(imported)) result.evidence.thirdPartyHosts.push(new URL(imported).hostname);
    }
    for (const media of evidence.media) {
      const resolved = syntheticPath(media);
      if (resolved) addAsset(resolved, media);
      else if (/^https?:/i.test(media)) result.evidence.thirdPartyHosts.push(new URL(media).hostname);
    }
    evidence.imports = evidence.imports.map((reference) => syntheticPath(reference) ?? reference);
    evidence.media = evidence.media.map((reference) => syntheticPath(reference) ?? reference);
  };

  while (pageQueue.length > 0) {
    const pagePath = pageQueue.shift()!;
    let bytes: Uint8Array;
    try {
      bytes = consume(pagePath, limits.maxHtmlBytes, "HTML");
    } catch (error) {
      if (isMissing(error)) {
        result.warnings.push((error as Error).message);
        continue;
      }
      throw error;
    }
    const page = parseHtmlDocument(TEXT_DECODER.decode(bytes), syntheticUrl(pagePath));
    page.url = pagePath;
    page.links = page.links.map(localize);
    page.navigation = page.navigation.map((entry) => ({ ...entry, href: localize(entry.href) }));
    page.mediaGroups = page.mediaGroups.map((group) => group.map(localize));
    page.media = page.media.map(localize);
    page.stylesheets = page.stylesheets.map(localize);
    for (const form of page.evidence.forms) if (form.action) form.action = localize(form.action);
    for (const embed of page.evidence.embeds) embed.src = localize(embed.src);
    for (const script of page.evidence.scripts) if (script.src) script.src = localize(script.src);
    result.pages.push(page);
    mergePageEvidence(result, page);

    for (const link of page.links) {
      const resolved = resolveArchiveReference(pagePath, link);
      if (resolved && HTML_EXTENSIONS.has(extname(resolved).toLowerCase()) && provider.has(resolved)) queuePage(resolved);
    }
    for (const stylesheet of page.stylesheets) {
      const resolved = resolveArchiveReference(pagePath, stylesheet);
      if (resolved) loadCss(resolved);
    }
    page.styleBlocks.forEach((css, index) => recordInlineCss(css, `${syntheticUrl(pagePath)}?inline-style=${index}`));
    page.inlineStyles.forEach((css, index) => recordInlineCss(`x{${css}}`, `${syntheticUrl(pagePath)}?style-attribute=${index}`));
    for (const media of page.media) {
      const resolved = resolveArchiveReference(pagePath, media);
      if (resolved) addAsset(resolved, media);
    }
    for (const script of page.evidence.scripts) {
      if (!script.src) continue;
      const resolved = resolveArchiveReference(pagePath, script.src);
      if (resolved) loadScript(resolved, script);
    }
  }
  result.evidence.thirdPartyHosts = [...new Set(result.evidence.thirdPartyHosts)].sort();
  return result;
}

function localProvider(root: string): VirtualProvider {
  return {
    paths: [],
    has(path) {
      const target = resolve(root, path);
      return target.startsWith(`${resolve(root)}${sep}`) && existsSync(target) && lstatSync(target).isFile() && !lstatSync(target).isSymbolicLink();
    },
    read(path, maxBytes, label) {
      return readLocalFile({ root, path, maxBytes, capLabel: label });
    },
  };
}

function archiveProvider(files: ReturnType<typeof extractHtmlArchive>): VirtualProvider {
  const entries = new Map(files.map((file) => [file.path, file.bytes]));
  return {
    paths: [...entries.keys()],
    has: (path) => entries.has(path),
    read(path, maxBytes, label) {
      const bytes = entries.get(path);
      if (!bytes) throw new Error(`referenced file not found: ${path}`);
      if (bytes.byteLength > maxBytes) throw new Error(`${label} byte cap exceeded by ${path}`);
      return bytes;
    },
  };
}

async function ingestUrl(input: string, options: HtmlIngestionOptions, limits: HtmlInputLimits): Promise<HtmlIngestionResult> {
  const fetcher = options.fetcher ?? safeFetch;
  const started = Date.now();
  let selectedOrigin: string | undefined;
  const result: HtmlIngestionResult = {
    source: { kind: "url", value: input }, pages: [], css: [], assets: [],
    evidence: { scripts: [], forms: [], inlineHandlers: [], embeds: [], thirdPartyHosts: [] },
    warnings: [], truncated: false, totalBytes: 0,
  };
  const fetched = new Map<string, SafeFetchResult>();
  const resourceKeys = new Set<string>();
  const assertTimeRemaining = (): number => {
    const remaining = limits.timeoutMs - (Date.now() - started);
    if (remaining <= 0) throw new Error(`ingestion timeout exceeded (${limits.timeoutMs}ms)`);
    return remaining;
  };
  const fetchResource = async (url: string, maxBytes: number): Promise<SafeFetchResult> => {
    const existing = fetched.get(url);
    if (existing) return existing;
    if (resourceKeys.size >= limits.maxFiles) throw new Error(`file cap exceeded (${limits.maxFiles})`);
    const remainingBytes = limits.maxTotalBytes - result.totalBytes;
    if (remainingBytes <= 0) throw new Error(`total byte cap exceeded (${limits.maxTotalBytes})`);
    const remainingTime = assertTimeRemaining();
    const response = await fetcher(url, {
      ...options.fetchOptions,
      maxBytes: Math.min(maxBytes, remainingBytes),
      maxRedirects: limits.maxRedirects,
      timeoutMs: remainingTime,
      ...(selectedOrigin ? { allowedOrigin: selectedOrigin } : {}),
    });
    assertTimeRemaining();
    if (selectedOrigin && new URL(response.finalUrl).origin !== selectedOrigin) {
      throw new Error(`resource left selected site origin ${selectedOrigin}: ${response.finalUrl}`);
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status} for ${url}`);
    result.totalBytes += response.body.byteLength;
    resourceKeys.add(url);
    fetched.set(url, response);
    return response;
  };

  const first = await fetchResource(input, limits.maxHtmlBytes);
  if (!isHtmlResponse(first)) throw new Error(`public URL did not return HTML (${first.headers["content-type"] ?? "unknown content type"})`);
  selectedOrigin = new URL(first.finalUrl).origin;
  result.source.value = first.finalUrl;
  const pageQueue = [first.finalUrl];
  const queuedPages = new Set(pageQueue);
  fetched.set(first.finalUrl, first);
  const cssQueue: string[] = [];
  const queuedCss = new Set<string>();
  const assetQueue = new Set<string>();
  const reservedAssets = new Set<string>();
  const scripts = new Map<string, ScriptEvidence[]>();

  const noteThirdParty = (reference: string): void => {
    try {
      const url = new URL(reference);
      if (url.origin !== selectedOrigin) result.evidence.thirdPartyHosts.push(url.hostname);
    } catch { /* inert non-URL */ }
  };
  const queueCss = (reference: string, base: string): void => {
    const url = resolveSameOrigin(reference, base, selectedOrigin!);
    if (!url) { noteThirdParty(reference); return; }
    if (!queuedCss.has(url.href)) {
      if (!reservedAssets.has(url.href) && reservedAssets.size >= limits.maxAssets) throw new Error(`asset cap exceeded (${limits.maxAssets})`);
      reservedAssets.add(url.href); queuedCss.add(url.href); cssQueue.push(url.href);
    }
  };
  const queueAsset = (reference: string, base: string): void => {
    const url = resolveSameOrigin(reference, base, selectedOrigin!);
    if (!url) { noteThirdParty(reference); return; }
    if (!reservedAssets.has(url.href) && reservedAssets.size >= limits.maxAssets) throw new Error(`asset cap exceeded (${limits.maxAssets})`);
    reservedAssets.add(url.href); assetQueue.add(url.href);
  };

  while (pageQueue.length > 0) {
    const pageUrl = pageQueue.shift()!;
    const response = await fetchResource(pageUrl, limits.maxHtmlBytes);
    if (!isHtmlResponse(response)) {
      result.warnings.push(`Skipped non-HTML page candidate ${response.finalUrl} (${response.headers["content-type"] ?? "unknown content type"})`);
      continue;
    }
    const page = parseHtmlDocument(TEXT_DECODER.decode(response.body), response.finalUrl);
    result.pages.push(page);
    mergePageEvidence(result, page);
    for (const link of page.links) {
      const url = resolveSameOrigin(link, response.finalUrl, selectedOrigin);
      if (!url) { noteThirdParty(link); continue; }
      if (queuedPages.has(url.href)) continue;
      if (queuedPages.size >= limits.maxPages) { result.truncated = true; continue; }
      queuedPages.add(url.href); pageQueue.push(url.href);
    }
    page.stylesheets.forEach((reference) => queueCss(reference, response.finalUrl));
    page.media.forEach((reference) => queueAsset(reference, response.finalUrl));
    page.styleBlocks.forEach((css, index) => {
      const evidence = parseCssEvidence(css, `${response.finalUrl}#inline-style-${index}`);
      result.css.push(evidence);
      evidence.imports.forEach((reference) => queueCss(reference, response.finalUrl));
      evidence.media.forEach((reference) => queueAsset(reference, response.finalUrl));
    });
    page.inlineStyles.forEach((css, index) => {
      const evidence = parseCssEvidence(`x{${css}}`, `${response.finalUrl}#style-attribute-${index}`);
      result.css.push(evidence);
      evidence.imports.forEach((reference) => queueCss(reference, response.finalUrl));
      evidence.media.forEach((reference) => queueAsset(reference, response.finalUrl));
    });
    for (const script of page.evidence.scripts) {
      if (!script.src) continue;
      const url = resolveSameOrigin(script.src, response.finalUrl, selectedOrigin);
      if (!url) { noteThirdParty(script.src); continue; }
      if (!reservedAssets.has(url.href) && reservedAssets.size >= limits.maxAssets) throw new Error(`asset cap exceeded (${limits.maxAssets})`);
      reservedAssets.add(url.href);
      const list = scripts.get(url.href) ?? [];
      list.push(script); scripts.set(url.href, list);
    }
    assertTimeRemaining();
  }
  while (cssQueue.length > 0) {
    const url = cssQueue.shift()!;
    const response = await fetchResource(url, limits.maxCssBytes);
    const evidence = parseCssEvidence(TEXT_DECODER.decode(response.body), response.finalUrl);
    result.css.push(evidence);
    evidence.imports.forEach((reference) => queueCss(reference, response.finalUrl));
    evidence.media.forEach((reference) => queueAsset(reference, response.finalUrl));
    assertTimeRemaining();
  }
  for (const [url, scriptEvidence] of scripts) {
    const response = await fetchResource(url, limits.maxScriptBytes);
    const text = TEXT_DECODER.decode(response.body).slice(0, EVIDENCE_TEXT_CAP);
    scriptEvidence.forEach((entry) => { entry.externalText = text; });
  }
  for (const url of assetQueue) {
    const response = await fetchResource(url, limits.maxSingleAssetBytes);
    const final = new URL(response.finalUrl);
    result.assets.push(assetRecord(final.pathname.slice(1) || basename(final.pathname), url, response.body, response.headers["content-type"]));
  }
  result.evidence.thirdPartyHosts = [...new Set(result.evidence.thirdPartyHosts)].sort();
  assertTimeRemaining();
  return result;
}

export async function ingestHtmlInput(input: string | URL, options: HtmlIngestionOptions = {}): Promise<HtmlIngestionResult> {
  const limits = limitsFrom(options);
  const value = input instanceof URL ? input.href : input;
  if (/^https?:\/\//i.test(value)) return ingestUrl(value, options, limits);
  const path = resolve(value);
  const extension = extname(path).toLowerCase();
  if (extension !== ".zip" && !HTML_EXTENSIONS.has(extension)) {
    throw new Error("input must be a public URL, .html file, or .zip archive");
  }
  const initialBytes = readLocalFile({
    root: dirname(path),
    path: basename(path),
    maxBytes: extension === ".zip" ? limits.maxArchiveBytes : limits.maxHtmlBytes,
    capLabel: "input",
  });
  if (extension === ".zip") {
    const files = extractHtmlArchive(initialBytes, {
      maxEntries: limits.maxFiles,
      maxEntryBytes: Math.max(limits.maxHtmlBytes, limits.maxSingleAssetBytes),
      maxTotalBytes: limits.maxTotalBytes,
      maxArchiveBytes: limits.maxArchiveBytes,
    });
    const provider = archiveProvider(files);
    const htmlPaths = provider.paths.filter((entry) => HTML_EXTENSIONS.has(extname(entry).toLowerCase())).sort();
    if (htmlPaths.length === 0) throw new Error("archive contains no HTML files");
    return ingestVirtual(provider, htmlPaths, { kind: "zip", value: path }, limits);
  }
  return ingestVirtual(localProvider(dirname(path)), [basename(path)], { kind: "html-file", value: path }, limits);
}
