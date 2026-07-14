import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  IMPORT_REPORT_FORMAT,
  IMPORT_REPORT_FORMAT_VERSION,
  PORTABLE_CAPS,
  PORTABLE_FORMAT,
  PORTABLE_VERSION,
  createStarterSite,
  normalizeImportReportJson,
  packSitePackage,
  renderImportReportMarkdown,
  REVIEW_ARTIFACT_NAMES,
  validateSitePackage,
  validateImportReport,
  type ImportReportV1,
  type PortableSiteV1,
  type SiteKitReport,
  type StarterTemplate,
} from "@snabbsajt/site-kit";
import { readBoundedLocalFiles } from "@snabbsajt/site-kit/local-files";
import { importHtmlToDirectory } from "./site/import-html";

type Output = {
  stdout(message: string): void;
  stderr(message: string): void;
};

class CliError extends Error {}

function readBoundedFile(path: string, maxBytes: number): Buffer {
  if (!existsSync(path)) throw new CliError(`${path} does not exist`);
  if (lstatSync(path).isSymbolicLink()) throw new CliError(`${path} must not be a symbolic link`);
  const expected = statSync(path);
  if (!expected.isFile()) throw new CliError(`${path} must be a regular file`);
  if (expected.size > maxBytes) throw new CliError(`${path} exceeds the ${maxBytes} byte cap`);
  const bytes = readFileSync(path);
  if (bytes.byteLength !== expected.size || bytes.byteLength > maxBytes) throw new CliError(`${path} changed while it was being read`);
  return bytes;
}

function parseImportHtmlArgs(args: string[]): { input: string; outputDirectory?: string } {
  let input: string | undefined;
  let outputDirectory: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "-o") {
      if (outputDirectory !== undefined) throw new CliError("site import html accepts -o only once");
      const value = args[++index];
      if (!value || value.startsWith("-")) throw new CliError("site import html -o requires a directory");
      outputDirectory = value;
      continue;
    }
    if (argument.startsWith("-")) throw new CliError(`unknown site import html option "${argument}"`);
    if (input !== undefined) throw new CliError(`unexpected site import html argument "${argument}"`);
    input = argument;
  }
  if (!input) throw new CliError("site import html requires a public URL, .html file, or .zip archive");
  return { input, ...(outputDirectory ? { outputDirectory } : {}) };
}

function parsePackArgs(args: string[]): { outputPath?: string; reviewDraft: boolean } {
  let outputPath: string | undefined;
  let reviewDraft = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--review-draft") {
      if (reviewDraft) throw new CliError("site pack accepts --review-draft only once");
      reviewDraft = true;
      continue;
    }
    if (argument === "-o") {
      if (outputPath !== undefined) throw new CliError("site pack accepts -o only once");
      const value = args[++index];
      if (!value || value.startsWith("-")) throw new CliError("site pack -o requires a file path");
      outputPath = value;
      continue;
    }
    throw new CliError(argument.startsWith("-") ? `unknown site pack option "${argument}"` : `unexpected site pack argument "${argument}"`);
  }
  return { ...(outputPath ? { outputPath } : {}), reviewDraft };
}

