/**
 * Generate `src/mirror/**` from the canonical app importer.
 *
 * WHY THIS EXISTS. The app (`HH-Studio/simple-site-builder`) owns the section
 * mapper: `lib/import/htmlToSections.ts` and its detectors read a page's real
 * structure and emit 34 of the registry's 43 section types. The SDK used to
 * carry its OWN mapper, which emitted a fixed hero → rich-text → footer per
 * page and never read the source — so `snabbsajt site import html` converted a
 * nine-block page into three sections while the in-app importer converted the
 * same page properly. Two mappers, one product, and the CLI was the bad one.
 *
 * Rather than hand-copy 13 000 lines and watch them drift, this script COPIES
 * them, rewrites their import specifiers onto the mirrors the SDK already
 * carries, and records a per-file digest. `--check` fails when a mirrored file
 * has been edited in place; `--check-app <appRoot>` fails when the app has
 * moved on. The mirror is generated output: never edit `src/mirror/**` by hand.
 *
 *   bun scripts/mirror-import.ts --sync-from-app ../..
 *   bun scripts/mirror-import.ts --check
 *   bun scripts/mirror-import.ts --check-app ../..
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MIRROR_ROOT = new URL("../src/mirror/", import.meta.url);
const PROVENANCE_URL = new URL("../src/mirror/app-source.json", import.meta.url);
const CANONICAL_REPOSITORY = "HH-Studio/simple-site-builder";

/**
 * The app modules the mirror carries, app-repo-relative. This is the transitive
 * closure of `lib/import/htmlToSections.ts` MINUS everything the SDK already
 * mirrors under `src/lib` and `src/convex/model` (see `MIRRORED_BY_SDK`), which
 * keeps exactly one `SECTION_REGISTRY`, one theme model and one portable schema
 * in the package.
 */
const FILES = [
  "convex/model/serviceSuggestions.ts",
  "lib/booking/embed.ts",
  "lib/brand.ts",
  "lib/external/localBusiness.ts",
  "lib/html/entities.ts",
  "lib/import/designExtract.ts",
  "lib/import/htmlToSections.ts",
  "lib/import/imageCandidates.ts",
  "lib/import/importActions.ts",
  "lib/import/layoutObserve.ts",
  "lib/import/measureSource.ts",
  "lib/import/motionExtract.ts",
  "lib/import/objectLiteral.ts",
  "lib/import/sampleComputedStyles.ts",
  "lib/import/structureDetect.ts",
  "lib/net/url.ts",
  "lib/scrape/bokadirekt.ts",
  "lib/scrape/classifyPlatform.ts",
  "lib/scrape/classifyVertical.ts",
  "lib/scrape/detectCommerce.ts",
  "lib/scrape/jsonLdHours.ts",
  "lib/scrape/parse.ts",
  "lib/sections/layoutShape.ts",
  "lib/sections/limits.ts",
  "lib/sections/openingHours.ts",
  "lib/socials.ts",
  "lib/tracking.ts",
  // The importer started reading the document table on 2026-08-18 (a menu
  // written in Word), which put this leaf module on the mirror's import graph.
  // Pure data plus predicates, no runtime of its own.
  "lib/uploads/documentTypes.ts",
  "lib/html/attributes.ts",
  "lib/import/sectionProposal.ts",
] as const;

/**
 * App module → the SDK module that already mirrors it. A mirrored file
 * importing one of these is rewritten to point at the SDK's copy, so the
 * package never ends up with two section registries or two portable schemas.
 */
