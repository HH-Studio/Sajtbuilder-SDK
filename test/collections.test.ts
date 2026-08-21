import { describe, expect, it } from "vitest";
import {
  CollectionDefinitionError,
  collectionLibrary,
  collectionsForPackage,
  defineCollection,
} from "../src/lib/blocks/defineCollection";
import {
  collectionForPrefix,
  collectionRowParams,
  missingCollectionBlocks,
  referencedHref,
  resolveCollectionRow,
  rowProps,
  rowsFor,
} from "../src/lib/blocks/collections";
import { blockLibrary, defineBlock } from "../src/lib/blocks/defineBlock";
import { renderModelFromPackage } from "../src/lib/delivery/renderModel";
import type { PortableSiteV1 } from "../src/convex/model/portable";
import type { RenderSite } from "../src/lib/delivery/renderModel";

// The agency half of the collection contract: the shape a repo declares, and
// the list and detail page their own app draws from it. Plan: the app's
// P1-2026-08-19-content-collections.md and slice 3.4 of the agency master plan.

const staff = defineCollection({
  key: "staff",
  name: "Medarbetare",
  slugPrefix: "team",
  fields: [{ key: "name", type: "text", label: "Namn", required: true }],
});

const cases = defineCollection({
  key: "cases",
  name: "Referenser",
  slugPrefix: "referenser",
  fields: [
    { key: "client", type: "text", label: "Kund" },
    { key: "cover", type: "image", label: "Bild" },
    { key: "lead", type: "reference", referenceCollectionKey: "staff" },
  ],
  template: {
    cardBlockType: "case-card",
    detailBlockType: "case-page",
    bindings: { heading: "client", image: "cover" },
  },
});

describe("defineCollection", () => {
  it("fills in the slug prefix and the name from the key", () => {
    const minimal = defineCollection({
      key: "vehicles",
      name: "  ",
      fields: [{ key: "model", type: "text" }],
    });
    expect(minimal.slugPrefix).toBe("vehicles");
    expect(minimal.name).toBe("vehicles");
  });

  it("refuses a key the app would refuse, in the developer's terminal", () => {
    expect(() =>
      defineCollection({ key: "Cases", name: "x", fields: [{ key: "a", type: "text" }] }),
    ).toThrow(CollectionDefinitionError);
    expect(() => defineCollection({ key: "cases", name: "x", fields: [] })).toThrow(
      /no fields/,
    );
  });

  it("refuses two fields answering to one key, because a binding would pick one at random", () => {
    expect(() =>
      defineCollection({
        key: "cases",
        name: "x",
        fields: [
          { key: "client", type: "text" },
          { key: "client", type: "number" },
        ],
      }),
    ).toThrow(/twice/);
  });

  it("refuses a reference with nothing to point at, and a target on a plain field", () => {
    expect(() =>
      defineCollection({
        key: "cases",
        name: "x",
        fields: [{ key: "lead", type: "reference" }],
      }),
    ).toThrow(/referenceCollectionKey/);
    expect(() =>
      defineCollection({
        key: "cases",
        name: "x",
        fields: [{ key: "lead", type: "text", referenceCollectionKey: "staff" }],
      }),
    ).toThrow(/reference target/);
  });

  it("refuses a binding aimed at a field the collection does not have", () => {
    expect(() =>
      defineCollection({
        key: "cases",
        name: "x",
        fields: [{ key: "client", type: "text" }],
        template: { cardBlockType: "card", bindings: { heading: "titel" } },
      }),
    ).toThrow(/not one of its fields/);
  });

  it("refuses the row editor's reserved 'no answer' option", () => {
    expect(() =>
      defineCollection({
        key: "cases",
        name: "x",
        fields: [{ key: "state", type: "choice", options: ["__none__"] }],
      }),
    ).toThrow(/no answer/);
  });

  it("names the near miss when a reference points at a key nobody declares", () => {
    const typo = defineCollection({
      key: "cases",
      name: "x",
      fields: [{ key: "lead", type: "reference", referenceCollectionKey: "the_staff" }],
    });
    const near = defineCollection({
      key: "the-staff",
      name: "y",
      fields: [{ key: "name", type: "text" }],
    });
    expect(() => collectionLibrary(typo, near)).toThrow(/the-staff/);
  });

  it("projects the library into the package field, shape only and never rows", () => {
    const packaged = collectionsForPackage(collectionLibrary(cases, staff));
    expect(packaged.map((entry) => entry.externalKey)).toEqual(["cases", "staff"]);
    const [firstCase] = packaged;
    expect(firstCase?.source).toBe("repo");
    expect(firstCase?.kind).toBe("custom");
    expect(firstCase?.slugPrefix).toBe("referenser");
    // A reference travels as the target's KEY: a Convex id does not exist in a
    // repository, and the id this hemsida holds is a different one on the next.
    expect(firstCase?.fields[2]?.referenceCollectionId).toBe("staff");
    expect(firstCase?.template?.bindings).toEqual({ heading: "client", image: "cover" });
    // Rows are the client's. A repo that shipped them would overwrite a month
    // of their typing on every deploy.
    expect(firstCase).not.toHaveProperty("rows");
  });
});

