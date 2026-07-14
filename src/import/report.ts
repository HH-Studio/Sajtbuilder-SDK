import {
  IMPORT_REPORT_LIMITS,
  SHA256_CONTENT_HASH,
  addUnknownKeyIssues,
  isRecord,
  validateBoundedString,
  validateEvidenceInventory,
  validateStableId,
  type EvidenceItemV1,
  type ImportReportIssue,
} from "./evidence";

export const IMPORT_REPORT_FORMAT = "snabbsajt-import-report" as const;
export const IMPORT_REPORT_REVISION = "snabbsajt.import-report/v1" as const;
export const IMPORT_REPORT_FORMAT_VERSION = "1" as const;
export const PORTABLE_SITE_FORMAT_VERSION = "1" as const;

export const IMPORT_DISPOSITIONS = [
  "exact",
  "converted",
  "merged",
  "skipped",
  "missing",
  "ai_proposed",
  "unsafe",
  "redirect",
  "manual",
] as const;

export const IMPORT_REPORT_STATUSES = ["ready", "review_required", "blocked"] as const;

export type ImportDisposition = (typeof IMPORT_DISPOSITIONS)[number];
export type ImportReportStatus = (typeof IMPORT_REPORT_STATUSES)[number];

export type ImportSourceInputV1 = {
  id: string;
  kind: "url" | "file";
  locator: string;
  contentHash?: string;
};

export type ImportReportItemV1 = {
  id: string;
  disposition: ImportDisposition;
  reason: string;
  evidenceIds: string[];
  target?: { kind: string; id: string };
  confidence?: number;
  blocking: boolean;
  resolution?: {
    status: "accepted" | "resolved";
    note: string;
    resolvedAt: string;
  };
};

export type ImportReportV1 = {
  format: typeof IMPORT_REPORT_FORMAT;
  revision: typeof IMPORT_REPORT_REVISION;
  status: ImportReportStatus;
  adapter: { id: string; version: string };
  sourceInputs: ImportSourceInputV1[];
  detectedPlatform: { id: string; version?: string; confidence: number };
  timestamps: { startedAt: string; completedAt: string };
  requiredVersions: {
    reportFormat: typeof IMPORT_REPORT_FORMAT_VERSION;
    portableSiteFormat: typeof PORTABLE_SITE_FORMAT_VERSION;
    cli: string;
  };
  evidence: EvidenceItemV1[];
  items: ImportReportItemV1[];
  summary: {
    total: number;
    blocking: number;
    byDisposition: Record<ImportDisposition, number>;
  };
};

export type ImportReportValidation = {
  ok: boolean;
  issues: ImportReportIssue[];
};

function requireRecord(
  value: unknown,
  path: string,
  issues: ImportReportIssue[],
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    issues.push({ path, message: "must be an object" });
    return undefined;
  }
  return value;
}

function validateConfidence(value: unknown, path: string, issues: ImportReportIssue[]): value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    issues.push({ path, message: "must be a finite number from 0 to 1" });
    return false;
  }
  return true;
}

function validateCount(value: unknown, path: string, issues: ImportReportIssue[]): value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    issues.push({ path, message: "must be a non-negative safe integer" });
    return false;
  }
  return true;
}

function validateTimestamp(value: unknown, path: string, issues: ImportReportIssue[]): value is string {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    Number.isNaN(parsed) ||
    new Date(parsed).toISOString() !== value
  ) {
    issues.push({ path, message: "must be an ISO 8601 UTC timestamp" });
    return false;
  }
  return true;
}

