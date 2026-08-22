import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  convertSanityExport,
  detectI18n,
  portableTextToPlain,
  proposeMapping,
  readSanityExport,
  readSchemaFile,
  splitIntoBatches,
  validateMapping,
  type SanityDocument,
  type SanityMapping,
} from "../src/index";

// A dataset export is data, not code, which is what makes this lane easier than
// the HTML one. It is not free: Portable Text and reference graphs still need
// honest conversion, and a conversion that silently invents markup is the
// failure mode. Every test here is about the honesty rather than the plumbing.

/** Build a tar archive in memory, so the reader is tested against real bytes
 *  rather than a stub of itself. */
function tar(files: { name: string; body: Uint8Array | string }[]): Uint8Array {
  const blocks: Uint8Array[] = [];
  for (const file of files) {
    const body =
      typeof file.body === "string"
        ? new TextEncoder().encode(file.body)
        : file.body;
    const header = new Uint8Array(512);
    const write = (text: string, at: number, len: number): void => {
      const bytes = new TextEncoder().encode(text);
      header.set(bytes.subarray(0, len), at);
    };
    write(file.name, 0, 100);
    write("000644 ", 100, 8);
    write("000000 ", 108, 8);
    write("000000 ", 116, 8);
    write(`${body.byteLength.toString(8).padStart(11, "0")} `, 124, 12);
    write("00000000000 ", 136, 12);
    header[156] = "0".charCodeAt(0);
    // Checksum: the field reads as spaces while it is computed.
    header.fill(32, 148, 156);
    let sum = 0;
    for (const byte of header) sum += byte;
    write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8);
    blocks.push(header);
    const padded = new Uint8Array(Math.ceil(body.byteLength / 512) * 512);
    padded.set(body);
    blocks.push(padded);
  }
  blocks.push(new Uint8Array(1024));
  const total = blocks.reduce((size, block) => size + block.byteLength, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const block of blocks) {
    out.set(block, at);
    at += block.byteLength;
  }
  return out;
}

/** A 1x1 PNG, so the asset reader has something with real header bytes. */
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
]);

const DOCS: SanityDocument[] = [
  {
    _id: "prop-1",
    _type: "property",
    title: "Storgatan 1",
    slug: { current: "storgatan-1" },
    price: 4_500_000,
    agent: { _type: "reference", _ref: "staff-1" },
    photo: {
      _type: "image",
      asset: { _ref: "image-abc123-1x1-png" },
      hotspot: { x: 0.5, y: 0.3 },
    },
  },
  { _id: "prop-2", _type: "property", title: "Lillgatan 2", price: 2_000_000 },
  { _id: "prop-3", _type: "property", title: "Nygatan 3", price: 3_000_000 },
  { _id: "staff-1", _type: "staff", name: "Anna" },
  { _id: "staff-2", _type: "staff", name: "Björn" },
  { _id: "staff-3", _type: "staff", name: "Cecilia" },
];

function exportFixture(docs: SanityDocument[] = DOCS): Uint8Array {
  return gzipSync(
    Buffer.from(
      tar([
        { name: "data.ndjson", body: docs.map((d) => JSON.stringify(d)).join("\n") },
        { name: "images/abc123-1x1.png", body: PNG },
      ]),
    ),
  );
}

describe("sanity export reader", () => {
  it("reads documents, splits drafts from published, and counts types", () => {
    const exported = readSanityExport(
      exportFixture([
        ...DOCS,
        { _id: "drafts.prop-4", _type: "property", title: "Osaltad" },
        // An asset document describes a file we already have out of the
        // tarball; keeping it would make every picture look like a content
        // type in the mapping proposal.
        { _id: "image-abc123-1x1-png", _type: "sanity.imageAsset", url: "x" },
      ]),
    );
    expect(exported.documents.size).toBe(6);
    expect(exported.drafts.has("prop-4")).toBe(true);
    expect(exported.typeCounts.get("property")).toBe(3);
    expect(exported.typeCounts.has("sanity.imageAsset")).toBe(false);
    expect(exported.assets.has("image-abc123-1x1-png")).toBe(true);
  });

  it("refuses an archive with no ndjson rather than importing nothing quietly", () => {
    expect(() =>
      readSanityExport(gzipSync(Buffer.from(tar([{ name: "readme.txt", body: "hi" }])))),
    ).toThrow(/sanity dataset export/);
  });
});