function siteWithCollection(): RenderSite {
  return {
    source: "published",
    businessName: "Kund AB",
    language: "sv",
    theme: {},
    assets: {},
    pages: [],
    collections: [
      {
        name: "Referenser",
        slugPrefix: "referenser",
        fields: [
          { key: "client", label: "Kund", type: "text" },
          { key: "cover", label: "Bild", type: "image" },
          { key: "lead", label: "Ansvarig", type: "reference", referenceCollection: "team" },
        ],
        template: {
          cardBlockType: "case-card",
          detailBlockType: "case-page",
          bindings: { heading: "client", image: "cover" },
        },
        rows: [
          {
            slug: "villa-4",
            title: "Villa 4",
            values: {
              client: "Villa 4 AB",
              cover: { assetId: "asset_1", alt: "Fasaden" },
              lead: { rowSlug: "albin" },
            },
          },
        ],
      },
      {
        name: "Medarbetare",
        slugPrefix: "team",
        fields: [{ key: "name", label: "Namn", type: "text" }],
        rows: [{ slug: "albin", title: "Albin", values: { name: "Albin" } }],
      },
    ],
  };
}

const caseCard = defineBlock({
  type: "case-card",
  label: "Referenskort",
  fields: [
    { key: "heading", kind: "text" },
    { key: "image", kind: "image" },
  ],
});
const casePage = defineBlock({
  type: "case-page",
  label: "Referenssida",
  fields: [{ key: "heading", kind: "text" }],
});
const library = blockLibrary(caseCard, casePage);

