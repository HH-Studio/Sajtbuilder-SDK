// ---------------------------------------------------------------------------
// `snabbsajt site import sanity`: two steps, on purpose.
//
//   1. `--propose` reads the export and the schema and writes
//      `sanity-mapping.json`, then STOPS. Nothing is converted yet.
//   2. `--mapping <file>` converts with the mapping the agency reviewed and
//      committed, and writes an ordinary site package.
//
// The stop in the middle is the feature. A dataset export plus a schema
// directory is not enough to decide, on its own, that `pris` is a number and
// `omrade` is a choice with four options - and getting that wrong quietly, on a
// client's whole content history, is the failure this lane is built to avoid.
// So the tool proposes, a person confirms, and the run after that is
// deterministic and re-runnable.
//
// Nothing in this file executes anything from the source. The schema is read as
// TEXT and the export is read as data.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, join, resolve } from "node:path";
import {
  SANITY_EXPORT_LIMITS,
  mapSanityImport,
  normalizeImportReportJson,
  proposeMapping,
  readSanityExport,
  readSchemaFiles,
  renderImportReportMarkdown,
  validateMapping,
  type SanityDocument,
  type SanityMappingResult,
  type SanitySchemaType,
} from "@snabbsajt/site-kit";

export type ImportSanityResult = SanityMappingResult & { directory: string };

function readBounded(path: string, maxBytes: number): Buffer {
  const resolved = resolve(path);
  if (!existsSync(resolved)) throw new Error(`${path} does not exist`);
  if (lstatSync(resolved).isSymbolicLink() || !statSync(resolved).isFile()) {
    throw new Error(`${path} must be a real file`);
  }
  if (statSync(resolved).size > maxBytes) {
    throw new Error(`${path} is larger than this importer reads in one run`);
  }
  const bytes = readFileSync(resolved);
  if (bytes.byteLength > maxBytes) {
    throw new Error(`${path} changed while it was being read`);
  }
  return bytes;
}

/** Every `.ts` / `.js` file under a schema directory, read as TEXT.
 *
 *  Bounded on count, on size and on depth, and it never follows a symlink: a
 *  schema folder is somebody else's repository, and a link in it pointing at
 *  `~/.ssh` is a file we would otherwise happily read into a report. */
function readSchemaDirectory(
  directory: string,
): { path: string; source: string }[] {
  const root = resolve(directory);
  if (!existsSync(root)) throw new Error(`${directory} does not exist`);
  const out: { path: string; source: string }[] = [];
  const walk = (current: string, depth: number): void => {
    if (depth > 8 || out.length >= SANITY_EXPORT_LIMITS.maxSchemaFiles) return;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (out.length >= SANITY_EXPORT_LIMITS.maxSchemaFiles) return;
      if (entry.isSymbolicLink()) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = extname(entry.name).toLowerCase();
      if (ext !== ".ts" && ext !== ".js" && ext !== ".tsx" && ext !== ".mjs") continue;
      if (statSync(full).size > SANITY_EXPORT_LIMITS.maxSchemaFileBytes) continue;
      out.push({ path: full, source: readFileSync(full, "utf8") });
    }
  };
  if (statSync(root).isDirectory()) walk(root, 0);
  else out.push({ path: root, source: readFileSync(root, "utf8") });
  return out;
}

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

/** Step one: read, propose, stop. */
export function proposeSanityMapping(
  exportPath: string,
  schemaPath: string | undefined,
  mappingPath: string,
): { mappingPath: string; types: number; documents: number; assets: number } {
  const exported = readSanityExport(
    new Uint8Array(readBounded(exportPath, SANITY_EXPORT_LIMITS.maxArchiveBytes)),
  );
  const schema: SanitySchemaType[] = schemaPath
    ? readSchemaFiles(readSchemaDirectory(schemaPath))
    : [];
  const byType = new Map<string, SanityDocument[]>();
  for (const doc of exported.documents.values()) {
    const list = byType.get(doc._type) ?? [];
    list.push(doc);
    byType.set(doc._type, list);
  }
  const mapping = proposeMapping(byType, schema);
  const target = resolve(mappingPath);
  // `wx`: never overwrite a mapping somebody has already corrected. Losing a
  // reviewed artefact to a re-run of the proposal step is the one way this
  // two-step flow could cost more than it saves.
  writeFileSync(target, `${JSON.stringify(mapping, null, 2)}\n`, { flag: "wx" });
  return {
    mappingPath: target,
    types: mapping.types.length,
    documents: exported.documents.size,
    assets: exported.assets.size,
  };
}

