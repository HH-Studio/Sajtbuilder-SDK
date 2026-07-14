import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

describe("AI-assisted import skill contract", () => {
  it("keeps the agent workflow local, inert, evidence-cited, validated, and human-approved", () => {
    const skill = read("skills/import-website/SKILL.md");
    const rules = read("skills/shared/import-mapping-rules.md");
    const combined = `${skill}\n${rules}`;

    expect(skill).toContain("references/import-mapping-rules.md");
    for (const command of [
      "snabbsajt site doctor",
      "snabbsajt site import html",
      "snabbsajt site validate",
      "snabbsajt site inspect",
      "snabbsajt site import approve",
      "snabbsajt site pack",
    ]) expect(combined).toContain(command);

    expect(combined).toMatch(/never (?:run|execute) the source/i);
    expect(combined).toMatch(/never install (?:the )?source dependencies/i);
    expect(combined).toMatch(/every `ai_proposed`[^.]*evidence id/i);
    expect(combined).toMatch(/human approval/i);
    for (const disposition of ["ai_proposed", "missing", "unsafe", "manual"]) {
      expect(combined).toContain(`\`${disposition}\``);
    }
    for (const unsupportedFact of ["testimonials", "prices", "availability", "legal text", "consent"]) {
      expect(combined.toLowerCase()).toContain(unsupportedFact);
    }
  });

  it("declares one checksummed shared mapping reference in the install manifest", () => {
    const manifest = JSON.parse(read("skills/manifest.json"));
    const shared = read("skills/shared/import-mapping-rules.md");
    const importer = manifest.skills.find((skill: { name: string }) => skill.name === "import-website");
    expect(manifest.releaseVersion).toBe("1.1.0");
    expect(importer.version).toBe("1.1.0");
    expect(importer.files).toContainEqual({
      path: "references/import-mapping-rules.md",
      source: "shared/import-mapping-rules.md",
      sha256: sha256(shared),
    });
  });

  it("provides deterministic proposal lint rules instead of asserting model wording", () => {
    const rules = read("skills/shared/import-mapping-rules.md");
    expect(rules).toContain("AI proposal lint");
    expect(rules).toContain("evidenceIds");
    expect(rules).toContain("confidence");
    expect(rules).toContain("blocking");
    expect(rules).toContain("Do not mark the report `ready`");

    const workflow = read(".github/workflows/release.yml");
    expect(workflow).toContain("skills/shared/import-mapping-rules.md");
    expect(workflow).toContain("references/import-mapping-rules.md");
  });
});
