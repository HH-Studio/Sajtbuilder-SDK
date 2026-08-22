// ---------------------------------------------------------------------------
// The top of the Sanity lane: export + schema + confirmed mapping -> a bundle,
// a report and the batches the import will accept.
//
// Everything under it is pure. This file is the only place that assembles the
// artefacts, so the CLI stays a thin thing that reads files and writes files.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import type { PortableSiteV1 } from "../../convex/model/portable";
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
} from "../report";
import { splitIntoBatches, type SanityBatch } from "./batch";
import { convertSanityExport, type ConvertOptions, type SanityLoss } from "./convert";
import type { SanityMapping } from "./mapping";
import type { SanityExport, SanitySchemaType } from "./model";

export type SanityMappingOptions = ConvertOptions & {
  /** What the report points at when it explains a decision. */
  exportLocator: string;
  schemaLocator?: string;
  startedAt?: string;
  completedAt?: string;
  cliVersion?: string;
};

export type SanityMappingResult = {
  site: PortableSiteV1;
  report: ImportReportV1;
  evidence: EvidenceItemV1[];
  validation: SiteKitReport;
  assetFiles: { fileName: string; bytes: Uint8Array }[];
  batches: SanityBatch[];
  losses: SanityLoss[];
};

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function excerpt(value: string, max = 200): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function summary(items: ImportReportItemV1[]): ImportReportV1["summary"] {
  const byDisposition = Object.fromEntries(
    IMPORT_DISPOSITIONS.map((kind) => [kind, 0]),
  ) as Record<ImportDisposition, number>;
  for (const item of items) byDisposition[item.disposition] += 1;
  return {
    total: items.length,
    blocking: items.filter((item) => item.blocking).length,
    byDisposition,
  };
}

/** A stable id per item, so re-running the same import produces the same
 *  report and a diff of two reports is readable. */
function stableId(prefix: string, index: number): string {
  return `${prefix}-${String(index + 1).padStart(4, "0")}`;
}