describe("sanity schema reader", () => {
  const source = `
    import { defineField, defineType } from "sanity";
    import { PriceInput } from "../components/PriceInput";

    export default defineType({
      name: "property",
      title: "Objekt",
      type: "document",
      fields: [
        defineField({ name: "title", type: "string", validation: (Rule) => Rule.required() }),
        defineField({ name: "slug", type: "slug" }),
        defineField({ name: "price", type: "number", components: { input: PriceInput } }),
        defineField({ name: "body", type: "array", of: [{ type: "block" }, { type: "callout" }] }),
        defineField({ name: "agent", type: "reference", to: [{ type: "staff" }] }),
        defineField({ name: "tenure", type: "string", options: { list: [
          { title: "Bostadsrätt", value: "brf" },
          { title: "Äganderätt", value: "own" },
        ] } }),
      ],
    });
  `;

  it("reads a type statically, without executing the file it came from", () => {
    const types = readSchemaFile(source, "schemas/property.ts");
    expect(types).toHaveLength(1);
    const property = types[0]!;
    expect(property.type).toBe("document");
    const byName = new Map(property.fields.map((field) => [field.name, field]));
    expect(byName.get("title")?.kind).toBe("string");
    expect(byName.get("title")?.required).toBe(true);
    expect(byName.get("slug")?.kind).toBe("slug");
    expect(byName.get("price")?.kind).toBe("number");
    // An array of `block` IS Portable Text, and the custom member is kept so
    // the report can name it.
    expect(byName.get("body")?.kind).toBe("portableText");
    expect(byName.get("body")?.of).toContain("callout");
    expect(byName.get("agent")?.to).toEqual(["staff"]);
    expect(byName.get("tenure")?.options).toEqual(["brf", "own"]);
  });

  it("is not confused by a brace inside a comment or a string", () => {
    const types = readSchemaFile(
      `defineType({
         // a { that would close the object early
         name: "note",
         type: "document",
         description: "holds } and {",
         fields: [defineField({ name: "text", type: "text" })],
       });`,
      "schemas/note.ts",
    );
    expect(types).toHaveLength(1);
    expect(types[0]!.fields.map((field) => field.name)).toEqual(["text"]);
  });
});

describe("mapping proposal", () => {
  function propose(): SanityMapping {
    const byType = new Map<string, SanityDocument[]>();
    for (const doc of DOCS) {
      const list = byType.get(doc._type) ?? [];
      list.push(doc);
      byType.set(doc._type, list);
    }
    return proposeMapping(byType, readSchemaFile(
      `defineType({ name: "property", type: "document", fields: [
         defineField({ name: "title", type: "string" }),
         defineField({ name: "slug", type: "slug" }),
         defineField({ name: "price", type: "number" }),
         defineField({ name: "agent", type: "reference", to: [{ type: "staff" }] }),
         defineField({ name: "photo", type: "image" }),
         defineField({ name: "layout", type: "customLayoutThing" }),
       ] });
       defineType({ name: "staff", type: "document", fields: [
         defineField({ name: "name", type: "string" }),
       ] });`,
      "schemas/all.ts",
    ));
  }

  it("proposes a collection per repeated type and validates cleanly", () => {
    const mapping = propose();
    const property = mapping.types.find((type) => type.from === "property")!;
    expect(property.becomes).toBe("collection");
    expect(property.key).toBe("property");
    expect(property.titleField).toBe("title");
    expect(property.slugField).toBe("slug");
    expect(validateMapping(mapping).ok).toBe(true);
  });

  it("lists every field, and says skip rather than leaving one out", () => {
    const property = propose().types.find((type) => type.from === "property")!;
    const names = property.fields.map((field) => field.from).sort();
    // `layout` is a custom object we have no field for. It is PRESENT and
    // skipped: absence would be indistinguishable from a field nobody noticed,
    // which is how content goes missing quietly.
    expect(names).toContain("layout");
    expect(property.fields.find((field) => field.from === "layout")?.type).toBe("skip");
    expect(property.fields.find((field) => field.from === "layout")?.note).toBeTruthy();
    expect(property.fields.find((field) => field.from === "agent")?.referenceCollectionKey).toBe("staff");
  });

  it("refuses a hand-edited mapping that points a reference at nothing", () => {
    const mapping = propose();
    const property = mapping.types.find((type) => type.from === "property")!;
    property.fields.find((field) => field.from === "agent")!.referenceCollectionKey =
      "nope";
    const checked = validateMapping(mapping);
    expect(checked.ok).toBe(false);
    expect(checked.issues.some((issue) => issue.path.includes("referenceCollectionKey"))).toBe(true);
  });
});