describe("drawing a collection", () => {
  it("finds a list by the prefix its rows are addressed under", () => {
    const site = siteWithCollection();
    expect(collectionForPrefix(site, "referenser")?.name).toBe("Referenser");
    expect(collectionForPrefix(site, "/referenser/")?.name).toBe("Referenser");
    expect(collectionForPrefix(site, "nope")).toBeUndefined();
    expect(rowsFor(site, "referenser")).toHaveLength(1);
    // A list that vanished from a deploy leaves a quiet page, not a crash.
    expect(rowsFor(site, "nope")).toEqual([]);
  });

  it("fills the block's slots from the binding, and always carries the address", () => {
    const site = siteWithCollection();
    const collection = collectionForPrefix(site, "referenser")!;
    const props = rowProps(collection, collection.rows[0]!);
    expect(props).toMatchObject({
      heading: "Villa 4 AB",
      image: { assetId: "asset_1", alt: "Fasaden" },
      title: "Villa 4",
      href: "/referenser/villa-4",
    });
    // The value is passed through as data: resolving the asset eagerly would
    // make every list load every other list.
    expect(props.image).toEqual({ assetId: "asset_1", alt: "Fasaden" });
  });

  it("passes fields under their own keys when the agency wrote no bindings", () => {
    const site = siteWithCollection();
    const team = collectionForPrefix(site, "team")!;
    expect(rowProps(team, team.rows[0]!).name).toBe("Albin");
  });

  it("resolves a row into the same shape a section resolves into", () => {
    const site = siteWithCollection();
    const collection = collectionForPrefix(site, "referenser")!;
    const card = resolveCollectionRow(collection, collection.rows[0]!, library);
    expect(card?.blockType).toBe("case-card");
    expect(card?.definition).toBe(caseCard);
    const detail = resolveCollectionRow(collection, collection.rows[0]!, library, "detail");
    expect(detail?.blockType).toBe("case-page");
    // A list with no block for that surface draws nothing rather than throwing.
    const team = collectionForPrefix(site, "team")!;
    expect(resolveCollectionRow(team, team.rows[0]!, library)).toBeUndefined();
  });

  it("names a template block the repo does not declare instead of rendering a hole", () => {
    const site = siteWithCollection();
    expect(missingCollectionBlocks(site, blockLibrary(caseCard))).toEqual(["case-page"]);
    const collection = collectionForPrefix(site, "referenser")!;
    expect(
      resolveCollectionRow(collection, collection.rows[0]!, blockLibrary(caseCard), "detail"),
    ).toBeUndefined();
  });

  it("lists every row address for generateStaticParams, and only the ones that draw", () => {
    // `team` has no detail block, so pre-rendering its rows would publish a
    // blank page at an address nobody asked for.
    expect(collectionRowParams(siteWithCollection())).toEqual([
      { slug: ["referenser", "villa-4"] },
    ]);
  });

  it("follows a reference through the field that names its target list", () => {
    const site = siteWithCollection();
    const collection = collectionForPrefix(site, "referenser")!;
    const row = collection.rows[0]!;
    expect(referencedHref(site, collection, "lead", row.values.lead)).toBe("/team/albin");
    // A slug is unique only inside its own list, so a value with no field to
    // name the target resolves to nothing rather than to the wrong row.
    expect(referencedHref(site, collection, "client", row.values.client)).toBeUndefined();
  });
});

describe("a pulled repository draws what the client typed", () => {
  it("joins a package's shapes and rows into the one shape the renderer reads", () => {
    const site: PortableSiteV1 = {
      version: 1,
      site: { businessName: "Kund AB", language: "sv", theme: {} },
      pages: [],
      sections: [],
      contentCollections: [
        {
          tmpId: "c1",
          kind: "custom",
          name: "Referenser",
          slugPrefix: "referenser",
          order: 0,
          source: "repo",
          externalKey: "cases",
          fields: [
            { key: "client", label: "Kund", type: "text", order: 0 },
            {
              key: "lead",
              label: "Ansvarig",
              type: "reference",
              order: 1,
              referenceCollectionId: "c2",
            },
          ],
        },
        {
          tmpId: "c2",
          kind: "custom",
          name: "Medarbetare",
          slugPrefix: "team",
          order: 1,
          fields: [{ key: "name", label: "Namn", type: "text", order: 0 }],
        },
        // A blog's rows are post PAGES and already arrive through `pages`.
        // Including it here would draw every post twice.
        { tmpId: "c3", kind: "blog", name: "Blogg", slugPrefix: "blogg", order: 2 },
      ],
      collectionRows: [
        { collectionTmpId: "c1", slug: "villa-4", title: "Villa 4", values: { client: "Villa 4 AB" } },
        { collectionTmpId: "c1", slug: "utkast", title: "Utkast", values: {}, hidden: true },
        { collectionTmpId: "c2", slug: "albin", title: "Albin", values: { name: "Albin" } },
      ],
    } as unknown as PortableSiteV1;

    const model = renderModelFromPackage(site);
    expect(model.collections?.map((entry) => entry.slugPrefix)).toEqual([
      "referenser",
      "team",
    ]);
    // A publish drops hidden rows, so a local preview that showed them would
    // flatter the draft.
    expect(rowsFor(model, "referenser").map((row) => row.slug)).toEqual(["villa-4"]);
    // The package names a reference target by tmpId; the renderer addresses a
    // list by its prefix, so the join translates it once, here.
    expect(collectionForPrefix(model, "referenser")?.fields[1]?.referenceCollection).toBe(
      "team",
    );
  });
});