const MIRRORED_BY_SDK: Record<string, string> = {
  "convex/model/business.ts": "src/convex/model/business.ts",
  "convex/model/content.ts": "src/convex/model/content.ts",
  "convex/model/fonts.ts": "src/convex/model/fonts.ts",
  "convex/model/jobOpening.ts": "src/convex/model/jobOpening.ts",
  "convex/model/navigation.ts": "src/convex/model/navigation.ts",
  "convex/model/portable.ts": "src/convex/model/portable.ts",
  "convex/model/restaurantMenu.ts": "src/convex/model/restaurantMenu.ts",
  "convex/model/sections.ts": "src/convex/model/sections.ts",
  "convex/model/slotStyle.ts": "src/convex/model/slotStyle.ts",
  "convex/model/snapshot.ts": "src/convex/model/snapshot.ts",
  "convex/model/theme.ts": "src/convex/model/theme.ts",
  "convex/model/tracking.ts": "src/convex/model/tracking.ts",
  "convex/model/visitorAssistant.ts": "src/convex/model/visitorAssistant.ts",
  "lib/appearance/logoImage.ts": "src/lib/appearance/logoImage.ts",
  "lib/content/contentTypes.ts": "src/lib/content/contentTypes.ts",
  "lib/editor/fractionalIndex.ts": "src/lib/editor/fractionalIndex.ts",
  "lib/fonts/google.ts": "src/lib/fonts/google.ts",
  "lib/i18n.ts": "src/lib/i18n.ts",
  "lib/i18n/site-locales.ts": "src/lib/i18n/site-locales.ts",
  "lib/palettes.ts": "src/lib/palettes.ts",
  "lib/portability/caps.ts": "src/lib/portability/caps.ts",
  "lib/restaurant/menu.ts": "src/lib/restaurant/menu.ts",
  "lib/sections/illustration.ts": "src/lib/sections/illustration.ts",
  "lib/sections/newsletterDefaults.ts": "src/lib/sections/newsletterDefaults.ts",
  "lib/sections/registry.ts": "src/lib/sections/registry.ts",
  "lib/sections/siteIcons.ts": "src/lib/sections/siteIcons.ts",
  "lib/sections/theme.ts": "src/lib/sections/theme.ts",
  "lib/site/jobs.ts": "src/lib/site/jobs.ts",
  "lib/site/news.ts": "src/lib/site/news.ts",
  "lib/site/redirects.ts": "src/lib/site/redirects.ts",
};

