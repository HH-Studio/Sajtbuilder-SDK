import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  importSanityToDirectory,
  proposeSanityMapping,
} from "../src/commands/site/import-sanity";

// The two-step flow is the feature: propose, a person reads it, then convert.
// These tests hold the two ends of that contract - the proposal is written and
// nothing is converted, and a mapping the tool would refuse stops the run
// instead of importing a guess.

function tarOne(name: string, body: string): Uint8Array {
  const bytes = new TextEncoder().encode(body);
  const header = new Uint8Array(512);
  const write = (text: string, at: number, len: number): void => {
    header.set(new TextEncoder().encode(text).subarray(0, len), at);
  };
  write(name, 0, 100);
  write("000644 ", 100, 8);
  write(`${bytes.byteLength.toString(8).padStart(11, "0")} `, 124, 12);
  header[156] = "0".charCodeAt(0);
  header.fill(32, 148, 156);
  let sum = 0;
  for (const byte of header) sum += byte;
  write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8);
  const padded = new Uint8Array(Math.ceil(bytes.byteLength / 512) * 512);
  padded.set(bytes);
  const out = new Uint8Array(512 + padded.byteLength + 1024);
  out.set(header, 0);
  out.set(padded, 512);
  return out;
}

function fixture(): { dir: string; exportPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "sanity-cli-"));
  const docs = [
    { _id: "p1", _type: "property", title: "Storgatan 1", price: 1 },
    { _id: "p2", _type: "property", title: "Lillgatan 2", price: 2 },
    { _id: "p3", _type: "property", title: "Nygatan 3", price: 3 },
  ];
  const exportPath = join(dir, "production.tar.gz");
  writeFileSync(
    exportPath,
    gzipSync(
      Buffer.from(tarOne("data.ndjson", docs.map((d) => JSON.stringify(d)).join("\n"))),
    ),
  );
  return { dir, exportPath };
}

describe("snabbsajt site import sanity", () => {
  it("writes a mapping and converts nothing on the proposal step", () => {
    const { dir, exportPath } = fixture();
    const mappingPath = join(dir, "sanity-mapping.json");
    const result = proposeSanityMapping(exportPath, undefined, mappingPath);
    expect(result.documents).toBe(3);
    const mapping = JSON.parse(readFileSync(mappingPath, "utf8"));
    expect(mapping.revision).toBe("snabbsajt.sanity-mapping/v1");
    expect(mapping.types[0].becomes).toBe("collection");
    // Nothing else was written: the step stops on purpose.
    expect(existsSync(join(dir, "site.json"))).toBe(false);
  });

  it("never overwrites a mapping somebody already corrected", () => {
    const { dir, exportPath } = fixture();
    const mappingPath = join(dir, "sanity-mapping.json");
    proposeSanityMapping(exportPath, undefined, mappingPath);
    expect(() => proposeSanityMapping(exportPath, undefined, mappingPath)).toThrow();
  });

  it("refuses a mapping it cannot run, by name, rather than importing a guess", () => {
    const { dir, exportPath } = fixture();
    const mappingPath = join(dir, "bad.json");
    writeFileSync(
      mappingPath,
      JSON.stringify({
        revision: "snabbsajt.sanity-mapping/v1",
        types: [{ from: "property", becomes: "collection", fields: [] }],
      }),
    );
    expect(() =>
      importSanityToDirectory(
        exportPath,
        undefined,
        mappingPath,
        join(dir, "out"),
        "Mäklaren AB",
        "0.0.0-test",
      ),
    ).toThrow(/key|titleField/);
  });

  it("writes a package whose report names what did not come across", () => {
    const { dir, exportPath } = fixture();
    const mappingPath = join(dir, "sanity-mapping.json");
    proposeSanityMapping(exportPath, undefined, mappingPath);
    const out = join(dir, "out");
    const result = importSanityToDirectory(
      exportPath,
      undefined,
      mappingPath,
      out,
      "Mäklaren AB",
      "0.0.0-test",
      { now: "2026-08-22T00:00:00.000Z" },
    );
    expect(result.site.collectionRows).toHaveLength(3);
    expect(existsSync(join(out, "site.json"))).toBe(true);
    expect(existsSync(join(out, "import-report.md"))).toBe(true);
    const report = JSON.parse(readFileSync(join(out, "import-report.json"), "utf8"));
    expect(report.adapter.id).toBe("sanity");
    expect(report.items.length).toBeGreaterThan(0);
  });
});
