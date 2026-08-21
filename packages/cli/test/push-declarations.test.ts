import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadDeclarations, withDeclarations } from "../src/commands/push/declarations";

// What a repository declares, folded into the push. Plan: slices 3.4 and 3.7 of
// the app's P0-2026-08-19 master plan, both of which stopped at "registerBlocks
// has no CLI caller".

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "snabbsajt-declarations-"));
  mkdirSync(join(dir, "snabbsajt"), { recursive: true });
  return dir;
}

describe("loadDeclarations", () => {
  it("says nothing and complains about nothing when the repo declares nothing", async () => {
    const declarations = await loadDeclarations(repo());
    expect(declarations.blockSchemas).toBeUndefined();
    expect(declarations.contentCollections).toBeUndefined();
    expect(declarations.warnings).toEqual([]);
  });

  it("reads a declarations.json a build step wrote", async () => {
    const dir = repo();
    writeFileSync(
      join(dir, "snabbsajt", "declarations.json"),
      JSON.stringify({
        blockSchemas: [{ type: "hero", label: "Hero", version: 1, fields: [] }],
        contentCollections: [
          {
            tmpId: "collection-cases",
            kind: "custom",
            name: "Referenser",
            slugPrefix: "referenser",
            order: 0,
            source: "repo",
            externalKey: "cases",
            fields: [],
          },
        ],
      }),
    );
    const declarations = await loadDeclarations(dir);
    expect(declarations.blockSchemas).toHaveLength(1);
    expect(declarations.contentCollections?.[0]?.externalKey).toBe("cases");
    expect(declarations.sources[0]).toContain("declarations.json");
  });

  it("reports a broken declarations file instead of throwing, so the content still lands", async () => {
    const dir = repo();
    writeFileSync(join(dir, "snabbsajt", "declarations.json"), "{ not json");
    const declarations = await loadDeclarations(dir);
    expect(declarations.blockSchemas).toBeUndefined();
    expect(declarations.warnings).toHaveLength(1);
    expect(declarations.warnings[0]).toContain("declarations.json");
  });

  it("names the file when --register points at nothing", async () => {
    const declarations = await loadDeclarations(repo(), "snabbsajt/missing.json");
    expect(declarations.warnings[0]).toContain("does not exist");
  });

  it("reads plain JavaScript declaration files on any Node", async () => {
    const dir = repo();
    writeFileSync(
      join(dir, "snabbsajt", "blocks.mjs"),
      "export const library = { hero: { type: 'hero', label: 'Hero', version: 2, fields: [{ key: 'heading', kind: 'text' }] } };\n",
    );
    const declarations = await loadDeclarations(dir);
    expect(declarations.blockSchemas).toEqual([
      { type: "hero", label: "Hero", version: 2, fields: [{ key: "heading", kind: "text" }] },
    ]);
  });

  it("says which file exported no library rather than sending an empty one", async () => {
    const dir = repo();
    writeFileSync(join(dir, "snabbsajt", "blocks.mjs"), "export const nope = 1;\n");
    const declarations = await loadDeclarations(dir);
    expect(declarations.blockSchemas).toBeUndefined();
    expect(declarations.warnings[0]).toContain("exports no block library");
  });
});

describe("withDeclarations", () => {
  const declarations = {
    blockSchemas: [{ type: "hero", label: "Hero", version: 1, fields: [] }],
    contentCollections: [
      {
        tmpId: "collection-cases",
        kind: "custom" as const,
        name: "Referenser",
        slugPrefix: "referenser",
        order: 0,
        source: "repo" as const,
        externalKey: "cases",
        fields: [],
      },
    ],
    sources: [],
    warnings: [],
  };

  it("adds what the package is silent about", () => {
    const merged = withDeclarations({ version: 1 } as Record<string, unknown>, declarations);
    expect(merged.blockSchemas).toHaveLength(1);
    expect(merged.contentCollections).toHaveLength(1);
  });

  it("never overwrites what the package already carries", () => {
    // A pulled repo's site.json already holds the collections the client filled
    // in, rows included. A declaration with no rows must not land on top of a
    // month of their typing.
    const pulled = {
      version: 1,
      contentCollections: [{ tmpId: "c1", kind: "custom", name: "Kept", slugPrefix: "kept", order: 0 }],
    } as Record<string, unknown>;
    const merged = withDeclarations(pulled, declarations);
    expect((merged.contentCollections as { name: string }[])[0]?.name).toBe("Kept");
    // The half it says nothing about still arrives.
    expect(merged.blockSchemas).toHaveLength(1);
  });
});
