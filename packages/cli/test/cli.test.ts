import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
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
  it("documents only the local Task 4 commands and their keyless behavior", () => {
    const result = run(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("snabbsajt site init");
    expect(result.stdout).toContain("snabbsajt site inspect");
    expect(result.stdout).toContain("snabbsajt site validate");
    expect(result.stdout).toContain("snabbsajt site pack");
    expect(result.stdout).toContain("snabbsajt site doctor");
    expect(result.stdout).toContain("No API key is required");
    expect(result.stdout).not.toContain("site import");
    expect(result.stdout).not.toContain("skills install");
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

  it("preserves non-JSON output and failure exit codes", () => {
    const root = mkdtempSync(join(tmpdir(), "snabbsajt-cli-errors-"));
    const siteDir = join(root, "site");

    const created = run(["site", "init", siteDir]);
    expect(created.status).toBe(0);
    expect(created.stdout).toContain(`created ${siteDir}`);

    const missing = run(["site", "validate", join(root, "missing")]);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("snabbsajt: ");

    const unsupported = run(["skills", "install"]);
    expect(unsupported.status).toBe(1);
    expect(unsupported.stderr).toContain("unknown command");
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
