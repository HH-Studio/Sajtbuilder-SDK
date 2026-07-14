import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  truncateSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { readBoundedLocalFiles } from "@snabbsajt/site-kit/local-files";

const repoRoot = resolve(import.meta.dirname, "../../..");
const sourceCli = join(repoRoot, "packages/cli/src/cli.ts");

function run(args: string[], cwd = repoRoot) {
  return spawnSync("bun", [sourceCli, ...args], {
    cwd,
    encoding: "utf8",
  });
}

function runJson(args: string[], cwd = repoRoot): unknown {
  const result = run([...args, "--json"], cwd);
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

describe("snabbsajt site CLI", () => {
  it("documents local site, HTML import, and skill commands", () => {
    const result = run(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("snabbsajt site init");
    expect(result.stdout).toContain("snabbsajt site inspect");
    expect(result.stdout).toContain("snabbsajt site validate");
    expect(result.stdout).toContain("snabbsajt site pack");
    expect(result.stdout).toContain("snabbsajt site doctor");
    expect(result.stdout).toContain("No API key is required");
    expect(result.stdout).toContain("site import html");
    expect(result.stdout).toContain("skills install");
  });

  it("reports stable local compatibility data without making a network request", () => {
    expect(runJson(["site", "doctor"])).toEqual({
      ok: true,
      command: "site doctor",
      cli: { package: "@snabbsajt/cli", version: "0.1.0" },
      siteKit: { package: "@snabbsajt/site-kit", version: "0.1.0" },
      portableFormat: { format: "sajt-site", version: 1 },
      importReport: { format: "snabbsajt-import-report", version: "1" },
      skills: { supportedManifestVersion: 1, installed: false },
    });
  });

  it("delegates init, inspect, validate, and pack with machine-readable output", () => {
    const root = mkdtempSync(join(tmpdir(), "snabbsajt-cli-"));
    const siteDir = join(root, "site");
    const bundle = join(root, "site.zip");

    expect(runJson(["site", "init", siteDir, "--template", "html"])).toEqual({
      ok: true,
      command: "site init",
      directory: siteDir,
      template: "html",
    });
    expect(JSON.parse(readFileSync(join(siteDir, "site.json"), "utf8")).format).toBe("sajt-site");

    expect(runJson(["site", "validate", siteDir])).toMatchObject({
      ok: true,
      command: "site validate",
      errors: 0,
      issues: [],
    });
    expect(runJson(["site", "inspect", siteDir])).toEqual({
      ok: true,
      command: "site inspect",
      businessName: "Example Studio",
      language: "en",
      pages: 1,
      sections: 3,
      assets: 0,
      sectionTypes: ["hero", "contact", "footer"],
    });
    expect(runJson(["site", "pack", siteDir, "-o", bundle])).toMatchObject({
      ok: true,
      command: "site pack",
      output: bundle,
    });
    expect(existsSync(bundle)).toBe(true);
  });

  it("imports HTML artifacts and durably gates unresolved review drafts", () => {
    const root = mkdtempSync(join(tmpdir(), "snabbsajt-cli-import-"));
    const source = join(root, "source.html");
    const packageDir = join(root, "package");
    const bundle = join(root, "review-draft.zip");
    writeFileSync(source, `<h1>Studio</h1><form action="/unknown" method="post"><input name="email" type="email"></form><script>alert('inert')</script>`);

    expect(runJson(["site", "import", "html", source, "-o", packageDir])).toMatchObject({
      ok: true,
      command: "site import html",
      directory: packageDir,
      status: "review_required",
      publishReady: false,
    });
    for (const artifact of ["site.json", "evidence.json", "import-report.json", "import-report.md", "validation.json", "import-provenance.json", "REVIEW-DRAFT.md"]) {
      expect(existsSync(join(packageDir, artifact))).toBe(true);
    }

    const refused = run(["site", "pack", packageDir, "-o", bundle]);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("explicitly pass --review-draft");

    expect(runJson(["site", "pack", packageDir, "-o", bundle, "--review-draft"])).toMatchObject({
      ok: true,
      reviewDraft: true,
      publishReady: false,
    });
    const archive = unzipSync(readFileSync(bundle));
    expect(archive["site.json"]).toBeUndefined();
    expect(archive["REVIEW-DRAFT/site.json"]).toBeDefined();
    expect(archive["REVIEW-DRAFT/import-report.json"]).toBeDefined();
    expect(archive["REVIEW-DRAFT/import-report.md"]).toBeDefined();
    expect(archive["REVIEW-DRAFT/evidence.json"]).toBeDefined();
    expect(JSON.parse(new TextDecoder().decode(archive["REVIEW-DRAFT.json"]))).toMatchObject({
      kind: "snabbsajt-review-draft",
      reportStatus: "review_required",
      publishReady: false,
    });

    unlinkSync(join(packageDir, "import-report.json"));
    const bypass = run(["site", "pack", packageDir, "--review-draft"]);
    expect(bypass.status).toBe(1);
    expect(bypass.stderr).toContain("packing cannot bypass its review state");
  });

  it("supports explicit review approval and then emits a normal publish-ready bundle", () => {
    const root = mkdtempSync(join(tmpdir(), "snabbsajt-cli-approve-"));
    const source = join(root, "source.html");
    const packageDir = join(root, "package");
    const bundle = join(root, "site.zip");
    writeFileSync(source, `<title>Studio</title><h1>Studio</h1><form action="/unknown" method="post"><input name="email"></form>`);
    expect(runJson(["site", "import", "html", source, "-o", packageDir])).toMatchObject({ status: "review_required" });
    expect(runJson(["site", "import", "approve", packageDir, "--yes"])).toMatchObject({
      ok: true,
      status: "ready",
      publishReady: true,
    });
    const report = JSON.parse(readFileSync(join(packageDir, "import-report.json"), "utf8"));
    expect(report.items.some((item: { resolution?: unknown }) => item.resolution)).toBe(true);
    expect(existsSync(join(packageDir, "REVIEW-DRAFT.md"))).toBe(false);
    expect(runJson(["site", "pack", packageDir, "-o", bundle])).toMatchObject({ publishReady: true, reviewDraft: false });
    const archive = unzipSync(readFileSync(bundle));
    expect(archive["site.json"]).toBeDefined();
    expect(archive["REVIEW-DRAFT.json"]).toBeUndefined();
  });

  it("still detects an imported package after the primary gate files are deleted", () => {
    const root = mkdtempSync(join(tmpdir(), "snabbsajt-cli-gate-removal-"));
    const source = join(root, "source.html");
    const packageDir = join(root, "package");
    writeFileSync(source, `<h1>Studio</h1><form action="/unknown"><input name="email"></form>`);
    expect(runJson(["site", "import", "html", source, "-o", packageDir])).toMatchObject({ status: "review_required" });
    unlinkSync(join(packageDir, "import-report.json"));
    unlinkSync(join(packageDir, "import-provenance.json"));
    unlinkSync(join(packageDir, "REVIEW-DRAFT.md"));
    const bypass = run(["site", "pack", packageDir]);
    expect(bypass.status).toBe(1);
    expect(bypass.stderr).toContain("packing cannot bypass its review state");
  });

  it("shows nested import and pack help without treating help as input", () => {
    expect(run(["site", "import", "--help"]).stdout).toContain("site import approve");
    expect(run(["site", "import", "html", "--help"]).stdout).toContain("site import approve");
    expect(run(["site", "import", "approve", "--help"]).stdout).toContain("Blocked or invalid imports cannot be approved");
    expect(run(["site", "pack", "--help"]).stdout).toContain("Review drafts are not importable");
  });

  it("rejects ambiguous and misspelled HTML import or pack options", () => {
    const root = mkdtempSync(join(tmpdir(), "snabbsajt-cli-options-"));
    const source = join(root, "source.html");
    const packageDir = join(root, "package");
    writeFileSync(source, "<h1>Studio</h1>");

    expect(run(["site", "import", "html", source, "-o"]).stderr).toContain("-o requires a directory");
    expect(run(["site", "import", "html", source, "extra.html"]).stderr).toContain("unexpected site import html argument");
    expect(run(["site", "import", "html", source, "--ouput", packageDir]).stderr).toContain("unknown site import html option");
    expect(runJson(["site", "import", "html", source, "-o", packageDir])).toMatchObject({ ok: true });
    expect(run(["site", "pack", packageDir, "--review-darft"]).stderr).toContain("unknown site pack option");
    expect(run(["site", "pack", packageDir, "-o"]).stderr).toContain("-o requires a file path");
  });

  it("preserves non-JSON output and failure exit codes", () => {
    const root = mkdtempSync(join(tmpdir(), "snabbsajt-cli-errors-"));
    const siteDir = join(root, "site");

    const created = run(["site", "init", siteDir]);
    expect(created.status).toBe(0);
    expect(created.stdout).toContain(`created ${siteDir}`);

    const missing = run(["site", "validate", join(root, "missing")]);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("snabbsajt: ");

    const undetected = run(["skills", "install"]);
    expect(undetected.status).toBe(1);
    expect(undetected.stderr).toContain("no project-local agent skill directory found");
  });

  it("refuses to overwrite files in an existing target directory", () => {
    const root = mkdtempSync(join(tmpdir(), "snabbsajt-cli-existing-"));
    const siteDir = join(root, "site");
    const readme = join(siteDir, "README.md");
    mkdirSync(siteDir);
    writeFileSync(readme, "keep me");

    const result = run(["site", "init", siteDir]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("not empty");
    expect(readFileSync(readme, "utf8")).toBe("keep me");
    expect(existsSync(join(siteDir, "site.json"))).toBe(false);

    const legacy = spawnSync("bun", [join(repoRoot, "src/cli.ts"), "init", siteDir], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(legacy.status).toBe(1);
    expect(legacy.stderr).toContain("not empty");
    expect(readFileSync(readme, "utf8")).toBe("keep me");
  });

  it("rejects excessive local package files before reading them", () => {
    const root = mkdtempSync(join(tmpdir(), "snabbsajt-bounded-files-"));
    const tooMany = join(root, "too-many");
    const tooLarge = join(root, "too-large");
    const tooLargeTogether = join(root, "too-large-together");
    mkdirSync(tooMany);
    mkdirSync(tooLarge);
    mkdirSync(tooLargeTogether);
    writeFileSync(join(tooMany, "a"), "");
    writeFileSync(join(tooMany, "b"), "");
    writeFileSync(join(tooMany, "c"), "");
    writeFileSync(join(tooLarge, "a"), "");
    writeFileSync(join(tooLargeTogether, "a"), "");
    writeFileSync(join(tooLargeTogether, "b"), "");
    truncateSync(join(tooLarge, "a"), 6);
    truncateSync(join(tooLargeTogether, "a"), 5);
    truncateSync(join(tooLargeTogether, "b"), 5);

    expect(() =>
      readBoundedLocalFiles(tooMany, { maxFiles: 2, maxSingleBytes: 5, maxTotalBytes: 8 }),
    ).toThrow(/file cap/);
    expect(() =>
      readBoundedLocalFiles(tooLarge, { maxFiles: 2, maxSingleBytes: 5, maxTotalBytes: 8 }),
    ).toThrow(/byte cap/);
    expect(() =>
      readBoundedLocalFiles(tooLargeTogether, {
        maxFiles: 2,
        maxSingleBytes: 5,
        maxTotalBytes: 8,
      }),
    ).toThrow(/total byte cap/);
  });

  it("refuses a symlinked generated file without overwriting its target", () => {
    const root = mkdtempSync(join(tmpdir(), "snabbsajt-cli-symlink-init-"));
    const siteDir = join(root, "site");
    const outsideReadme = join(root, "outside-readme.md");
    mkdirSync(siteDir);
    writeFileSync(outsideReadme, "outside content must survive");
    symlinkSync(outsideReadme, join(siteDir, "README.md"));

    const result = run(["site", "init", siteDir]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("not empty");
    expect(readFileSync(outsideReadme, "utf8")).toBe("outside content must survive");
    expect(existsSync(join(siteDir, "site.json"))).toBe(false);
  });

  it("derives doctor versions and CI tarball paths instead of hard-coding a release", () => {
    const cliPackage = JSON.parse(
      readFileSync(join(repoRoot, "packages/cli/package.json"), "utf8"),
    );
    const siteKitPackage = JSON.parse(
      readFileSync(join(repoRoot, "packages/site-kit/package.json"), "utf8"),
    );
    expect(runJson(["site", "doctor"])).toMatchObject({
      cli: { version: cliPackage.version },
      siteKit: { version: siteKitPackage.version },
    });

    const source = readFileSync(join(repoRoot, "packages/cli/src/commands/site.ts"), "utf8");
    const workflow = readFileSync(join(repoRoot, ".github/workflows/ci.yml"), "utf8");
    expect(source).not.toMatch(/(?:CLI|SITE_KIT)_VERSION\s*=\s*"\d/);
    expect(workflow).not.toMatch(/snabbsajt-(?:site-kit|cli)-\d+\.\d+\.\d+\.tgz/);
  });

  it.runIf(process.env.SNABBSAJT_TARBALL_SMOKE === "1")(
    "installs both tarballs cleanly and runs the documented quick commands",
    () => {
      const siteKitTarball = process.env.SITE_KIT_TARBALL;
      const cliTarball = process.env.CLI_TARBALL;
      expect(siteKitTarball).toBeTruthy();
      expect(cliTarball).toBeTruthy();

      const fixture = mkdtempSync(join(tmpdir(), "snabbsajt-tarball-"));
      execFileSync("npm", ["init", "-y"], { cwd: fixture, stdio: "pipe" });
      execFileSync(
        "npm",
        [
          "install",
          "--no-audit",
          "--no-fund",
          "--cache",
          join(fixture, ".npm-cache"),
          siteKitTarball!,
          cliTarball!,
        ],
        { cwd: fixture, stdio: "pipe" },
      );
      const cli = join(fixture, "node_modules/.bin/snabbsajt");
      const siteKit = join(fixture, "node_modules/.bin/site-kit");
      execFileSync(cli, ["site", "init", "quick-site"], { cwd: fixture, stdio: "pipe" });
      execFileSync(cli, ["site", "inspect", "quick-site", "--json"], { cwd: fixture, stdio: "pipe" });
      execFileSync(cli, ["site", "validate", "quick-site"], { cwd: fixture, stdio: "pipe" });
      execFileSync(cli, ["site", "doctor", "--json"], { cwd: fixture, stdio: "pipe" });
      execFileSync(cli, ["site", "pack", "quick-site", "-o", "quick-site.zip"], {
        cwd: fixture,
        stdio: "pipe",
      });
      expect(existsSync(join(fixture, "quick-site.zip"))).toBe(true);
      execFileSync(siteKit, ["--help"], { cwd: fixture, stdio: "pipe" });
      execFileSync(siteKit, ["init", "legacy-site"], { cwd: fixture, stdio: "pipe" });
      execFileSync(siteKit, ["validate", "legacy-site"], { cwd: fixture, stdio: "pipe" });
      execFileSync(siteKit, ["pack", "legacy-site", "-o", "legacy-site.zip"], {
        cwd: fixture,
        stdio: "pipe",
      });
      expect(existsSync(join(fixture, "legacy-site.zip"))).toBe(true);
    },
    30_000,
  );
});
