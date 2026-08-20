import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  pageFileName,
  portableFiles,
  runPortablePull,
} from "../src/commands/pullPortable";
import type { Output } from "../src/output";

// `snabbsajt pull --format portable` (plan P0-2026-08-19 slice 2.5).
//
// The claim under test is the repository one: a page the client added lands as
// its own file, so the next push carries it and a reviewer can see which page
// moved. The export itself is the server's, on purpose.

function capture(): Output & { out: string[] } {
  const out: string[] = [];
  return { out, stdout: (m) => out.push(m), stderr: () => {} };
}

const site = {
  format: "portable-v1",
  theme: { palette: "sand" },
  pages: [
    { slug: "", title: "Hem" },
    { slug: "tjanster/tandblekning", title: "Tandblekning" },
  ],
};

describe("the file layout", () => {
  it("gives the home page a name a filesystem accepts", () => {
    expect(pageFileName("")).toBe("index.json");
    expect(pageFileName(undefined)).toBe("index.json");
  });

  it("flattens a nested slug into one file", () => {
    // One file per page, never a directory tree: a page renamed into a folder
    // would otherwise leave an orphan nobody notices.
    expect(pageFileName("tjanster/tandblekning")).toBe("tjanster__tandblekning.json");
  });

  it("keeps the pages out of site.json", () => {
    const files = portableFiles(site);
    const siteFile = files.find((file) => file.path === "site.json")!;
    expect(JSON.parse(siteFile.contents).pages).toEqual([]);
    expect(JSON.parse(siteFile.contents).theme).toEqual({ palette: "sand" });
    // One file per page means a page edit is a one-file diff.
    expect(files.map((file) => file.path)).toEqual([
      "site.json",
      join("pages", "index.json"),
      join("pages", "tjanster__tandblekning.json"),
    ]);
  });
});

describe("the command", () => {
  it("writes what the server exported", async () => {
    const dir = mkdtempSync(join(tmpdir(), "snabbsajt-pull-"));
    const output = capture();
    const code = await runPortablePull(
      ["--site", "w1", "--json"],
      true,
      output,
      {
        cwd: dir,
        client: {
          endpoint: "test",
          listTools: async () => [],
          callTool: async (name, args) => {
            expect(name).toBe("export_site");
            expect(args).toEqual({ websiteId: "w1" });
            return { isError: false, text: "", data: { site } };
          },
        },
      },
    );
    expect(code).toBe(0);
    expect(existsSync(join(dir, "snabbsajt/content/site.json"))).toBe(true);
    const page = JSON.parse(
      readFileSync(join(dir, "snabbsajt/content/pages/index.json"), "utf8"),
    );
    expect(page.title).toBe("Hem");
    expect(JSON.parse(output.out.at(-1)!).pages).toBe(2);
  });

  it("writes nothing when the export refuses", async () => {
    const dir = mkdtempSync(join(tmpdir(), "snabbsajt-pull-"));
    await expect(
      runPortablePull(["--site", "w1"], false, capture(), {
        cwd: dir,
        client: {
          endpoint: "test",
          listTools: async () => [],
          callTool: async () => ({ isError: true, text: "site:read missing" }),
        },
      }),
    ).rejects.toThrow(/site:read missing/);
    // A half-written directory is worse than none: the next push would treat
    // the missing pages as deletions.
    expect(existsSync(join(dir, "snabbsajt/content"))).toBe(false);
  });
});
