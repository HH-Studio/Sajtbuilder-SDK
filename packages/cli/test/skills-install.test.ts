import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../../..");
const sourceCli = join(repoRoot, "packages/cli/src/cli.ts");

function fixture(): string {
  return mkdtempSync(join(tmpdir(), "snabbsajt-skills-"));
}

function run(
  args: string[],
  cwd: string,
  extraEnv: Record<string, string> = {},
) {
  return spawnSync("bun", [sourceCli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
}

function runJson(
  args: string[],
  cwd: string,
  extraEnv: Record<string, string> = {},
): Record<string, unknown> {
  const result = run([...args, "--json"], cwd, extraEnv);
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

function createDetectedRoot(kind: "codex" | "claude" | "both"): string {
  const root = fixture();
  if (kind === "codex" || kind === "both") mkdirSync(join(root, ".agents/skills"), { recursive: true });
  if (kind === "claude" || kind === "both") mkdirSync(join(root, ".claude/skills"), { recursive: true });
  return root;
}

describe("snabbsajt skills", () => {
  it.each([
    ["codex", [".agents/skills"]],
    ["claude", [".claude/skills"]],
    ["both", [".agents/skills", ".claude/skills"]],
  ] as const)("auto-detects %s project-local agents", (kind, expectedRoots) => {
    const root = createDetectedRoot(kind);
    const result = runJson(["skills", "install", "--agent", "auto"], root);

    expect(result).toMatchObject({ ok: true, command: "skills install", scope: "local" });
    for (const skillRoot of expectedRoots) {
      for (const name of ["import-website", "build-snabbsajt-site", "review-site-package"]) {
        expect(existsSync(join(root, skillRoot, name, "SKILL.md"))).toBe(true);
      }
      expect(existsSync(join(root, skillRoot, "import-website/references/import-mapping-rules.md"))).toBe(true);
    }
  });

  it("reports no detected agent without inventing a project target", () => {
    const root = fixture();
    const result = run(["skills", "install", "--agent", "auto", "--json"], root);

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      code: "NO_AGENT_DETECTED",
    });
    expect(existsSync(join(root, ".agents"))).toBe(false);
    expect(existsSync(join(root, ".claude"))).toBe(false);
  });

  it("requires --global before writing to HOME", () => {
    const root = fixture();
    const home = fixture();
    mkdirSync(join(home, ".agents/skills"), { recursive: true });

    const local = run(["skills", "install", "--agent", "codex", "--json"], root, { HOME: home });
    expect(local.status).toBe(0);
    expect(existsSync(join(root, ".agents/skills/import-website/SKILL.md"))).toBe(true);
    expect(existsSync(join(home, ".agents/skills/import-website/SKILL.md"))).toBe(false);

    const global = runJson(["skills", "install", "--agent", "codex", "--global"], root, { HOME: home });
    expect(global).toMatchObject({ scope: "global" });
    expect(existsSync(join(home, ".agents/skills/import-website/SKILL.md"))).toBe(true);
  });

  it("installs cleanly, lists skills, verifies checksums, and updates an unmodified receipt", () => {
    const root = createDetectedRoot("codex");
    const first = runJson(["skills", "install", "--agent", "auto"], root);
    expect(first).toMatchObject({ installed: 3, updated: 0 });

    const listed = runJson(["skills", "list", "--agent", "auto"], root);
    expect(listed).toMatchObject({ ok: true, command: "skills list" });
    expect(listed.skills).toHaveLength(3);

    const doctor = runJson(["skills", "doctor", "--agent", "auto"], root);
    expect(doctor).toMatchObject({ ok: true, command: "skills doctor", valid: 3, modified: 0 });

    const second = runJson(["skills", "install", "--agent", "auto"], root);
    expect(second).toMatchObject({ installed: 0, updated: 0, unchanged: 3 });
  });

  it("updates a previously unmodified skill when canonical assets advance", () => {
    const root = createDetectedRoot("codex");
    runJson(["skills", "install", "--agent", "auto"], root);
    const assets = join(fixture(), "skills");
    cpSync(join(repoRoot, "skills"), assets, { recursive: true });
    const source = join(assets, "import-website/SKILL.md");
    writeFileSync(source, `${readFileSync(source, "utf8")}\nUpdated canonical guidance.\n`);
    const manifestPath = join(assets, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.releaseVersion = "1.0.1";
    manifest.skills[0].version = "1.0.1";
    manifest.skills[0].files[0].sha256 = createHash("sha256").update(readFileSync(source)).digest("hex");
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const updated = runJson(["skills", "install", "--agent", "auto"], root, {
      SNABBSAJT_SKILLS_DIR: assets,
    });
    expect(updated).toMatchObject({ installed: 0, updated: 1, unchanged: 2, valid: 3 });
    expect(readFileSync(join(root, ".agents/skills/import-website/SKILL.md"), "utf8"))
      .toContain("Updated canonical guidance.");
  });

  it("refuses a modified install until --force, then creates a backup and verifies the replacement", () => {
    const root = createDetectedRoot("codex");
    runJson(["skills", "install", "--agent", "auto"], root);
    const target = join(root, ".agents/skills/import-website/SKILL.md");
    writeFileSync(target, `${readFileSync(target, "utf8")}\nlocal change\n`);

    const humanRefusal = run(["skills", "install", "--agent", "auto"], root);
    expect(humanRefusal.status).toBe(1);
    expect(humanRefusal.stderr).toContain("Diff:");
    expect(humanRefusal.stderr).toContain("import-website/SKILL.md");
    expect(humanRefusal.stderr).toContain("Backup path:");
    expect(humanRefusal.stderr).toContain(".snabbsajt-backups");

    const refused = run(["skills", "install", "--agent", "auto", "--json"], root);
    expect(refused.status).toBe(1);
    const error = JSON.parse(refused.stderr);
    expect(error).toMatchObject({ ok: false, code: "MODIFIED_INSTALL" });
    expect(error.diff).toContain("SKILL.md");
    expect(error.backupPath).toContain(".snabbsajt-backups");
    expect(readFileSync(target, "utf8")).toContain("local change");

    const forced = runJson(["skills", "install", "--agent", "auto", "--force"], root);
    expect(forced).toMatchObject({ updated: 1, valid: 3 });
    expect(forced.backups).toHaveLength(1);
    expect(existsSync((forced.backups as string[])[0])).toBe(true);
    expect(readFileSync(target, "utf8")).not.toContain("local change");
  });

  it("rejects incompatible skill manifests", () => {
    const root = createDetectedRoot("codex");
    const assets = join(fixture(), "skills");
    cpSync(join(repoRoot, "skills"), assets, { recursive: true });
    const manifestPath = join(assets, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.minimumCliVersion = "99.0.0";
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = run(["skills", "install", "--agent", "auto", "--json"], root, {
      SNABBSAJT_SKILLS_DIR: assets,
    });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({ ok: false, code: "INCOMPATIBLE_CLI" });
  });

  it.each([
    ["portableFormat", (manifest: any) => { manifest.portableFormat.version = 99; }, "INCOMPATIBLE_PORTABLE_FORMAT"],
    ["reportContract", (manifest: any) => { manifest.reportContract.version = "99"; }, "INCOMPATIBLE_REPORT_CONTRACT"],
    ["prerelease", (manifest: any) => { manifest.minimumCliVersion = "0.1.0-alpha.1"; }, "INVALID_MANIFEST"],
  ])("rejects incompatible %s metadata", (_name, mutate, code) => {
    const root = createDetectedRoot("codex");
    const assets = join(fixture(), "skills");
    cpSync(join(repoRoot, "skills"), assets, { recursive: true });
    const manifestPath = join(assets, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    mutate(manifest);
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = run(["skills", "install", "--agent", "auto", "--json"], root, {
      SNABBSAJT_SKILLS_DIR: assets,
    });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({ ok: false, code });
  });

  it("rejects path traversal in a manifest before writing", () => {
    const root = createDetectedRoot("codex");
    const assets = join(fixture(), "skills");
    cpSync(join(repoRoot, "skills"), assets, { recursive: true });
    const manifestPath = join(assets, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.skills[0].files.push({ path: "../escape", sha256: "0".repeat(64) });
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = run(["skills", "install", "--agent", "auto", "--json"], root, {
      SNABBSAJT_SKILLS_DIR: assets,
    });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({ ok: false, code: "UNSAFE_PATH" });
    expect(existsSync(join(root, ".agents/escape"))).toBe(false);
  });

  it("rejects Windows-style traversal in manifest paths on every host OS", () => {
    const root = createDetectedRoot("codex");
    const assets = join(fixture(), "skills");
    cpSync(join(repoRoot, "skills"), assets, { recursive: true });
    const manifestPath = join(assets, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.skills[0].files[0].source = "shared\\..\\outside.md";
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = run(["skills", "install", "--agent", "auto", "--json"], root, { SNABBSAJT_SKILLS_DIR: assets });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({ ok: false, code: "UNSAFE_PATH" });
  });

  it("rejects symlinked install roots and skill targets", () => {
    const root = fixture();
    const outside = fixture();
    mkdirSync(join(root, ".agents"), { recursive: true });
    symlinkSync(outside, join(root, ".agents/skills"));

    const rootResult = run(["skills", "install", "--agent", "auto", "--json"], root);
    expect(rootResult.status).toBe(1);
    expect(JSON.parse(rootResult.stderr)).toMatchObject({ ok: false, code: "SYMLINK_TARGET" });
    expect(existsSync(join(outside, "import-website"))).toBe(false);

    const second = createDetectedRoot("codex");
    const outsideSkill = fixture();
    symlinkSync(outsideSkill, join(second, ".agents/skills/import-website"));
    const targetResult = run(["skills", "install", "--agent", "auto", "--json"], second);
    expect(targetResult.status).toBe(1);
    expect(JSON.parse(targetResult.stderr)).toMatchObject({ ok: false, code: "SYMLINK_TARGET" });
    expect(lstatSync(join(second, ".agents/skills/import-website")).isSymbolicLink()).toBe(true);
  });

  it("rejects a symlinked backup directory before a forced replacement", () => {
    const root = createDetectedRoot("codex");
    runJson(["skills", "install", "--agent", "auto"], root);
    const target = join(root, ".agents/skills/import-website/SKILL.md");
    writeFileSync(target, `${readFileSync(target, "utf8")}\nlocal change\n`);
    const outside = fixture();
    symlinkSync(outside, join(root, ".agents/skills/.snabbsajt-backups"));

    const result = run(["skills", "install", "--agent", "auto", "--force", "--json"], root);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({ ok: false, code: "SYMLINK_TARGET" });
    expect(existsSync(join(outside, "import-website"))).toBe(false);
    expect(readFileSync(target, "utf8")).toContain("local change");
  });

  it("rejects a broken receipt symlink without writing through it", () => {
    const root = createDetectedRoot("codex");
    const receipt = join(root, ".agents/skills/.snabbsajt-skills.json");
    const outside = join(fixture(), "outside-receipt.json");
    symlinkSync(outside, receipt);

    const result = run(["skills", "install", "--agent", "auto", "--json"], root);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({ ok: false, code: "SYMLINK_TARGET" });
    expect(existsSync(outside)).toBe(false);
    expect(existsSync(join(root, ".agents/skills/import-website"))).toBe(false);
  });

  it("rejects undeclared source files and leaves the previous install untouched", () => {
    const root = createDetectedRoot("codex");
    runJson(["skills", "install", "--agent", "auto"], root);
    const installed = join(root, ".agents/skills/import-website/SKILL.md");
    const before = readFileSync(installed, "utf8");
    const assets = join(fixture(), "skills");
    cpSync(join(repoRoot, "skills"), assets, { recursive: true });
    writeFileSync(join(assets, "import-website/undeclared.txt"), "must not be installed");

    const result = run(["skills", "install", "--agent", "auto", "--json"], root, {
      SNABBSAJT_SKILLS_DIR: assets,
    });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({ ok: false, code: "CHECKSUM_MISMATCH" });
    expect(readFileSync(installed, "utf8")).toBe(before);
    expect(existsSync(join(root, ".agents/skills/import-website/undeclared.txt"))).toBe(false);
  });

  it("rejects undeclared or checksum-mismatched shared skill sources", () => {
    const root = createDetectedRoot("codex");
    const assets = join(fixture(), "skills");
    cpSync(join(repoRoot, "skills"), assets, { recursive: true });
    writeFileSync(join(assets, "shared/undeclared.md"), "must not ship");
    let result = run(["skills", "install", "--agent", "auto", "--json"], root, { SNABBSAJT_SKILLS_DIR: assets });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({ ok: false, code: "CHECKSUM_MISMATCH" });

    const cleanAssets = join(fixture(), "skills");
    cpSync(join(repoRoot, "skills"), cleanAssets, { recursive: true });
    writeFileSync(join(cleanAssets, "shared/import-mapping-rules.md"), "modified without manifest update");
    result = run(["skills", "install", "--agent", "auto", "--json"], root, { SNABBSAJT_SKILLS_DIR: cleanAssets });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({ ok: false, code: "CHECKSUM_MISMATCH" });
  });

  it("rejects a symlinked shared skill source directory", () => {
    const root = createDetectedRoot("codex");
    const assets = join(fixture(), "skills");
    cpSync(join(repoRoot, "skills"), assets, { recursive: true });
    const outside = join(fixture(), "shared");
    cpSync(join(assets, "shared"), outside, { recursive: true });
    rmSync(join(assets, "shared"), { recursive: true });
    symlinkSync(outside, join(assets, "shared"));

    const result = run(["skills", "install", "--agent", "auto", "--json"], root, { SNABBSAJT_SKILLS_DIR: assets });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({ ok: false, code: "UNSAFE_PATH" });
  });

  it("rejects nested source symlinks before copying", () => {
    const root = createDetectedRoot("codex");
    const assets = join(fixture(), "skills");
    cpSync(join(repoRoot, "skills"), assets, { recursive: true });
    const outside = join(fixture(), "outside.txt");
    writeFileSync(outside, "outside");
    symlinkSync(outside, join(assets, "import-website/nested-link"));

    const result = run(["skills", "install", "--agent", "auto", "--json"], root, {
      SNABBSAJT_SKILLS_DIR: assets,
    });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({ ok: false, code: "UNSAFE_PATH" });
    expect(existsSync(join(root, ".agents/skills/import-website"))).toBe(false);
  });

  it("ships canonical assets in the CLI tarball configuration and release workflow", () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, "packages/cli/package.json"), "utf8"));
    expect(packageJson.files).toContain("dist/skills");
    expect(packageJson.scripts.build).toContain("sync-skills-assets.ts");
    const workflow = readFileSync(join(repoRoot, ".github/workflows/release.yml"), "utf8");
    expect(workflow).toContain("import-website build-snabbsajt-site review-site-package");
    expect(workflow).toMatch(/sha256sum|shasum -a 256/);
    expect(workflow).toContain(".zip");
    expect(workflow).toContain('GITHUB_REF_NAME" = "v${version}');
    expect(workflow).toMatch(/softprops\/action-gh-release@[0-9a-f]{40}/);
  });
});
