import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  IMPORT_REPORT_REVISION,
  normalizeImportReportJson,
  renderImportReportMarkdown,
  validateImportReport,
  type ImportReportV1,
} from "../src/import/report";

const fixtureDirectory = fileURLToPath(
  new URL("../fixtures/import-report/", import.meta.url),
);

function fixtures(): Array<{ name: string; report: ImportReportV1 }> {
  return readdirSync(fixtureDirectory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({
      name,
      report: JSON.parse(readFileSync(`${fixtureDirectory}/${name}`, "utf8")),
    }));
}

function clone(report: ImportReportV1): ImportReportV1 {
  return structuredClone(report);
}

function sharedOutputHash(): string {
  const hash = createHash("sha256");
  for (const { name, report } of fixtures()) {
    hash.update(name);
    hash.update("\0");
    hash.update(normalizeImportReportJson(report));
    hash.update("\0");
    hash.update(renderImportReportMarkdown(report));
    hash.update("\0");
  }
  return hash.digest("hex");
}

describe("ImportReportV1", () => {
  it("declares and accepts the canonical app contract revision", () => {
    expect(IMPORT_REPORT_REVISION).toBe("snabbsajt.import-report/v1");
    expect(fixtures()).toHaveLength(8);
    for (const { report } of fixtures()) {
      expect(report.revision).toBe(IMPORT_REPORT_REVISION);
      expect(validateImportReport(report)).toMatchObject({ ok: true, issues: [] });
    }
  });

  it("rejects the canonical invalid cases", () => {
    const exact = clone(fixtures()[0].report);
    exact.items[0].disposition = "copied" as never;
    expect(validateImportReport(exact).issues.some((issue) => issue.path === "items[0].disposition")).toBe(true);

    const ai = clone(fixtures().find(({ name }) => name === "ai-proposal.json")!.report);
    ai.items[0].evidenceIds = [];
    expect(validateImportReport(ai).issues.some((issue) => issue.path === "items[0].evidenceIds")).toBe(true);

    const dangling = clone(fixtures()[0].report);
    dangling.evidence.push(clone(dangling).evidence[0]);
    dangling.items[0].evidenceIds.push("missing");
    const danglingIssues = validateImportReport(dangling).issues;
    expect(danglingIssues.some((issue) => issue.message.includes("duplicate evidence id"))).toBe(true);
    expect(danglingIssues.some((issue) => issue.message.includes("unknown evidence id"))).toBe(true);

    const summary = clone(fixtures()[0].report);
    summary.summary.total = 2;
    expect(validateImportReport(summary).issues.some((issue) => issue.path === "summary.total")).toBe(true);

    const blocker = clone(fixtures().find(({ name }) => name === "missing-booking-facts.json")!.report);
    blocker.status = "ready";
    expect(validateImportReport(blocker).issues.some((issue) => issue.path === "status")).toBe(true);

    const unresolved = clone(fixtures().find(({ name }) => name === "unsafe-script.json")!.report);
    unresolved.status = "ready";
    expect(validateImportReport(unresolved).issues.some((issue) => issue.path === "status")).toBe(true);
    unresolved.items[0].resolution = {
      status: "accepted",
      note: "Reviewed and intentionally omitted",
      resolvedAt: "2026-07-14T10:00:00.000Z",
    };
    expect(validateImportReport(unresolved)).toEqual({ ok: true, issues: [] });
  });

  it("normalizes JSON and Markdown deterministically", () => {
    const report = clone(
      fixtures().find(({ name }) => name === "exact-import.json")!.report,
    );
    report.sourceInputs.push({
      ...report.sourceInputs[0],
      id: "source-A",
      locator: "https://example.com/second",
    });
    report.evidence.push({
      ...report.evidence[0],
      id: "evidence-A",
      sourceInputId: "source-A",
      locator: "main > h1:nth-child(2)",
    });
    report.items.push({
      ...report.items[0],
      id: "item-A",
      evidenceIds: ["evidence-A"],
    });
    report.summary.total += 1;
    report.summary.byDisposition.exact += 1;
    expect(validateImportReport(report).ok).toBe(true);

    const reordered = clone(report);
    reordered.evidence.reverse();
    reordered.items.reverse();
    reordered.sourceInputs.reverse();

    expect(normalizeImportReportJson(reordered)).toBe(normalizeImportReportJson(report));
    expect(renderImportReportMarkdown(reordered)).toBe(renderImportReportMarkdown(report));
    expect(renderImportReportMarkdown(report)).toContain("# Import report");
    expect(renderImportReportMarkdown(report)).toContain("## Evidence");
  });

  it("rejects impossible calendar timestamps", () => {
    const report = clone(fixtures()[0].report);
    report.timestamps.startedAt = "2026-02-31T00:00:00.000Z";

    expect(validateImportReport(report).issues).toContainEqual(
      expect.objectContaining({ path: "timestamps.startedAt" }),
    );
  });

  it("matches the shared app and SDK golden-output hash", () => {
    expect(sharedOutputHash()).toBe(
      "8d6d92231eb1bdf4dbc5dadb4d718a8f8a06f7f8ead0c110af6ca6f28ca448f0",
    );
  });
});