type Provenance = {
  repository: string;
  commit: string;
  files: Record<string, { appSha256: string; mirrorSha256: string }>;
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function canonicalJson(value: unknown): string {
  const sort = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sort);
    if (input === null || typeof input !== "object") return input;
    const object = input as Record<string, unknown>;
    return Object.fromEntries(Object.keys(object).sort().map((key) => [key, sort(object[key])]));
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

/** Resolve an import specifier written inside `appFile` to an app-repo path. */
function resolveAppSpecifier(appFile: string, specifier: string, appRoot: string): string | null {
  const raw = specifier.startsWith("@/")
    ? specifier.slice(2)
    : specifier.startsWith(".")
      ? posix.normalize(posix.join(posix.dirname(appFile), specifier))
      : null;
  if (raw === null) return null;
  for (const candidate of [`${raw}.ts`, `${raw}.tsx`, `${raw}/index.ts`]) {
    if (existsSync(resolve(appRoot, candidate))) return candidate;
  }
  throw new Error(`${appFile}: cannot resolve "${specifier}"`);
}

/** Where a mirrored app file lands inside the SDK, SDK-root-relative. */
const mirrorTarget = (appFile: string) => `src/mirror/${appFile}`;

function rewriteSpecifier(appFile: string, specifier: string, appRoot: string): string {
  const target = resolveAppSpecifier(appFile, specifier, appRoot);
  if (target === null) return specifier; // a package import — left alone
  const destination = FILES.includes(target as (typeof FILES)[number])
    ? mirrorTarget(target)
    : MIRRORED_BY_SDK[target];
  if (!destination) {
    throw new Error(
      `${appFile} imports "${specifier}" (${target}), which is neither mirrored nor carried by the SDK. ` +
        "Add it to FILES or to MIRRORED_BY_SDK.",
    );
  }
  const from = posix.dirname(mirrorTarget(appFile));
  const relativePath = posix.relative(from, destination).replace(/\.tsx?$/, "");
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

const HEADER = (appFile: string) =>
  `// GENERATED by scripts/mirror-import.ts from ${CANONICAL_REPOSITORY}:${appFile}\n` +
  `// Do not edit. Run \`bun scripts/mirror-import.ts --sync-from-app <appRoot>\`.\n`;

function renderMirror(appFile: string, source: string, appRoot: string): string {
  const rewritten = source.replace(
    /((?:^|\n)\s*(?:import|export)\b[\s\S]*?\bfrom\s+)(["'])([^"']+)\2/g,
    (match, lead: string, quote: string, specifier: string) =>
      `${lead}${quote}${rewriteSpecifier(appFile, specifier, appRoot)}${quote}`,
  );
  return `${HEADER(appFile)}\n${rewritten}`;
}

function readMirrorFiles(): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (directory: string, prefix: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(directory, entry.name), `${prefix}${entry.name}/`);
      else if (entry.name.endsWith(".ts")) out[`${prefix}${entry.name}`] = readFileSync(join(directory, entry.name), "utf8");
    }
  };
  const root = resolve(MIRROR_ROOT.pathname);
  if (existsSync(root)) walk(root, "");
  return out;
}

function generate(appRoot: string): { files: Record<string, string>; provenance: Provenance } {
  const files: Record<string, string> = {};
  const provenanceFiles: Provenance["files"] = {};
  for (const appFile of FILES) {
    const source = readFileSync(resolve(appRoot, appFile), "utf8");
    const mirrored = renderMirror(appFile, source, appRoot);
    files[appFile] = mirrored;
    provenanceFiles[appFile] = { appSha256: sha256(source), mirrorSha256: sha256(mirrored) };
  }
  const commit = execFileSync("git", ["-C", appRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  return { files, provenance: { repository: CANONICAL_REPOSITORY, commit, files: provenanceFiles } };
}

function readProvenance(): Provenance {
  return JSON.parse(readFileSync(PROVENANCE_URL, "utf8")) as Provenance;
}

/** The mirrored sources on disk still hash to what the generator produced. */
export function verifyMirrorIntegrity(): void {
  const provenance = readProvenance();
  const onDisk = readMirrorFiles();
  const expected = Object.keys(provenance.files).sort();
  const actual = Object.keys(onDisk).sort();
  if (expected.join("|") !== actual.join("|")) {
    throw new Error(`src/mirror has ${actual.length} file(s); provenance records ${expected.length}. Re-sync the mirror.`);
  }
  for (const appFile of expected) {
    if (sha256(onDisk[appFile]!) !== provenance.files[appFile]!.mirrorSha256) {
      throw new Error(`src/mirror/${appFile} was edited by hand. The mirror is generated — change the app and re-sync.`);
    }
  }
}

/** The app has not moved on since the mirror was generated. */
export function verifyAgainstApp(appRoot: string): void {
  const provenance = readProvenance();
  for (const [appFile, digests] of Object.entries(provenance.files)) {
    const source = readFileSync(resolve(appRoot, appFile), "utf8");
    if (sha256(source) !== digests.appSha256) {
      throw new Error(`${appFile} changed in the app since the mirror was generated. Re-sync the mirror.`);
    }
  }
}

function writeMirror(files: Record<string, string>, provenance: Provenance): void {
  const root = resolve(MIRROR_ROOT.pathname);
  rmSync(root, { recursive: true, force: true });
  for (const [appFile, contents] of Object.entries(files)) {
    const destination = join(root, appFile);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, contents);
  }
  writeFileSync(resolve(PROVENANCE_URL.pathname), canonicalJson(provenance));
}

async function main() {
  const syncIndex = process.argv.indexOf("--sync-from-app");
  if (syncIndex >= 0) {
    const appRoot = process.argv[syncIndex + 1];
    if (!appRoot) throw new Error("--sync-from-app requires the app repository path");
    const { files, provenance } = generate(resolve(appRoot));
    writeMirror(files, provenance);
    process.stdout.write(`mirrored ${Object.keys(files).length} file(s) from ${provenance.commit}\n`);
    return;
  }
  const appIndex = process.argv.indexOf("--check-app");
  if (appIndex >= 0) {
    const appRoot = process.argv[appIndex + 1];
    if (!appRoot) throw new Error("--check-app requires the app repository path");
    verifyMirrorIntegrity();
    verifyAgainstApp(resolve(appRoot));
    return;
  }
  if (process.argv.includes("--check")) {
    verifyMirrorIntegrity();
    return;
  }
  process.stdout.write(`${FILES.length} mirrored module(s); pass --sync-from-app, --check or --check-app\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}

export { FILES as MIRRORED_APP_FILES };