/** Step two: convert with a reviewed mapping. */
export function importSanityToDirectory(
  exportPath: string,
  schemaPath: string | undefined,
  mappingPath: string,
  outputDirectory: string,
  businessName: string,
  cliVersion: string,
  options: { locale?: string; language?: "sv" | "en"; now?: string } = {},
): ImportSanityResult {
  const startedAt = options.now ?? new Date().toISOString();
  const exported = readSanityExport(
    new Uint8Array(readBounded(exportPath, SANITY_EXPORT_LIMITS.maxArchiveBytes)),
  );
  const schema: SanitySchemaType[] = schemaPath
    ? readSchemaFiles(readSchemaDirectory(schemaPath))
    : [];
  const parsed: unknown = JSON.parse(
    readBounded(mappingPath, 4 * 1024 * 1024).toString("utf8"),
  );
  const checked = validateMapping(parsed);
  if (!checked.ok || !checked.mapping) {
    throw new Error(
      [
        `${mappingPath} is not a mapping this importer can run:`,
        ...checked.issues.slice(0, 20).map((issue) => `  ${issue.path}: ${issue.message}`),
      ].join("\n"),
    );
  }
  const result = mapSanityImport(exported, schema, checked.mapping, {
    businessName,
    exportLocator: resolve(exportPath),
    ...(schemaPath ? { schemaLocator: resolve(schemaPath) } : {}),
    ...(options.locale ? { locale: options.locale } : {}),
    ...(options.language ? { language: options.language } : {}),
    startedAt,
    completedAt: options.now ?? new Date().toISOString(),
    cliVersion,
  });

  const directory = prepareOutput(outputDirectory);
  const siteJson = `${JSON.stringify(result.site, null, 2)}\n`;
  const reportJson = normalizeImportReportJson(result.report);
  writeFileSync(join(directory, "site.json"), siteJson, { flag: "wx" });
  writeFileSync(
    join(directory, "evidence.json"),
    `${JSON.stringify({ revision: "snabbsajt.evidence/v1", evidence: result.evidence }, null, 2)}\n`,
    { flag: "wx" },
  );
  writeFileSync(join(directory, "import-report.json"), reportJson, { flag: "wx" });
  writeFileSync(join(directory, "import-report.original.json"), reportJson, { flag: "wx" });
  writeFileSync(
    join(directory, "import-report.md"),
    renderImportReportMarkdown(result.report),
    { flag: "wx" },
  );
  writeFileSync(
    join(directory, "validation.json"),
    `${JSON.stringify(result.validation, null, 2)}\n`,
    { flag: "wx" },
  );
  for (const asset of result.assetFiles) {
    writeFileSync(join(directory, "assets", asset.fileName), asset.bytes, { flag: "wx" });
  }
  // More than 200 pictures, so one import cannot take them. Each run is written
  // as its own package: the first creates the hemsida, the rest merge into it.
  if (result.batches.length > 1) {
    for (const batch of result.batches) {
      const runDirectory = join(directory, `run-${String(batch.index).padStart(2, "0")}`);
      mkdirSync(join(runDirectory, "assets"), { recursive: true });
      mkdirSync(join(runDirectory, "fonts"), { recursive: true });
      writeFileSync(
        join(runDirectory, "site.json"),
        `${JSON.stringify(batch.site, null, 2)}\n`,
        { flag: "wx" },
      );
      writeFileSync(
        join(runDirectory, "run.json"),
        `${JSON.stringify(
          {
            revision: "snabbsajt.sanity-run/v1",
            index: batch.index,
            total: batch.total,
            mode: batch.mode,
            rows: batch.site.collectionRows?.length ?? 0,
            assets: batch.site.assets.length,
          },
          null,
          2,
        )}\n`,
        { flag: "wx" },
      );
      for (const asset of batch.assetFiles) {
        writeFileSync(join(runDirectory, "assets", asset.fileName), asset.bytes, {
          flag: "wx",
        });
      }
    }
  }
  if (result.report.status !== "ready") {
    writeFileSync(
      join(directory, "REVIEW-DRAFT.md"),
      "# Review draft\n\nThis Sanity import is not publish-ready. Read every item in `import-report.md`, especially the ones that say something did not come across, then approve it with `snabbsajt site import approve . --yes`.\n",
      { flag: "wx" },
    );
  }
  writeFileSync(
    join(directory, "import-provenance.json"),
    `${JSON.stringify(
      {
        revision: "snabbsajt.import-provenance/v1",
        status: result.report.status,
        siteSha256: createHash("sha256").update(siteJson).digest("hex"),
        reportSha256: createHash("sha256").update(reportJson).digest("hex"),
        originalReportSha256: createHash("sha256").update(reportJson).digest("hex"),
      },
      null,
      2,
    )}\n`,
    { flag: "wx" },
  );
  return { ...result, directory };
}
