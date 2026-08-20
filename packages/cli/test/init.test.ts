import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appDirectoryFor,
  scaffoldAgencyProject,
  runInitCommand,
  InitError,
} from "../src/commands/init";
import type { Output } from "../src/output";

// `snabbsajt init --agency` (plan P0-2026-08-19 slice 1.5).
//
// What is worth a test here is not that three files appear. It is that this
// command is safe to run in a repository that already earns an agency money:
// it never overwrites their work, it finds their route directory rather than
// guessing, and a failed pairing still leaves a repository that renders.

function project(withSrcApp = false): string {
  const dir = mkdtempSync(join(tmpdir(), "snabbsajt-init-"));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "agency-app", dependencies: { next: "16.0.0" } }, null, 2),
  );
  if (withSrcApp) mkdirSync(join(dir, "src", "app"), { recursive: true });
  return dir;
}

function capture(): Output & { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, stdout: (m) => out.push(m), stderr: (m) => err.push(m) };
}

describe("the scaffold", () => {
  it("writes the block files and the catch-all route", () => {
    const dir = project();
    const result = scaffoldAgencyProject(dir);
    expect(existsSync(join(dir, "snabbsajt/blocks.ts"))).toBe(true);
    expect(existsSync(join(dir, "snabbsajt/components.ts"))).toBe(true);
    expect(existsSync(join(dir, "app/[[...slug]]/page.tsx"))).toBe(true);
    expect(result.kept).toEqual([]);
    expect(result.addedDependency).toBe(true);
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    expect(pkg.dependencies["@snabbsajt/site-kit"]).toBeDefined();
    // The agency's own next dependency is untouched: this rewrites the file, so
    // anything it drops is something a developer loses.
    expect(pkg.dependencies.next).toBe("16.0.0");
  });

  it("follows the repository's own route directory", () => {
    const dir = project(true);
    scaffoldAgencyProject(dir);
    expect(appDirectoryFor(dir)).toBe(join(dir, "src", "app"));
    expect(existsSync(join(dir, "src/app/[[...slug]]/page.tsx"))).toBe(true);
    expect(existsSync(join(dir, "app/[[...slug]]/page.tsx"))).toBe(false);
  });

  it("never overwrites a file the agency wrote", () => {
    const dir = project();
    mkdirSync(join(dir, "snabbsajt"), { recursive: true });
    writeFileSync(join(dir, "snabbsajt/blocks.ts"), "// ours\n");
    const result = scaffoldAgencyProject(dir);
    expect(readFileSync(join(dir, "snabbsajt/blocks.ts"), "utf8")).toBe("// ours\n");
    expect(result.kept).toContain(join(dir, "snabbsajt/blocks.ts"));
  });

  it("overwrites only when asked to", () => {
    const dir = project();
    mkdirSync(join(dir, "snabbsajt"), { recursive: true });
    writeFileSync(join(dir, "snabbsajt/blocks.ts"), "// ours\n");
    scaffoldAgencyProject(dir, true);
    expect(readFileSync(join(dir, "snabbsajt/blocks.ts"), "utf8")).toContain("defineBlock");
  });

  it("leaves an existing dependency alone", () => {
    const dir = project();
    const pkgPath = join(dir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    pkg.dependencies["@snabbsajt/site-kit"] = "0.4.0";
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    const result = scaffoldAgencyProject(dir);
    expect(result.addedDependency).toBe(false);
    expect(JSON.parse(readFileSync(pkgPath, "utf8")).dependencies["@snabbsajt/site-kit"]).toBe("0.4.0");
  });

  it("refuses a directory that is not a project", () => {
    const dir = mkdtempSync(join(tmpdir(), "snabbsajt-init-bare-"));
    expect(() => scaffoldAgencyProject(dir)).toThrow(InitError);
  });
});

describe("the command", () => {
  it("needs --agency, so a new package still goes through site init", async () => {
    const output = capture();
    expect(await runInitCommand([], output)).toBe(1);
    expect(output.err.join("\n")).toContain("--agency");
  });

  it("runs link, pair and skills in that order", async () => {
    const dir = project();
    const previous = process.cwd();
    process.chdir(dir);
    const seen: string[] = [];
    const output = capture();
    try {
      const code = await runInitCommand(["--agency"], output, {
        link: async () => (seen.push("link"), 0),
        pair: async () => (seen.push("pair"), 0),
        skills: async () => (seen.push("skills"), 0),
      });
      expect(code).toBe(0);
    } finally {
      process.chdir(previous);
    }
    // Read token first: an agency that abandons the pairing halfway still has a
    // repository that renders.
    expect(seen).toEqual(["link", "pair", "skills"]);
  });

  it("keeps the files when the pairing fails, and says so", async () => {
    const dir = project();
    const previous = process.cwd();
    process.chdir(dir);
    const output = capture();
    try {
      const code = await runInitCommand(["--agency"], output, {
        link: async () => 1,
        pair: async () => 0,
        skills: async () => 0,
      });
      expect(code).toBe(1);
    } finally {
      process.chdir(previous);
    }
    expect(existsSync(join(dir, "snabbsajt/blocks.ts"))).toBe(true);
    expect(output.err.join("\n")).toContain("link");
  });

  it("skips the network steps when told to", async () => {
    const dir = project();
    const previous = process.cwd();
    process.chdir(dir);
    const seen: string[] = [];
    const output = capture();
    try {
      const code = await runInitCommand(
        ["--agency", "--no-pair", "--no-skills", "--json"],
        output,
        {
          link: async () => (seen.push("link"), 0),
          pair: async () => (seen.push("pair"), 0),
          skills: async () => (seen.push("skills"), 0),
        },
      );
      expect(code).toBe(0);
    } finally {
      process.chdir(previous);
    }
    expect(seen).toEqual([]);
    const answer = JSON.parse(output.out.at(-1)!);
    expect(answer.ok).toBe(true);
    expect(answer.written.length).toBe(3);
  });
});