export function validateImportReport(payload: unknown): ImportReportValidation {
  const issues: ImportReportIssue[] = [];
  const report = requireRecord(payload, "$", issues);
  if (!report) return { ok: false, issues };

  addUnknownKeyIssues(
    report,
    ["format", "revision", "status", "adapter", "sourceInputs", "detectedPlatform", "timestamps", "requiredVersions", "evidence", "items", "summary"],
    "",
    issues,
  );
  if (report.format !== IMPORT_REPORT_FORMAT) {
    issues.push({ path: "format", message: `must equal "${IMPORT_REPORT_FORMAT}"` });
  }
  if (report.revision !== IMPORT_REPORT_REVISION) {
    issues.push({ path: "revision", message: `must equal canonical revision "${IMPORT_REPORT_REVISION}"` });
  }
  if (!IMPORT_REPORT_STATUSES.includes(report.status as ImportReportStatus)) {
    issues.push({ path: "status", message: "unknown report status" });
  }

  const adapter = requireRecord(report.adapter, "adapter", issues);
  if (adapter) {
    addUnknownKeyIssues(adapter, ["id", "version"], "adapter", issues);
    validateStableId(adapter.id, "adapter.id", issues);
    validateBoundedString(adapter.version, "adapter.version", IMPORT_REPORT_LIMITS.version, issues);
  }

  const sourceInputIds = new Set<string>();
  if (!Array.isArray(report.sourceInputs)) {
    issues.push({ path: "sourceInputs", message: "must be an array" });
  } else {
    if (report.sourceInputs.length === 0 || report.sourceInputs.length > IMPORT_REPORT_LIMITS.sourceInputs) {
      issues.push({ path: "sourceInputs", message: `must contain 1 to ${IMPORT_REPORT_LIMITS.sourceInputs} inputs` });
    }
    report.sourceInputs.slice(0, IMPORT_REPORT_LIMITS.sourceInputs).forEach((candidate, index) => {
      const path = `sourceInputs[${index}]`;
      const source = requireRecord(candidate, path, issues);
      if (!source) return;
      addUnknownKeyIssues(source, ["id", "kind", "locator", "contentHash"], path, issues);
      if (validateStableId(source.id, `${path}.id`, issues)) {
        if (sourceInputIds.has(source.id as string)) {
          issues.push({ path: `${path}.id`, message: `duplicate source input id "${source.id}"` });
        }
        sourceInputIds.add(source.id as string);
      }
      if (source.kind !== "url" && source.kind !== "file") {
        issues.push({ path: `${path}.kind`, message: "must be url or file" });
      }
      validateBoundedString(source.locator, `${path}.locator`, IMPORT_REPORT_LIMITS.locator, issues);
      if (source.contentHash !== undefined && (typeof source.contentHash !== "string" || !SHA256_CONTENT_HASH.test(source.contentHash))) {
        issues.push({ path: `${path}.contentHash`, message: "must be a lowercase sha256 content hash" });
      }
    });
  }

  const platform = requireRecord(report.detectedPlatform, "detectedPlatform", issues);
  if (platform) {
    addUnknownKeyIssues(platform, ["id", "version", "confidence"], "detectedPlatform", issues);
    validateStableId(platform.id, "detectedPlatform.id", issues);
    if (platform.version !== undefined) {
      validateBoundedString(platform.version, "detectedPlatform.version", IMPORT_REPORT_LIMITS.version, issues);
    }
    validateConfidence(platform.confidence, "detectedPlatform.confidence", issues);
  }

  const timestamps = requireRecord(report.timestamps, "timestamps", issues);
  if (timestamps) {
    addUnknownKeyIssues(timestamps, ["startedAt", "completedAt"], "timestamps", issues);
    const validStart = validateTimestamp(timestamps.startedAt, "timestamps.startedAt", issues);
    const validEnd = validateTimestamp(timestamps.completedAt, "timestamps.completedAt", issues);
    if (validStart && validEnd && Date.parse(timestamps.completedAt as string) < Date.parse(timestamps.startedAt as string)) {
      issues.push({ path: "timestamps.completedAt", message: "must not be before startedAt" });
    }
  }

  const versions = requireRecord(report.requiredVersions, "requiredVersions", issues);
  if (versions) {
    addUnknownKeyIssues(versions, ["reportFormat", "portableSiteFormat", "cli"], "requiredVersions", issues);
    if (versions.reportFormat !== IMPORT_REPORT_FORMAT_VERSION) {
      issues.push({ path: "requiredVersions.reportFormat", message: `must equal "${IMPORT_REPORT_FORMAT_VERSION}"` });
    }
    if (versions.portableSiteFormat !== PORTABLE_SITE_FORMAT_VERSION) {
      issues.push({ path: "requiredVersions.portableSiteFormat", message: `must equal "${PORTABLE_SITE_FORMAT_VERSION}"` });
    }
    validateBoundedString(versions.cli, "requiredVersions.cli", IMPORT_REPORT_LIMITS.version, issues);
  }

  const { ids: evidenceIds } = validateEvidenceInventory(report.evidence, sourceInputIds, issues);

  const itemIds = new Set<string>();
  const actualCounts = Object.fromEntries(IMPORT_DISPOSITIONS.map((disposition) => [disposition, 0])) as Record<ImportDisposition, number>;
  let actualBlocking = 0;
  let unresolvedReviewItems = 0;
  if (!Array.isArray(report.items)) {
    issues.push({ path: "items", message: "must be an array" });
  } else {
    if (report.items.length > IMPORT_REPORT_LIMITS.items) {
      issues.push({ path: "items", message: `must contain at most ${IMPORT_REPORT_LIMITS.items} items` });
    }
    report.items.slice(0, IMPORT_REPORT_LIMITS.items).forEach((candidate, index) => {
      const path = `items[${index}]`;
      const item = requireRecord(candidate, path, issues);
      if (!item) return;
      addUnknownKeyIssues(item, ["id", "disposition", "reason", "evidenceIds", "target", "confidence", "blocking", "resolution"], path, issues);
      if (validateStableId(item.id, `${path}.id`, issues)) {
        if (itemIds.has(item.id as string)) issues.push({ path: `${path}.id`, message: `duplicate report item id "${item.id}"` });
        itemIds.add(item.id as string);
      }
      if (!IMPORT_DISPOSITIONS.includes(item.disposition as ImportDisposition)) {
        issues.push({ path: `${path}.disposition`, message: "unknown import disposition" });
      } else {
        actualCounts[item.disposition as ImportDisposition] += 1;
      }
      validateBoundedString(item.reason, `${path}.reason`, IMPORT_REPORT_LIMITS.reason, issues);
      if (!Array.isArray(item.evidenceIds) || item.evidenceIds.length === 0) {
        issues.push({ path: `${path}.evidenceIds`, message: "must cite at least one evidence id" });
      } else {
        if (item.evidenceIds.length > IMPORT_REPORT_LIMITS.evidenceIdsPerItem) {
          issues.push({ path: `${path}.evidenceIds`, message: `must contain at most ${IMPORT_REPORT_LIMITS.evidenceIdsPerItem} ids` });
        }
        const cited = new Set<string>();
        item.evidenceIds.slice(0, IMPORT_REPORT_LIMITS.evidenceIdsPerItem).forEach((id, evidenceIndex) => {
          const evidencePath = `${path}.evidenceIds[${evidenceIndex}]`;
          if (!validateStableId(id, evidencePath, issues)) return;
          if (cited.has(id)) issues.push({ path: evidencePath, message: `duplicate cited evidence id "${id}"` });
          cited.add(id);
          if (!evidenceIds.has(id)) issues.push({ path: evidencePath, message: `unknown evidence id "${id}"` });
        });
      }
      if (item.target !== undefined) {
        const target = requireRecord(item.target, `${path}.target`, issues);
        if (target) {
          addUnknownKeyIssues(target, ["kind", "id"], `${path}.target`, issues);
          validateBoundedString(target.kind, `${path}.target.kind`, IMPORT_REPORT_LIMITS.id, issues);
          validateBoundedString(target.id, `${path}.target.id`, IMPORT_REPORT_LIMITS.locator, issues);
        }
      }
      if (item.confidence !== undefined) validateConfidence(item.confidence, `${path}.confidence`, issues);
      if (item.disposition === "ai_proposed" && item.confidence === undefined) {
        issues.push({ path: `${path}.confidence`, message: "is required for inferred AI proposals" });
      }
      if (typeof item.blocking !== "boolean") {
        issues.push({ path: `${path}.blocking`, message: "must be a boolean" });
      } else if (item.blocking) {
        actualBlocking += 1;
      }
      const needsReview = ["manual", "missing", "unsafe", "ai_proposed"].includes(item.disposition as string);
      if (item.resolution === undefined) {
        if (needsReview) unresolvedReviewItems += 1;
      } else {
        const resolution = requireRecord(item.resolution, `${path}.resolution`, issues);
        if (resolution) {
          addUnknownKeyIssues(resolution, ["status", "note", "resolvedAt"], `${path}.resolution`, issues);
          if (resolution.status !== "accepted" && resolution.status !== "resolved") {
            issues.push({ path: `${path}.resolution.status`, message: "must be accepted or resolved" });
          }
          validateBoundedString(resolution.note, `${path}.resolution.note`, IMPORT_REPORT_LIMITS.reason, issues);
          validateTimestamp(resolution.resolvedAt, `${path}.resolution.resolvedAt`, issues);
          if (!needsReview) issues.push({ path: `${path}.resolution`, message: "is only allowed on a review-required disposition" });
        }
      }
    });
  }

  const summary = requireRecord(report.summary, "summary", issues);
  if (summary) {
    addUnknownKeyIssues(summary, ["total", "blocking", "byDisposition"], "summary", issues);
    if (validateCount(summary.total, "summary.total", issues) && summary.total !== (Array.isArray(report.items) ? report.items.length : 0)) {
      issues.push({ path: "summary.total", message: "does not match items length" });
    }
    if (validateCount(summary.blocking, "summary.blocking", issues) && summary.blocking !== actualBlocking) {
      issues.push({ path: "summary.blocking", message: "does not match blocking items" });
    }
    const byDisposition = requireRecord(summary.byDisposition, "summary.byDisposition", issues);
    if (byDisposition) {
      addUnknownKeyIssues(byDisposition, IMPORT_DISPOSITIONS, "summary.byDisposition", issues);
      for (const disposition of IMPORT_DISPOSITIONS) {
        const path = `summary.byDisposition.${disposition}`;
        if (validateCount(byDisposition[disposition], path, issues) && byDisposition[disposition] !== actualCounts[disposition]) {
          issues.push({ path, message: "does not match report items" });
        }
      }
    }
  }

  if (report.status === "ready" && (actualBlocking > 0 || unresolvedReviewItems > 0)) {
    issues.push({ path: "status", message: "ready reports cannot contain blockers or unresolved review items" });
  }
  if (report.status === "blocked" && actualBlocking === 0) {
    issues.push({ path: "status", message: "blocked reports must contain a blocker" });
  }

  return { ok: issues.length === 0, issues };
}

