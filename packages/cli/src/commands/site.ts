import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  IMPORT_REPORT_FORMAT,
  IMPORT_REPORT_FORMAT_VERSION,
  PORTABLE_CAPS,
  PORTABLE_FORMAT,
  PORTABLE_VERSION,
  createStarterSite,
  packSitePackage,
  validateSitePackage,
  type PortableSiteV1,
  type SiteKitReport,
  type StarterTemplate,
} from "@snabbsajt/site-kit";
import { readBoundedLocalFiles } from "@snabbsajt/site-kit/local-files";

type Output = {
  stdout(message: string): void;
  stderr(message: string): void;
};

class CliError extends Error {}

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
    output.stdout("Skills: manifest v1 supported; no bundled skills installed");
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
    if (command !== "inspect" && command !== "validate" && command !== "pack") {
      throw new CliError(`unknown site command "${command ?? ""}"`);
    }

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
    const outIndex = rest.indexOf("-o");
    const outPath = resolve(
      outIndex >= 0 && rest[outIndex + 1]
        ? rest[outIndex + 1]
        : `${basename(loaded.dir)}-bundle.zip`,
    );
    const result = await packSitePackage({
      site: loaded.payload as PortableSiteV1,
      assetFiles: loaded.assetFiles,
      fontFiles: loaded.fontFiles,
    });
    writeFileSync(outPath, result.zip);
    if (asJson) {
      json(output, {
        ok: true,
        command: "site pack",
        output: outPath,
        bytes: result.zip.byteLength,
        missing: result.missing,
      });
    } else output.stdout(`wrote ${outPath} (${result.zip.byteLength} bytes)`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (asJson) json(output, { ok: false, command: `site ${command ?? ""}`.trim(), error: message });
    else output.stderr(`snabbsajt: ${message}`);
    return 1;
  }
}
