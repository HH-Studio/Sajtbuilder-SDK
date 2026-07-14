import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  DEFAULT_WXR_LIMITS,
  collectWxrMedia,
  ingestHtmlInput,
  mapWordpressImport,
  normalizeImportReportJson,
  parseWxr,
  renderImportReportMarkdown,
  type HtmlIngestionOptions,
  type WordpressMappingResult,
} from "@snabbsajt/site-kit";

export type ImportWordpressResult = WordpressMappingResult & { directory: string };

function prepareOutput(target: string): string {
  const directory = resolve(target);
  if (existsSync(directory)) {
    if (lstatSync(directory).isSymbolicLink() || !statSync(directory).isDirectory()) throw new Error(`${directory} must be a real directory`);
    if (readdirSync(directory).length > 0) throw new Error(`${directory} is not empty`);
  }
  mkdirSync(join(directory, "assets"), { recursive: true });
  mkdirSync(join(directory, "fonts"), { recursive: true });
  return directory;
}

function readWxr(path: string): Uint8Array {
  const resolved = resolve(path);
  if (!existsSync(resolved)) throw new Error(`${path} does not exist`);
  if (lstatSync(resolved).isSymbolicLink() || !statSync(resolved).isFile()) throw new Error(`${path} must be a real file`);
  if (statSync(resolved).size > DEFAULT_WXR_LIMITS.maxBytes) throw new Error(`${path} exceeds the WXR byte cap`);
  const value = readFileSync(resolved);
  if (value.byteLength > DEFAULT_WXR_LIMITS.maxBytes) throw new Error(`${path} exceeds the WXR byte cap`);
  return value;
}

export async function importWordpressToDirectory(
  url: string,
  wxrPath: string,
  outputDirectory: string,
  cliVersion: string,
  htmlOptions: HtmlIngestionOptions = {},
): Promise<ImportWordpressResult> {
  const startedAt = new Date().toISOString();
  const wxr = parseWxr(readWxr(wxrPath));
  const crawled = await ingestHtmlInput(url, { maxPages: 50, ...htmlOptions });
  const html = await collectWxrMedia(wxr, crawled, { fetcher: htmlOptions.fetcher });
  const result = mapWordpressImport(wxr, html, { wxrLocator: resolve(wxrPath), startedAt, completedAt: new Date().toISOString(), cliVersion });
  const directory = prepareOutput(outputDirectory);
  const siteJson = `${JSON.stringify(result.site, null, 2)}\n`;
  const reportJson = normalizeImportReportJson(result.report);
  writeFileSync(join(directory, "site.json"), siteJson, { flag: "wx" });
  writeFileSync(join(directory, "evidence.json"), `${JSON.stringify({ revision: "snabbsajt.evidence/v1", evidence: result.evidence }, null, 2)}\n`, { flag: "wx" });
  writeFileSync(join(directory, "import-report.json"), reportJson, { flag: "wx" });
  writeFileSync(join(directory, "import-report.original.json"), reportJson, { flag: "wx" });
  writeFileSync(join(directory, "import-report.md"), renderImportReportMarkdown(result.report), { flag: "wx" });
  writeFileSync(join(directory, "validation.json"), `${JSON.stringify(result.validation, null, 2)}\n`, { flag: "wx" });
  for (const asset of result.assetFiles) writeFileSync(join(directory, "assets", asset.fileName), asset.bytes, { flag: "wx" });
  if (result.report.status !== "ready") {
    writeFileSync(join(directory, "REVIEW-DRAFT.md"), "# Review draft\n\nThis WordPress import is not publish-ready. Review every item in `import-report.md`, resolve conflicts, then explicitly approve it with `snabbsajt site import approve . --yes`.\n", { flag: "wx" });
  }
  writeFileSync(join(directory, "import-provenance.json"), `${JSON.stringify({
    revision: "snabbsajt.import-provenance/v1",
    status: result.report.status,
    siteSha256: createHash("sha256").update(siteJson).digest("hex"),
    reportSha256: createHash("sha256").update(reportJson).digest("hex"),
    originalReportSha256: createHash("sha256").update(reportJson).digest("hex"),
  }, null, 2)}\n`, { flag: "wx" });
  return { ...result, directory };
}