describe("portable text", () => {
  it("keeps the words, keeps links, and names what it could not carry", () => {
    const result = portableTextToPlain([
      {
        _type: "block",
        style: "normal",
        markDefs: [{ _key: "k1", _type: "link", href: "https://example.com" }],
        children: [
          { _type: "span", text: "See " },
          { _type: "span", text: "our terms", marks: ["k1"] },
        ],
      },
      { _type: "block", listItem: "bullet", children: [{ _type: "span", text: "One" }] },
      { _type: "youtube", url: "https://youtu.be/x" },
      { _type: "image", asset: { _ref: "image-zzz-1x1-png" } },
    ]);
    expect(result.text).toContain("our terms (https://example.com)");
    expect(result.text).toContain("- One");
    // Nothing was invented for either of the two blocks we cannot hold, and
    // both are named.
    expect(result.text).not.toContain("<");
    expect(result.losses.map((loss) => loss.blockType).sort()).toEqual([
      "image",
      "youtube",
    ]);
    expect(result.embeddedAssetIds).toEqual(["image-zzz-1x1-png"]);
  });
});

describe("localisation detection", () => {
  it("finds the field-level convention", () => {
    const detection = detectI18n([
      { _id: "a", _type: "page", title: { _type: "localeString", sv: "Hej", en: "Hi" } },
    ]);
    expect(detection.convention).toBe("field");
    expect(detection.locales.sort()).toEqual(["en", "sv"]);
  });

  it("treats the plugin's metadata plus per-locale documents as one convention", () => {
    const detection = detectI18n([
      { _id: "a-sv", _type: "page", language: "sv", title: "Hej" },
      { _id: "a-en", _type: "page", language: "en", title: "Hi" },
      { _id: "meta-1", _type: "translation.metadata", translations: [{ _key: "sv" }, { _key: "en" }] },
    ]);
    expect(detection.convention).toBe("metadata");
  });

  it("says ambiguous rather than guessing when two conventions both have evidence", () => {
    const detection = detectI18n([
      { _id: "a", _type: "page", title: { _type: "localeString", sv: "Hej", en: "Hi" } },
      { _id: "b-sv", _type: "page", language: "sv", title: "Hej" },
      { _id: "b-en", _type: "page", language: "en", title: "Hi" },
    ]);
    expect(detection.convention).toBe("ambiguous");
  });

  it("does not read a document id that merely ends in two letters as a language", () => {
    const detection = detectI18n([
      { _id: "about-us", _type: "page", title: "About" },
      { _id: "contact-us", _type: "page", title: "Contact" },
    ]);
    expect(detection.convention).toBe("none");
  });
});

