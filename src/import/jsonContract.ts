import {
  EVIDENCE_KINDS,
  IMPORT_REPORT_LIMITS,
  SHA256_CONTENT_HASH,
  STABLE_IMPORT_ID,
} from "./evidence";
import {
  IMPORT_DISPOSITIONS,
  IMPORT_REPORT_FORMAT,
  IMPORT_REPORT_FORMAT_VERSION,
  IMPORT_REPORT_REVISION,
  IMPORT_REPORT_STATUSES,
  PORTABLE_SITE_FORMAT_VERSION,
} from "./report";

const nonEmptyString = (maxLength: number, pattern?: string) => ({
  type: "string",
  minLength: 1,
  maxLength,
  pattern: pattern ? `(?=.*\\S)(?:${pattern})` : "\\S",
});

const strictObject = (properties: Record<string, unknown>, required: readonly string[]) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});

export function buildImportReportJsonContract() {
  const stableId = nonEmptyString(IMPORT_REPORT_LIMITS.id, STABLE_IMPORT_ID.source);
  const contentHash = { type: "string", pattern: SHA256_CONTENT_HASH.source };
  const confidence = { type: "number", minimum: 0, maximum: 1 };
  const count = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
  const timestamp = { type: "string", format: "date-time", pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$" };

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://snabbsajt.com/contracts/import-report-v1.schema.json",
    ...strictObject(
      {
        format: { const: IMPORT_REPORT_FORMAT },
        revision: { const: IMPORT_REPORT_REVISION },
        status: { enum: [...IMPORT_REPORT_STATUSES] },
        adapter: strictObject({ id: stableId, version: nonEmptyString(IMPORT_REPORT_LIMITS.version) }, ["id", "version"]),
        sourceInputs: {
          type: "array", minItems: 1, maxItems: IMPORT_REPORT_LIMITS.sourceInputs,
          items: strictObject({ id: stableId, kind: { enum: ["url", "file"] }, locator: nonEmptyString(IMPORT_REPORT_LIMITS.locator), contentHash }, ["id", "kind", "locator"]),
        },
        detectedPlatform: strictObject({ id: stableId, version: nonEmptyString(IMPORT_REPORT_LIMITS.version), confidence }, ["id", "confidence"]),
        timestamps: strictObject({ startedAt: timestamp, completedAt: timestamp }, ["startedAt", "completedAt"]),
        requiredVersions: strictObject({ reportFormat: { const: IMPORT_REPORT_FORMAT_VERSION }, portableSiteFormat: { const: PORTABLE_SITE_FORMAT_VERSION }, cli: nonEmptyString(IMPORT_REPORT_LIMITS.version) }, ["reportFormat", "portableSiteFormat", "cli"]),
        evidence: {
          type: "array", maxItems: IMPORT_REPORT_LIMITS.evidence,
          items: strictObject({ id: stableId, kind: { enum: [...EVIDENCE_KINDS] }, sourceInputId: stableId, locator: nonEmptyString(IMPORT_REPORT_LIMITS.locator), contentHash, excerpt: nonEmptyString(IMPORT_REPORT_LIMITS.excerpt) }, ["id", "kind", "sourceInputId", "locator", "contentHash", "excerpt"]),
        },
        items: {
          type: "array", maxItems: IMPORT_REPORT_LIMITS.items,
          items: {
            ...strictObject({ id: stableId, disposition: { enum: [...IMPORT_DISPOSITIONS] }, reason: nonEmptyString(IMPORT_REPORT_LIMITS.reason), evidenceIds: { type: "array", minItems: 1, maxItems: IMPORT_REPORT_LIMITS.evidenceIdsPerItem, uniqueItems: true, items: stableId }, target: strictObject({ kind: nonEmptyString(IMPORT_REPORT_LIMITS.id), id: nonEmptyString(IMPORT_REPORT_LIMITS.locator) }, ["kind", "id"]), confidence, blocking: { type: "boolean" } }, ["id", "disposition", "reason", "evidenceIds", "blocking"]),
            allOf: [{ if: { properties: { disposition: { const: "ai_proposed" } } }, then: { required: ["confidence"] } }],
          },
        },
        summary: strictObject({ total: count, blocking: count, byDisposition: strictObject(Object.fromEntries(IMPORT_DISPOSITIONS.map((value) => [value, count])), IMPORT_DISPOSITIONS) }, ["total", "blocking", "byDisposition"]),
      },
      ["format", "revision", "status", "adapter", "sourceInputs", "detectedPlatform", "timestamps", "requiredVersions", "evidence", "items", "summary"],
    ),
    "x-snabbsajt-invariants": [
      "sourceInputs ids are unique",
      "evidence ids are unique and sourceInputId references sourceInputs",
      "report item ids are unique and evidenceIds reference evidence",
      "summary total blocking and disposition counts equal items",
      "completedAt is not before startedAt",
      "timestamps are real canonical ISO 8601 UTC instants",
      "ready reports contain no blocking items",
      "blocked reports contain at least one blocking item",
    ],
  } as const;
}
