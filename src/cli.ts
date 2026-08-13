#!/usr/bin/env node

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import type { PortableSiteV1 } from "./convex/model/portable";
import { PORTABLE_CAPS } from "./lib/portability/caps";
import { packSitePackage } from "./lib/site-kit/pack";
import { readBoundedLocalFiles } from "./lib/site-kit/localFiles";
import { validateSitePackage, type SiteKitReport } from "./lib/site-kit/validate";
import { createStarterSite, type StarterTemplate } from "./starter";
import {
  measureDirectory,
  measureFragment,
  measureUrl,
  motionFrom,
  type MeasureResult,
} from "./import/measure";

function fail(message: string): never {
  console.error(`site-kit: ${message}`);
  process.exit(1);
}

function usage(exitCode = 0): never {
  console.log(`SnabbSajt Site Kit

Usage:
  site-kit init <dir> [--template nextjs|html]
  site-kit validate <site.json|dir>
  site-kit inspect <site.json|dir>
  site-kit pack <dir> [-o bundle.zip]
  site-kit measure <url|dir> [-o fragment.json]

No API key is required. Commands run locally.
\`measure\` renders the page in a real browser and prints the measured design as
a site.json fragment; it needs playwright (npm i -D playwright).`);
  process.exit(exitCode);
}

function loadPackage(target: string) {
  const resolved = resolve(target);
  if (!existsSync(resolved)) fail(`${target} does not exist`);
  if (lstatSync(resolved).isSymbolicLink()) fail(`${target} must not be a symbolic link`);
  const isDir = statSync(resolved).isDirectory();
  const jsonPath = isDir ? join(resolved, "site.json") : resolved;
  if (!existsSync(jsonPath)) fail(`${jsonPath} not found`);
  if (lstatSync(jsonPath).isSymbolicLink()) {
    fail(`${jsonPath} must not be a symbolic link`);
  }
  const raw = readFileSync(jsonPath);
  if (raw.byteLength > PORTABLE_CAPS.maxJsonBytes) {
    fail(`site.json is ${raw.byteLength} bytes, over the ${PORTABLE_CAPS.maxJsonBytes} byte cap`);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch (error) {
    fail(`site.json is not valid JSON: ${(error as Error).message}`);
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
    fail((error as Error).message);
  }
}

function printReport(report: SiteKitReport): void {
  for (const issue of report.issues) {
    console.log(`  ${issue.level === "error" ? "ERROR" : "warn "}  ${issue.path}: ${issue.message}`);
  }
  const errors = report.issues.filter((issue) => issue.level === "error").length;
  const warnings = report.issues.length - errors;
  console.log(report.ok ? `OK: 0 errors, ${warnings} warning(s)` : `INVALID: ${errors} error(s), ${warnings} warning(s)`);
}

function init(target: string, rest: string[]): void {
  const templateIndex = rest.indexOf("--template");
  const template = (templateIndex >= 0 ? rest[templateIndex + 1] : "nextjs") as StarterTemplate;
  if (template !== "nextjs" && template !== "html") {
    fail(`unknown template "${template}"; use nextjs or html`);
  }
  const dir = resolve(target);
  if (existsSync(dir)) {
    if (lstatSync(dir).isSymbolicLink()) fail(`${dir} must be a real directory, not a symbolic link`);
    if (!statSync(dir).isDirectory()) fail(`${dir} is not a directory`);
    if (readdirSync(dir).length > 0) fail(`${dir} is not empty`);
  }
  mkdirSync(join(dir, "assets"), { recursive: true });
  mkdirSync(join(dir, "fonts"), { recursive: true });
  writeFileSync(join(dir, "site.json"), `${JSON.stringify(createStarterSite(template), null, 2)}\n`);
  writeFileSync(
    join(dir, "README.md"),
    `# SnabbSajt site package\n\nSource template: ${template}\n\n1. Replace the example content in \`site.json\`.\n2. Put referenced images in \`assets/<exportId>.<ext>\`.\n3. Run \`site-kit validate .\`.\n4. Run \`site-kit pack . -o site.zip\`.\n5. Import the zip in SnabbSajt under Settings > Backup & move.\n`,
  );
  console.log(`created ${dir}`);
}

/**
 * Measure a page and print what an author pastes into `site.json`.
 *
 * A URL is rendered directly. A directory is served on loopback first, which
 * is not the app's "an archive has no live address" case: these are the
 * developer's own files, on their own machine, and the server binds to
 * 127.0.0.1 and dies with the command.
 *
 * The motion pass is separate from the design pass because it reads the page's
 * SOURCE - it parses the scripts, and never runs them - so it works from the
 * markup we already fetched rather than from the render.
 */
async function measure(target: string, rest: string[]): Promise<void> {
  const isUrl = /^https?:\/\//i.test(target);
  let result: MeasureResult;
  try {
    result = isUrl
      ? { url: target, sample: await measureUrl(target) }
      : await measureDirectory(target);
  } catch (error) {
    fail((error as Error).message);
  }
  // Motion, from the page's own markup. Best-effort in both lanes: a page we
  // could measure but not re-read is still worth its design numbers.
  try {
    const html = isUrl
      ? await (await fetch(target)).text()
      : readFileSync(join(resolve(target), "index.html"), "utf8");
    const motion = motionFrom(html);
    if (motion) result = { ...result, motion };
  } catch {
    /* the design measurement is the deliverable; motion is a bonus */
  }
  const fragment = measureFragment(result);
  const outIndex = rest.indexOf("-o");
  const json = `${JSON.stringify(fragment, null, 2)}\n`;
  if (outIndex >= 0 && rest[outIndex + 1]) {
    writeFileSync(resolve(rest[outIndex + 1]), json);
    console.log(`wrote ${resolve(rest[outIndex + 1])}`);
    return;
  }
  console.log(json.trimEnd());
}

async function main(): Promise<void> {
  const [command, target, ...rest] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") usage();
  if (!target) usage(1);
  if (command === "init") {
    init(target, rest);
    return;
  }
  if (command === "measure") {
    await measure(target, rest);
    return;
  }
  if (!["validate", "inspect", "pack"].includes(command)) usage(1);

  const loaded = loadPackage(target);
  const report = validateSitePackage(loaded.payload, {
    assetFileNames: loaded.dir ? new Set(Object.keys(loaded.assetFiles)) : undefined,
    fontFileNames: loaded.dir ? new Set(Object.keys(loaded.fontFiles)) : undefined,
  });
  if (command === "inspect") {
    if (!report.ok) {
      printReport(report);
      process.exit(1);
    }
    const site = loaded.payload as PortableSiteV1;
    console.log(JSON.stringify({
      businessName: site.site.businessName,
      language: site.site.language,
      pages: site.pages.length,
      sections: site.sections.length,
      assets: site.assets.length,
      sectionTypes: [...new Set(site.sections.map((section) => section.type))],
    }, null, 2));
    return;
  }
  printReport(report);
  if (!report.ok) process.exit(1);
  if (command === "validate") return;
  if (!loaded.dir) fail("pack needs a package directory");
  const outIndex = rest.indexOf("-o");
  const outPath = resolve(outIndex >= 0 && rest[outIndex + 1] ? rest[outIndex + 1] : `${basename(loaded.dir)}-bundle.zip`);
  const result = await packSitePackage({
    site: loaded.payload as PortableSiteV1,
    assetFiles: loaded.assetFiles,
    fontFiles: loaded.fontFiles,
  });
  writeFileSync(outPath, result.zip);
  console.log(`wrote ${outPath} (${result.zip.byteLength} bytes)`);
}

void main();
