import { existsSync, lstatSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import {
  ingestHtmlInput,
  mapHtmlIngestion,
  normalizeImportReportJson,
  renderImportReportMarkdown,
  type HtmlMappingResult,
} from "@snabbsajt/site-kit";

export type ImportHtmlResult = HtmlMappingResult & { directory: string };

function prepareOutput(target: string): string {
  const directory = resolve(target);
  if (existsSync(directory)) {
    if (lstatSync(directory).isSymbolicLink() || !statSync(directory).isDirectory()) {
      throw new Error(`${directory} must be a real directory`);
    }
    if (readdirSync(directory).length > 0) throw new Error(`${directory} is not empty`);
  }
  mkdirSync(join(directory, "assets"), { recursive: true });
  mkdirSync(join(directory, "fonts"), { recursive: true });
  return directory;
}

export async function importHtmlToDirectory(input: string, outputDirectory: string, cliVersion: string): Promise<ImportHtmlResult> {
  const startedAt = new Date().toISOString();
  const ingested = await ingestHtmlInput(input);
  const result = mapHtmlIngestion(ingested, { startedAt, completedAt: new Date().toISOString(), cliVersion });
  const directory = prepareOutput(outputDirectory);
  const siteJson = `${JSON.stringify(result.site, null, 2)}\n`;
  const reportJson = normalizeImportReportJson(result.report);
  writeFileSync(join(directory, "site.json"), siteJson, { flag: "wx" });
  writeFileSync(join(directory, "evidence.json"), `${JSON.stringify({ revision: "snabbsajt.evidence/v1", evidence: result.evidence }, null, 2)}\n`, { flag: "wx" });
  writeFileSync(join(directory, "import-report.json"), reportJson, { flag: "wx" });
  writeFileSync(join(directory, "import-report.md"), renderImportReportMarkdown(result.report), { flag: "wx" });
  writeFileSync(join(directory, "validation.json"), `${JSON.stringify(result.validation, null, 2)}\n`, { flag: "wx" });
  for (const asset of result.assetFiles) writeFileSync(join(directory, "assets", asset.fileName), asset.bytes, { flag: "wx" });
  if (result.report.status !== "ready") {
    writeFileSync(join(directory, "REVIEW-DRAFT.md"), `# Review draft\n\nThis import is **not publish-ready**. Review every action in \`import-report.md\`, edit \`site.json\` where needed, then explicitly approve the result:\n\n\`snabbsajt site import approve . --yes\`\n\nAfter approval, pack the normal bundle with \`snabbsajt site pack .\`.\n`, { flag: "wx" });
  }
  writeFileSync(join(directory, "import-provenance.json"), `${JSON.stringify({
    revision: "snabbsajt.import-provenance/v1",
    status: result.report.status,
    siteSha256: createHash("sha256").update(siteJson).digest("hex"),
    reportSha256: createHash("sha256").update(reportJson).digest("hex"),
  }, null, 2)}\n`, { flag: "wx" });
  return { ...result, directory };
}