export function mapSanityImport(
  exported: SanityExport,
  schema: readonly SanitySchemaType[],
  mapping: SanityMapping,
  options: SanityMappingOptions,
): SanityMappingResult {
  const completedAt = options.completedAt ?? new Date().toISOString();
  const startedAt = options.startedAt ?? completedAt;
  const converted = convertSanityExport(exported, mapping, options);

  const sourceInputs: ImportReportV1["sourceInputs"] = [
    {
      id: "sanity-export",
      kind: "file" as const,
      locator: options.exportLocator.slice(0, 1_000),
    },
    ...(options.schemaLocator
      ? [
          {
            id: "sanity-schema",
            kind: "file" as const,
            locator: options.schemaLocator.slice(0, 1_000),
          },
        ]
      : []),
  ];

  // Evidence: one item per document that came across, plus one per schema type
  // the mapping used. A loss can then point at the document it happened in,
  // which is the difference between "17 things were dropped" and "here is the
  // property it happened to".
  const evidence: EvidenceItemV1[] = [];
  const evidenceIdByDocument = new Map<string, string>();
  let at = 0;
  for (const doc of exported.documents.values()) {
    if (!mapping.types.some((type) => type.from === doc._type && type.becomes !== "skip")) {
      continue;
    }
    const id = stableId("sanity-doc", at);
    at += 1;
    evidenceIdByDocument.set(doc._id, id);
    evidence.push({
      id,
      kind: "sanity_document",
      sourceInputId: "sanity-export",
      locator: `_id='${doc._id}'`,
      contentHash: sha256(JSON.stringify(doc)),
      excerpt: excerpt(JSON.stringify(doc)),
    });
  }
  schema.forEach((type, index) => {
    if (!mapping.types.some((entry) => entry.from === type.name)) return;
    evidence.push({
      id: stableId("sanity-type", index),
      kind: "sanity_schema_type",
      sourceInputId: options.schemaLocator ? "sanity-schema" : "sanity-export",
      locator: `${type.file}#${type.name}`,
      contentHash: sha256(JSON.stringify(type)),
      excerpt: excerpt(
        `${type.name}: ${type.fields.map((field) => `${field.name}:${field.kind}`).join(", ")}`,
      ),
    });
  });
  // A report with no evidence at all cannot point anywhere, and the validator
  // refuses one. An export whose every type is skipped is a real case, so it
  // gets one item saying exactly that.
  if (evidence.length === 0) {
    evidence.push({
      id: "sanity-export-empty",
      kind: "sanity_document",
      sourceInputId: "sanity-export",
      locator: "dataset",
      contentHash: sha256(options.exportLocator),
      excerpt: excerpt(
        `${exported.documents.size} document(s) in the export, none of them mapped`,
      ),
    });
  }
  const anyEvidenceId = evidence[0]!.id;

  const items: ImportReportItemV1[] = [];
  for (const type of mapping.types) {
    const count = [...exported.documents.values()].filter(
      (doc) => doc._type === type.from,
    ).length;
    if (type.becomes === "skip") {
      items.push({
        id: stableId("type-skipped", items.length),
        disposition: "skipped",
        reason: `The mapping skips "${type.from}", so its ${count} document(s) were not imported.${
          type.note ? ` ${type.note}` : ""
        }`,
        evidenceIds: [anyEvidenceId],
        blocking: false,
      });
      continue;
    }
    items.push({
      id: stableId("type-mapped", items.length),
      disposition: "converted",
      reason:
        type.becomes === "collection"
          ? `${count} "${type.from}" document(s) became rows in the list "${type.name ?? type.key}".`
          : `${count} "${type.from}" document(s) became page(s).`,
      evidenceIds: [anyEvidenceId],
      blocking: false,
    });
    const skipped = type.fields.filter((field) => field.type === "skip");
    for (const field of skipped) {
      items.push({
        id: stableId("field-skipped", items.length),
        disposition: "skipped",
        reason: `"${type.from}.${field.from}" was not imported.${
          field.note ? ` ${field.note}` : ""
        }`,
        evidenceIds: [anyEvidenceId],
        blocking: false,
      });
    }
  }
  for (const loss of converted.losses) {
    items.push({
      id: stableId("loss", items.length),
      // `missing` rather than `converted`: something the source had is not on
      // the hemsida. It is one of the four dispositions a report must have a
      // human resolution for before it can call itself `ready`, which is the
      // behaviour we want - nobody signs off on a migration by not reading it.
      disposition: "missing",
      reason: `${loss.documentId}${loss.field ? ` · ${loss.field}` : ""}: ${loss.reason}`,
      evidenceIds: [evidenceIdByDocument.get(loss.documentId) ?? anyEvidenceId],
      blocking: false,
    });
  }
  if (converted.i18n.locales.length > 1) {
    items.push({
      id: stableId("i18n", items.length),
      disposition: "manual",
      reason: `This dataset holds ${converted.i18n.locales.join(", ")}. The import kept ${
        converted.i18n.kept ?? "one language"
      }; a hemsida holds one language per site, so import the others as their own hemsidor.`,
      evidenceIds: [anyEvidenceId],
      blocking: false,
    });
  }

  const validation = validateSitePackage(converted.site);
  const batches = splitIntoBatches(converted.site, converted.assetFiles);
  if (batches.length > 1) {
    items.push({
      id: stableId("batched", items.length),
      disposition: "converted",
      reason: `This dataset carries ${converted.counts.assets} pictures, and one import accepts 200. It was split into ${batches.length} runs: the first creates the hemsida and the rest merge into it.`,
      evidenceIds: [anyEvidenceId],
      blocking: false,
    });
  }

  const blocked = validation.issues.some((issue) => issue.level === "error");
  const needsReview = items.some(
    (item) =>
      item.disposition === "missing" ||
      item.disposition === "manual" ||
      item.disposition === "unsafe" ||
      item.disposition === "ai_proposed",
  );
  const report: ImportReportV1 = {
    format: IMPORT_REPORT_FORMAT,
    revision: IMPORT_REPORT_REVISION,
    status: blocked ? "blocked" : needsReview ? "review_required" : "ready",
    adapter: { id: "sanity", version: options.cliVersion ?? "0.0.0" },
    sourceInputs,
    detectedPlatform: { id: "sanity", confidence: 1 },
    timestamps: { startedAt, completedAt },
    requiredVersions: {
      reportFormat: IMPORT_REPORT_FORMAT_VERSION,
      portableSiteFormat: PORTABLE_SITE_FORMAT_VERSION,
      cli: options.cliVersion ?? "0.0.0",
    },
    evidence,
    items,
    summary: summary(items),
  };

  return {
    site: converted.site,
    report,
    evidence,
    validation,
    assetFiles: converted.assetFiles,
    batches,
    losses: converted.losses,
  };
}