describe("conversion", () => {
  function convert() {
    const exported = readSanityExport(exportFixture());
    const byType = new Map<string, SanityDocument[]>();
    for (const doc of exported.documents.values()) {
      const list = byType.get(doc._type) ?? [];
      list.push(doc);
      byType.set(doc._type, list);
    }
    const mapping = proposeMapping(
      byType,
      readSchemaFile(
        `defineType({ name: "property", type: "document", fields: [
           defineField({ name: "title", type: "string" }),
           defineField({ name: "slug", type: "slug" }),
           defineField({ name: "price", type: "number" }),
           defineField({ name: "agent", type: "reference", to: [{ type: "staff" }] }),
           defineField({ name: "photo", type: "image" }),
         ] });
         defineType({ name: "staff", type: "document", fields: [
           defineField({ name: "name", type: "string" }),
         ] });`,
        "schemas/all.ts",
      ),
    );
    return convertSanityExport(exported, mapping, { businessName: "Mäklaren AB" });
  }

  it("produces collections, rows, a stable external key, and the picture", () => {
    const result = convert();
    expect(result.counts.collections).toBe(2);
    expect(result.counts.rows).toBe(6);
    const row = result.site.collectionRows!.find((entry) => entry.slug === "storgatan-1")!;
    // The Sanity id is what makes a second run update this row instead of
    // writing a second copy of the same property.
    expect(row.externalKey).toBe("sanity:prop-1");
    expect((row.values as Record<string, unknown>).price).toBe(4_500_000);
    expect(result.site.assets).toHaveLength(1);
    expect(result.site.assets[0]!.width).toBe(1);
  });

  it("carries a reference as the target row's slug, and records the lost hotspot", () => {
    const result = convert();
    const row = result.site.collectionRows!.find((entry) => entry.slug === "storgatan-1")!;
    expect((row.values as Record<string, unknown>).agent).toEqual({ rowSlug: "anna" });
    // A focal point has nowhere to live on a row's image value. Said out loud
    // rather than dropped, because a portrait cropping through a face is
    // exactly what a hotspot was set to prevent.
    expect(
      result.losses.some((loss) => loss.field === "photo" && /focal point/i.test(loss.reason)),
    ).toBe(true);
  });

  it("stops on an ambiguous dataset rather than dropping half the content", () => {
    const exported = readSanityExport(
      exportFixture([
        { _id: "a", _type: "property", title: { _type: "localeString", sv: "Hej", en: "Hi" } },
        { _id: "b-sv", _type: "property", language: "sv", title: "Hej" },
        { _id: "b-en", _type: "property", language: "en", title: "Hi" },
      ]),
    );
    expect(() =>
      convertSanityExport(exported, { revision: "snabbsajt.sanity-mapping/v1", types: [] }, {
        businessName: "Mäklaren AB",
      }),
    ).toThrow(/more than one way of storing translations/);
  });
});

describe("batching for the asset count cap", () => {
  it("splits past the cap and keeps each row with its own picture", () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({
      collectionTmpId: "objekt",
      externalKey: `sanity:${index}`,
      slug: `rad-${index}`,
      title: `Rad ${index}`,
      values: { photo: { assetId: `a${index}` } },
    }));
    const site = {
      format: "sajt-site",
      version: 1,
      exportedAt: "2026-08-22T00:00:00.000Z",
      site: {},
      folders: [],
      pages: [],
      sections: [],
      fonts: [],
      assets: rows.map((_, index) => ({
        exportId: `a${index}`,
        url: `assets/a${index}.png`,
        width: 1,
        height: 1,
        mimeType: "image/png",
        kind: "image",
      })),
      collectionRows: rows,
    } as never;
    const files = rows.map((_, index) => ({
      fileName: `a${index}.png`,
      bytes: PNG,
    }));
    const batches = splitIntoBatches(site, files, 2);
    expect(batches).toHaveLength(3);
    expect(batches[0]!.mode).toBe("import");
    expect(batches[1]!.mode).toBe("merge");
    // Every run is inside the cap, which is the whole point: one bundle of six
    // would be rejected `too_many_assets` and import NOTHING.
    for (const batch of batches) {
      expect(batch.site.assets.length).toBeLessThanOrEqual(2);
      // A row is never separated from the picture it points at.
      for (const row of batch.site.collectionRows ?? []) {
        const wanted = (row.values as { photo: { assetId: string } }).photo.assetId;
        expect(batch.site.assets.map((asset) => asset.exportId)).toContain(wanted);
      }
    }
    expect(
      batches.reduce((total, batch) => total + (batch.site.collectionRows?.length ?? 0), 0),
    ).toBe(6);
  });
});