function normalizedReport(report: ImportReportV1): ImportReportV1 {
  const compareStableId = (a: { id: string }, b: { id: string }) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  return {
    ...report,
    sourceInputs: [...report.sourceInputs].sort(compareStableId),
    evidence: [...report.evidence].sort(compareStableId),
    items: [...report.items]
      .map((item) => ({ ...item, evidenceIds: [...item.evidenceIds].sort() }))
      .sort(compareStableId),
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

export function normalizeImportReportJson(report: ImportReportV1): string {
  return `${JSON.stringify(canonicalize(normalizedReport(report)), null, 2)}\n`;
}

function markdownText(value: string): string {
  return value.replace(/\s+/g, " ").trim().replace(/([\\`*_[\]<>|#])/g, "\\$1");
}

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

export function renderImportReportMarkdown(report: ImportReportV1): string {
  const normalized = normalizedReport(report);
  const lines = [
    "# Import report",
    "",
    `- Status: **${label(normalized.status)}**`,
    `- Adapter: \`${markdownText(normalized.adapter.id)}@${markdownText(normalized.adapter.version)}\``,
    `- Platform: ${markdownText(normalized.detectedPlatform.id)}${normalized.detectedPlatform.version ? ` ${markdownText(normalized.detectedPlatform.version)}` : ""} (${Math.round(normalized.detectedPlatform.confidence * 100)}% confidence)`,
    `- Started: ${normalized.timestamps.startedAt}`,
    `- Completed: ${normalized.timestamps.completedAt}`,
    `- Required versions: report ${normalized.requiredVersions.reportFormat}, site ${normalized.requiredVersions.portableSiteFormat}, CLI ${markdownText(normalized.requiredVersions.cli)}`,
    "",
    "## Summary",
    "",
    `- Findings: ${normalized.summary.total}`,
    `- Blocking: ${normalized.summary.blocking}`,
    ...IMPORT_DISPOSITIONS.filter((disposition) => normalized.summary.byDisposition[disposition] > 0)
      .map((disposition) => `- ${label(disposition)}: ${normalized.summary.byDisposition[disposition]}`),
    "",
    "## Findings",
    "",
  ];

  const reviewFirst = [...normalized.items].sort((left, right) => {
    const priority = (item: ImportReportItemV1) => item.blocking ? 0 : ["manual", "missing", "unsafe", "ai_proposed"].includes(item.disposition) && !item.resolution ? 1 : 2;
    return priority(left) - priority(right) || left.id.localeCompare(right.id);
  });
  for (const item of reviewFirst) {
    const details = [
      item.target ? `target ${markdownText(item.target.kind)}:${markdownText(item.target.id)}` : undefined,
      item.confidence === undefined ? undefined : `confidence ${Math.round(item.confidence * 100)}%`,
      item.resolution ? `${item.resolution.status} ${item.resolution.resolvedAt}: ${markdownText(item.resolution.note)}` : undefined,
      `evidence ${item.evidenceIds.map((id) => `\`${markdownText(id)}\``).join(", ")}`,
    ].filter((value): value is string => value !== undefined);
    lines.push(
      `- ${item.blocking ? "**BLOCKING** " : ""}**${label(item.disposition)}**: ${markdownText(item.reason)} (${details.join("; ")})`,
    );
  }

  lines.push("", "## Evidence", "");
  for (const evidence of normalized.evidence) {
    lines.push(
      `- \`${markdownText(evidence.id)}\` [${label(evidence.kind)}] ${markdownText(evidence.locator)}: ${markdownText(evidence.excerpt)} (source \`${markdownText(evidence.sourceInputId)}\`, ${evidence.contentHash})`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export type { EvidenceItemV1, EvidenceKind, ImportReportIssue } from "./evidence";
