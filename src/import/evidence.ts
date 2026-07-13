export const EVIDENCE_KINDS = [
  "url",
  "file",
  "html_node",
  "css_rule",
  "script",
  "wxr_item",
  "asset",
  "metadata",
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export type EvidenceItemV1 = {
  id: string;
  kind: EvidenceKind;
  sourceInputId: string;
  locator: string;
  contentHash: string;
  excerpt: string;
};

export type ImportReportIssue = {
  path: string;
  message: string;
};

export const IMPORT_REPORT_LIMITS = {
  sourceInputs: 32,
  evidence: 10_000,
  items: 10_000,
  evidenceIdsPerItem: 256,
  id: 128,
  locator: 1_000,
  excerpt: 500,
  reason: 2_000,
  version: 128,
} as const;

export const STABLE_IMPORT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
export const SHA256_CONTENT_HASH = /^sha256:[a-f0-9]{64}$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function addUnknownKeyIssues(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: ImportReportIssue[],
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      issues.push({ path: path ? `${path}.${key}` : key, message: "unknown field" });
    }
  }
}

export function validateBoundedString(
  value: unknown,
  path: string,
  max: number,
  issues: ImportReportIssue[],
): value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({ path, message: "must be a non-empty string" });
    return false;
  }
  if (value.length > max) {
    issues.push({ path, message: `must be at most ${max} characters` });
    return false;
  }
  return true;
}

export function validateStableId(
  value: unknown,
  path: string,
  issues: ImportReportIssue[],
): value is string {
  if (!validateBoundedString(value, path, IMPORT_REPORT_LIMITS.id, issues)) return false;
  if (!STABLE_IMPORT_ID.test(value)) {
    issues.push({ path, message: "must be a stable import id" });
    return false;
  }
  return true;
}

export function validateEvidenceInventory(
  value: unknown,
  sourceInputIds: ReadonlySet<string>,
  issues: ImportReportIssue[],
): { evidence: EvidenceItemV1[]; ids: Set<string> } {
  if (!Array.isArray(value)) {
    issues.push({ path: "evidence", message: "must be an array" });
    return { evidence: [], ids: new Set() };
  }
  if (value.length > IMPORT_REPORT_LIMITS.evidence) {
    issues.push({
      path: "evidence",
      message: `must contain at most ${IMPORT_REPORT_LIMITS.evidence} items`,
    });
  }

  const evidence: EvidenceItemV1[] = [];
  const ids = new Set<string>();
  value.slice(0, IMPORT_REPORT_LIMITS.evidence).forEach((candidate, index) => {
    const path = `evidence[${index}]`;
    if (!isRecord(candidate)) {
      issues.push({ path, message: "must be an object" });
      return;
    }
    addUnknownKeyIssues(
      candidate,
      ["id", "kind", "sourceInputId", "locator", "contentHash", "excerpt"],
      path,
      issues,
    );
    const idIsValid = validateStableId(candidate.id, `${path}.id`, issues);
    if (idIsValid) {
      if (ids.has(candidate.id as string)) {
        issues.push({ path: `${path}.id`, message: `duplicate evidence id "${candidate.id}"` });
      }
      ids.add(candidate.id as string);
    }
    if (!EVIDENCE_KINDS.includes(candidate.kind as EvidenceKind)) {
      issues.push({ path: `${path}.kind`, message: "unknown evidence kind" });
    }
    if (validateStableId(candidate.sourceInputId, `${path}.sourceInputId`, issues)) {
      if (!sourceInputIds.has(candidate.sourceInputId as string)) {
        issues.push({ path: `${path}.sourceInputId`, message: "unknown source input id" });
      }
    }
    validateBoundedString(candidate.locator, `${path}.locator`, IMPORT_REPORT_LIMITS.locator, issues);
    if (typeof candidate.contentHash !== "string" || !SHA256_CONTENT_HASH.test(candidate.contentHash)) {
      issues.push({ path: `${path}.contentHash`, message: "must be a lowercase sha256 content hash" });
    }
    validateBoundedString(candidate.excerpt, `${path}.excerpt`, IMPORT_REPORT_LIMITS.excerpt, issues);
    evidence.push(candidate as EvidenceItemV1);
  });

  return { evidence, ids };
}
