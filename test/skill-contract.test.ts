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
    // Pinned literals here went stale the moment the skills shipped at 1.2.0 and made
    // this suite red on main. The contract is the checksummed reference below; the
    // versions only have to be stable semver, which is what the release tag demands.
    expect(manifest.releaseVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(importer.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(importer.files).toContainEqual({
      path: "references/import-mapping-rules.md",
      source: "shared/import-mapping-rules.md",
      sha256: sha256(shared),
    });
  });

  it("pins a live checksum for every file every skill installs", () => {
    // The installer tells "the CLI shipped a new version" apart from "the human
    // edited this file" purely by these hashes, and one of the shared
    // references is itself generated from the contract. So a stale manifest is
    // not cosmetic: it makes `skills install` refuse on someone else's machine.
    // `bun scripts/gen-skill-manifest.ts` regenerates it.
    const manifest = JSON.parse(read("skills/manifest.json"));
    for (const skill of manifest.skills as Array<{
      name: string;
      files: Array<{ path: string; source?: string; sha256: string }>;
    }>) {
      for (const file of skill.files) {
        const source = file.source
          ? `skills/${file.source}`
          : `skills/${skill.name}/${file.path}`;
        expect(`${skill.name}/${file.path}: ${sha256(read(source))}`).toBe(
          `${skill.name}/${file.path}: ${file.sha256}`,
        );
      }
    }
  });

  it("provides deterministic proposal lint rules instead of asserting model wording", () => {
    const rules = read("skills/shared/import-mapping-rules.md");
    expect(rules).toContain("AI proposal lint");
    expect(rules).toContain("evidenceIds");
    expect(rules).toContain("confidence");
    expect(rules).toContain("blocking");
    expect(rules).toContain("Do not mark the report `ready`");

    // The release workflow stages skills and their shared references straight
    // from the manifest, so a new skill or reference ships without editing it.
    // Asserting the literal import-mapping paths here is what made this couple
    // to one skill; assert the manifest-driven mechanism instead.
    const workflow = read(".github/workflows/release.yml");
    expect(workflow).toContain("require('./skills/manifest.json').skills.map(s => s.name)");
    expect(workflow).toContain("files.filter(f => f.source)");
    expect(workflow).toContain('cp "skills/${source}"');
  });
});