function findPackageVersion(start: string, expectedName: string): string {
  let current = resolve(start);
  for (;;) {
    const packagePath = join(current, "package.json");
    if (existsSync(packagePath)) {
      const metadata = JSON.parse(readFileSync(packagePath, "utf8")) as {
        name?: string;
        version?: string;
      };
      if (metadata.name === expectedName && metadata.version) return metadata.version;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new CliError(`could not resolve ${expectedName} package version`);
}

function installedVersions() {
  return {
    cli: findPackageVersion(dirname(fileURLToPath(import.meta.url)), "@snabbsajt/cli"),
    siteKit: findPackageVersion(
      dirname(fileURLToPath(import.meta.resolve("@snabbsajt/site-kit"))),
      "@snabbsajt/site-kit",
    ),
  };
}

function loadPackage(target: string) {
  const resolved = resolve(target);
  if (!existsSync(resolved)) throw new CliError(`${target} does not exist`);
  if (lstatSync(resolved).isSymbolicLink()) {
    throw new CliError(`${target} must not be a symbolic link`);
  }
  const isDir = statSync(resolved).isDirectory();
  const jsonPath = isDir ? join(resolved, "site.json") : resolved;
  if (!existsSync(jsonPath)) throw new CliError(`${jsonPath} not found`);
  if (lstatSync(jsonPath).isSymbolicLink()) {
    throw new CliError(`${jsonPath} must not be a symbolic link`);
  }
  const raw = readFileSync(jsonPath);
  if (raw.byteLength > PORTABLE_CAPS.maxJsonBytes) {
    throw new CliError(
      `site.json is ${raw.byteLength} bytes, over the ${PORTABLE_CAPS.maxJsonBytes} byte cap`,
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch (error) {
    throw new CliError(`site.json is not valid JSON: ${(error as Error).message}`);
  }
  try {
    const assets = isDir
      ? readBoundedLocalFiles(join(resolved, "assets"), {
          maxFiles: PORTABLE_CAPS.maxAssets,
          maxSingleBytes: PORTABLE_CAPS.maxSingleAssetBytes,
          maxTotalBytes: PORTABLE_CAPS.maxBundleBytes,
        })
      : { files: {}, totalBytes: 0 };
    const fonts = isDir
      ? readBoundedLocalFiles(join(resolved, "fonts"), {
          maxFiles: PORTABLE_CAPS.maxAssets,
          maxSingleBytes: PORTABLE_CAPS.maxSingleAssetBytes,
          maxTotalBytes: PORTABLE_CAPS.maxBundleBytes - assets.totalBytes,
        })
      : { files: {}, totalBytes: 0 };
    return { payload, dir: isDir ? resolved : null, assetFiles: assets.files, fontFiles: fonts.files };
  } catch (error) {
    throw new CliError((error as Error).message);
  }
}

function reportCounts(report: SiteKitReport) {
  const errors = report.issues.filter((issue) => issue.level === "error").length;
  return { errors, warnings: report.issues.length - errors };
}

function printReport(report: SiteKitReport, output: Output): void {
  for (const issue of report.issues) {
    output.stdout(
      `  ${issue.level === "error" ? "ERROR" : "warn "}  ${issue.path}: ${issue.message}`,
    );
  }
  const { errors, warnings } = reportCounts(report);
  output.stdout(
    report.ok
      ? `OK: 0 errors, ${warnings} warning(s)`
      : `INVALID: ${errors} error(s), ${warnings} warning(s)`,
  );
}

function json(output: Output, value: unknown): void {
  output.stdout(JSON.stringify(value));
}

function shellArg(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function requiredTarget(command: string, target: string | undefined): string {
  if (!target) throw new CliError(`site ${command} requires a target`);
  return target;
}

function runDoctor(asJson: boolean, output: Output): number {
  const versions = installedVersions();
  const result = {
    ok: true,
    command: "site doctor",
    cli: { package: "@snabbsajt/cli", version: versions.cli },
    siteKit: { package: "@snabbsajt/site-kit", version: versions.siteKit },
    portableFormat: { format: PORTABLE_FORMAT, version: PORTABLE_VERSION },
    importReport: { format: IMPORT_REPORT_FORMAT, version: IMPORT_REPORT_FORMAT_VERSION },
    skills: { supportedManifestVersion: 1, installed: false },
  } as const;
  if (asJson) json(output, result);
  else {
    output.stdout(`CLI: ${result.cli.package} ${result.cli.version}`);
    output.stdout(`Site Kit: ${result.siteKit.package} ${result.siteKit.version}`);
    output.stdout(`Portable format: ${result.portableFormat.format} v${result.portableFormat.version}`);
    output.stdout(`Import report: ${result.importReport.format} v${result.importReport.version}`);
    output.stdout("Skills: bundled skill assets available; no skills installed in this project");
  }
  return 0;
}

function runInit(target: string, args: string[], asJson: boolean, output: Output): number {
  const templateIndex = args.indexOf("--template");
  const template = (templateIndex >= 0 ? args[templateIndex + 1] : "nextjs") as StarterTemplate;
  if (template !== "nextjs" && template !== "html") {
    throw new CliError(`unknown template "${template}"; use nextjs or html`);
  }
  const dir = resolve(target);
  if (existsSync(dir)) {
    if (lstatSync(dir).isSymbolicLink()) {
      throw new CliError(`${dir} must be a real directory, not a symbolic link`);
    }
    if (!statSync(dir).isDirectory()) throw new CliError(`${dir} is not a directory`);
    if (readdirSync(dir).length > 0) throw new CliError(`${dir} is not empty`);
  }
  mkdirSync(join(dir, "assets"), { recursive: true });
  mkdirSync(join(dir, "fonts"), { recursive: true });
  writeFileSync(join(dir, "site.json"), `${JSON.stringify(createStarterSite(template), null, 2)}\n`);
  writeFileSync(
    join(dir, "README.md"),
    `# SnabbSajt site package\n\nSource template: ${template}\n\n1. Replace the example content in \`site.json\`.\n2. Put referenced images in \`assets/<exportId>.<ext>\`.\n3. Run \`snabbsajt site validate .\`.\n4. Run \`snabbsajt site pack . -o site.zip\`.\n5. Import the zip in SnabbSajt under Settings > Backup & move.\n`,
  );
  if (asJson) json(output, { ok: true, command: "site init", directory: dir, template });
  else output.stdout(`created ${dir}`);
  return 0;
}

const IMPORT_MARKER_NAMES = [
  "import-provenance.json",
  "REVIEW-DRAFT.md",
  "evidence.json",
  "import-report.md",
  "import-report.original.json",
] as const;

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertAdditiveAiReport(original: ImportReportV1, candidate: ImportReportV1): void {
  for (const key of ["format", "revision", "adapter", "sourceInputs", "detectedPlatform", "timestamps", "requiredVersions"] as const) {
    if (!sameJson(original[key], candidate[key])) throw new CliError("deterministic import report metadata must remain unchanged");
  }
  if (candidate.status !== original.status) throw new CliError("the agent must not change import report status");
  const candidateEvidence = new Map(candidate.evidence.map((item) => [item.id, item]));
  if (candidate.evidence.length !== original.evidence.length || original.evidence.some((item) => !sameJson(item, candidateEvidence.get(item.id)))) {
    throw new CliError("deterministic import evidence must remain unchanged");
  }
  const originalItems = new Map(original.items.map((item) => [item.id, item]));
  const candidateItems = new Map(candidate.items.map((item) => [item.id, item]));
  if (original.items.some((item) => !sameJson(item, candidateItems.get(item.id)))) {
    throw new CliError("deterministic import findings must remain unchanged");
  }
  const additions = candidate.items.filter((item) => !originalItems.has(item.id));
  if (additions.some((item) => item.disposition !== "ai_proposed" || item.resolution !== undefined)) {
    throw new CliError("agent report additions must be unresolved ai_proposed findings");
  }
}

function importReportFor(directory: string, options: { allowReviewedSiteChanges?: boolean; allowAdditiveAiReport?: boolean } = {}): ImportReportV1 | null {
  const path = join(directory, "import-report.json");
  const provenancePath = join(directory, "import-provenance.json");
  if (!existsSync(path)) {
    if (IMPORT_MARKER_NAMES.some((name) => existsSync(join(directory, name)))) {
      throw new CliError("import-report.json is missing from an imported package; packing cannot bypass its review state");
    }
    return null;
  }
  if (lstatSync(path).isSymbolicLink()) throw new CliError(`${path} must not be a symbolic link`);
  const raw = readBoundedFile(path, PORTABLE_CAPS.maxJsonBytes);
  let report: unknown;
  try { report = JSON.parse(raw.toString("utf8")); } catch { throw new CliError(`${path} is not valid JSON`); }
  const validation = validateImportReport(report);
  if (!validation.ok) throw new CliError(`${path} is invalid: ${validation.issues[0]?.path} ${validation.issues[0]?.message}`);
  if (!existsSync(provenancePath)) throw new CliError("import-provenance.json is missing; imported package provenance cannot be verified");
  if (lstatSync(provenancePath).isSymbolicLink()) throw new CliError(`${provenancePath} must not be a symbolic link`);
  let provenance: { revision?: string; status?: string; siteSha256?: string; reportSha256?: string; originalReportSha256?: string; approvedAt?: string };
  try { provenance = JSON.parse(readBoundedFile(provenancePath, PORTABLE_CAPS.maxJsonBytes).toString("utf8")); } catch { throw new CliError(`${provenancePath} is not valid JSON`); }
  const digest = (file: string) => createHash("sha256").update(readBoundedFile(file, PORTABLE_CAPS.maxJsonBytes)).digest("hex");
  if (provenance.revision !== "snabbsajt.import-provenance/v1" || provenance.status !== (report as { status: string }).status) {
    throw new CliError("import provenance does not match the report status");
  }
  const currentReportMatches = provenance.reportSha256 === digest(path);
  if (options.allowAdditiveAiReport) {
    const originalPath = join(directory, "import-report.original.json");
    if (!existsSync(originalPath)) {
      throw new CliError("original deterministic import report is missing or does not match provenance");
    }
    const originalDigest = digest(originalPath);
    if (provenance.originalReportSha256 !== originalDigest && provenance.reportSha256 !== originalDigest) {
      throw new CliError("original deterministic import report is missing or does not match provenance");
    }
    let original: unknown;
    try { original = JSON.parse(readBoundedFile(originalPath, PORTABLE_CAPS.maxJsonBytes).toString("utf8")); } catch { throw new CliError(`${originalPath} is not valid JSON`); }
    const originalValidation = validateImportReport(original);
    if (!originalValidation.ok) throw new CliError(`${originalPath} is invalid`);
    assertAdditiveAiReport(original as ImportReportV1, report as ImportReportV1);
  } else if (!currentReportMatches) {
    throw new CliError("site.json or import-report.json changed after conversion; regenerate or intentionally approve the reviewed candidate");
  }
  if (!options.allowReviewedSiteChanges && provenance.siteSha256 !== digest(join(directory, "site.json"))) {
    throw new CliError("site.json or import-report.json changed after conversion; regenerate or intentionally update import provenance after review");
  }
  return report as ImportReportV1;
}

function approveImport(directoryInput: string, args: string[], asJson: boolean, output: Output): number {
  if (args.length !== 1 || args[0] !== "--yes") {
    throw new CliError("site import approve requires <package-dir> --yes after you review import-report.md");
  }
  const loaded = loadPackage(directoryInput);
  if (!loaded.dir) throw new CliError("site import approve needs a package directory");
  const siteValidation = validateSitePackage(loaded.payload, {
    assetFileNames: new Set(Object.keys(loaded.assetFiles)),
    fontFileNames: new Set(Object.keys(loaded.fontFiles)),
  });
  if (!siteValidation.ok) throw new CliError("reviewed site package is invalid; run site validate and fix every error first");
  const report = importReportFor(loaded.dir, { allowReviewedSiteChanges: true, allowAdditiveAiReport: true });
  if (!report) throw new CliError("site import approve only works on an HTML import package");
  if (report.status === "blocked" || report.items.some((item) => item.blocking)) {
    throw new CliError("blocked imports cannot be approved; re-import after resolving the blocking loss");
  }
  const resolvedAt = new Date().toISOString();
  const reviewDispositions = new Set(["manual", "missing", "unsafe", "ai_proposed"]);
  const approved: ImportReportV1 = {
    ...report,
    status: "ready",
    items: report.items.map((item) => reviewDispositions.has(item.disposition) && !item.resolution
      ? { ...item, resolution: { status: "accepted" as const, note: "Accepted after explicit local review", resolvedAt } }
      : item),
  };
  const accepted = approved.items.filter((item) => item.resolution?.resolvedAt === resolvedAt).length;
  const reportValidation = validateImportReport(approved);
  if (!reportValidation.ok) throw new CliError(`approved report is invalid: ${reportValidation.issues[0]?.path} ${reportValidation.issues[0]?.message}`);
  const reportJson = normalizeImportReportJson(approved);
  const siteJson = readBoundedFile(join(loaded.dir, "site.json"), PORTABLE_CAPS.maxJsonBytes);
  const originalPath = join(loaded.dir, "import-report.original.json");
  const originalReportSha256 = existsSync(originalPath)
    ? createHash("sha256").update(readBoundedFile(originalPath, PORTABLE_CAPS.maxJsonBytes)).digest("hex")
    : undefined;
  writeFileSync(join(loaded.dir, "import-report.json"), reportJson);
  writeFileSync(join(loaded.dir, "import-report.md"), renderImportReportMarkdown(approved));
  writeFileSync(join(loaded.dir, "import-provenance.json"), `${JSON.stringify({
    revision: "snabbsajt.import-provenance/v1",
    status: "ready",
    siteSha256: createHash("sha256").update(siteJson).digest("hex"),
    reportSha256: createHash("sha256").update(reportJson).digest("hex"),
    ...(originalReportSha256 ? { originalReportSha256 } : {}),
    approvedAt: resolvedAt,
  }, null, 2)}\n`);
  const marker = join(loaded.dir, "REVIEW-DRAFT.md");
  if (existsSync(marker)) unlinkSync(marker);
  if (asJson) json(output, { ok: true, command: "site import approve", directory: loaded.dir, status: "ready", publishReady: true, accepted });
  else {
    output.stdout(`approved ${loaded.dir}`);
    output.stdout(`Import status: ready; publish-ready: yes; accepted review findings: ${accepted}`);
    output.stdout(`Next: snabbsajt site pack ${shellArg(loaded.dir)}`);
  }
  return 0;
}

function emitValidation(
  command: "validate" | "pack",
  report: SiteKitReport,
  asJson: boolean,
  output: Output,
): number {
  if (asJson) {
    json(output, {
      ok: report.ok,
      command: `site ${command}`,
      ...reportCounts(report),
      issues: report.issues,
    });
  } else {
    printReport(report, output);
  }
  return report.ok ? 0 : 1;
}

export async function runSiteCommand(
  rawArgs: string[],
  output: Output = { stdout: console.log, stderr: console.error },
): Promise<number> {
  const asJson = rawArgs.includes("--json");
  const args = rawArgs.filter((arg) => arg !== "--json");
  const [command, target, ...rest] = args;
  try {
    if (command === "doctor") return runDoctor(asJson, output);
    if (command === "init") return runInit(requiredTarget(command, target), rest, asJson, output);
    if (command === "import") {
      if (target === "--help" || target === "-h") {
        output.stdout("Usage: snabbsajt site import html <url|file.html|site.zip> [-o package-dir] [--json]");
        output.stdout("       snabbsajt site import approve <package-dir> --yes [--json]");
        return 0;
      }
      if (target === "approve") {
        if (rest.includes("--help") || rest.includes("-h")) {
          output.stdout("Usage: snabbsajt site import approve <package-dir> --yes [--json]");
          output.stdout("Review import-report.md first. Blocked or invalid imports cannot be approved.");
          return 0;
        }
        const directory = rest.shift();
        if (!directory) throw new CliError("site import approve requires a package directory");
        return approveImport(directory, rest, asJson, output);
      }
      if (target !== "html") throw new CliError(`unknown site import adapter "${target ?? ""}"`);
      if (rest.includes("--help") || rest.includes("-h")) {
        output.stdout("Usage: snabbsajt site import html <url|file.html|site.zip> [-o package-dir] [--json]");
        output.stdout("Review import-report.md, edit site.json if needed, then run: snabbsajt site import approve <package-dir> --yes");
        return 0;
      }
      const parsed = parseImportHtmlArgs(rest);
      const input = parsed.input;
      const outputDirectory = parsed.outputDirectory
        ? parsed.outputDirectory
        : `${basename(input).replace(/\.(?:html?|zip)$/i, "") || "import"}-snabbsajt`;
      const result = await importHtmlToDirectory(input, outputDirectory, installedVersions().cli);
      const counts = reportCounts(result.validation);
      const response = {
        ok: result.validation.ok,
        command: "site import html",
        directory: result.directory,
        status: result.report.status,
        publishReady: result.report.status === "ready" && result.validation.ok,
        pages: result.site.pages.length,
        sections: result.site.sections.length,
        ...counts,
        issues: result.validation.issues,
      };
      if (asJson) json(output, response);
      else {
        output.stdout(`created ${result.directory}`);
        output.stdout(`Import status: ${result.report.status}; publish-ready: ${response.publishReady ? "yes" : "no"}`);
        output.stdout(`Imported: ${response.pages} page(s), ${response.sections} section(s), ${result.site.assets.length} asset(s)`);
        output.stdout(`Review: ${join(result.directory, "import-report.md")}`);
        output.stdout(`Next: snabbsajt site import approve ${shellArg(result.directory)} --yes`);
        output.stdout("Schema validation:");
        printReport(result.validation, output);
      }
      return result.validation.ok ? 0 : 1;
    }
    if (command !== "inspect" && command !== "validate" && command !== "pack") {
      throw new CliError(`unknown site command "${command ?? ""}"`);
    }
    if (command === "pack" && (target === "--help" || target === "-h" || rest.includes("--help") || rest.includes("-h"))) {
      output.stdout("Usage: snabbsajt site pack <dir> [-o bundle.zip] [--review-draft] [--json]");
      output.stdout("Unresolved imports require --review-draft. Review drafts are not importable or publish-ready.");
      return 0;
    }
    if (command !== "pack" && rest.length > 0) throw new CliError(`site ${command} does not accept extra arguments`);
    const packOptions = command === "pack" ? parsePackArgs(rest) : undefined;

    const loaded = loadPackage(requiredTarget(command, target));
    const report = validateSitePackage(loaded.payload, {
      assetFileNames: loaded.dir ? new Set(Object.keys(loaded.assetFiles)) : undefined,
      fontFileNames: loaded.dir ? new Set(Object.keys(loaded.fontFiles)) : undefined,
    });
    if (command === "inspect") {
      if (!report.ok) {
        if (asJson) {
          json(output, { ok: false, command: "site inspect", ...reportCounts(report), issues: report.issues });
        } else printReport(report, output);
        return 1;
      }
      const site = loaded.payload as PortableSiteV1;
      const summary = {
        ok: true,
        command: "site inspect",
        businessName: site.site.businessName,
        language: site.site.language,
        pages: site.pages.length,
        sections: site.sections.length,
        assets: site.assets.length,
        sectionTypes: [...new Set(site.sections.map((section) => section.type))],
      } as const;
      if (asJson) json(output, summary);
      else {
        const { ok: _ok, command: _command, ...legacySummary } = summary;
        output.stdout(JSON.stringify(legacySummary, null, 2));
      }
      return 0;
    }

    if (command === "validate" || !report.ok) {
      const validationExit = emitValidation(command, report, asJson, output);
      if (validationExit !== 0 || command === "validate") return validationExit;
    } else if (!asJson) {
      printReport(report, output);
    }
    if (!loaded.dir) throw new CliError("pack needs a package directory");
    const importReport = importReportFor(loaded.dir);
    const reviewDraft = packOptions!.reviewDraft;
    if (reviewDraft && !importReport) throw new CliError("--review-draft is only valid for a package with an unresolved import report");
    if (reviewDraft && importReport?.status === "ready") throw new CliError("import report is ready; pack without --review-draft");
    if (importReport && importReport.status !== "ready" && !reviewDraft) {
      throw new CliError(`import report status is ${importReport.status}; resolve review items or explicitly pass --review-draft`);
    }
    const outPath = resolve(
      packOptions!.outputPath
        ? packOptions!.outputPath
        : `${basename(loaded.dir)}-${importReport && importReport.status !== "ready" ? "review-draft" : "bundle"}.zip`,
    );
    const reviewFiles = importReport && importReport.status !== "ready"
      ? Object.fromEntries(REVIEW_ARTIFACT_NAMES.flatMap((name) => {
          const path = join(loaded.dir!, name);
          return existsSync(path) ? [[name, readBoundedFile(path, PORTABLE_CAPS.maxJsonBytes)]] : [];
        }))
      : undefined;
    const result = await packSitePackage({
      site: loaded.payload as PortableSiteV1,
      assetFiles: loaded.assetFiles,
      fontFiles: loaded.fontFiles,
      ...(importReport && importReport.status !== "ready" ? {
        reviewDraft: { reportStatus: importReport.status, acknowledgedAt: new Date().toISOString(), files: reviewFiles },
      } : {}),
    });
    writeFileSync(outPath, result.zip);
    if (asJson) {
      json(output, {
        ok: true,
        command: "site pack",
        output: outPath,
        bytes: result.zip.byteLength,
        missing: result.missing,
        reviewDraft: Boolean(importReport && importReport.status !== "ready"),
        publishReady: !(importReport && importReport.status !== "ready"),
      });
    } else {
      output.stdout(`wrote ${outPath} (${result.zip.byteLength} bytes)`);
      if (importReport && importReport.status !== "ready") output.stdout("REVIEW DRAFT: this bundle is not publish-ready");
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const commandName = command === "import" && target ? `site import ${target}` : `site ${command ?? ""}`.trim();
    if (asJson) json(output, { ok: false, command: commandName, error: message });
    else output.stderr(`snabbsajt: ${message}`);
    return 1;
  }
}
