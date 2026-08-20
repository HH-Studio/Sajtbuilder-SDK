import { describe, expect, it } from "vitest";
import {
  blockLibrary,
  BlockDefinitionError,
  defineBlock,
} from "../src/lib/blocks/defineBlock";
import {
  blockVersionDrift,
  isBlockSection,
  missingBlocks,
  pageForSegments,
  resolveBlockSection,
  staticParamsFor,
} from "../src/lib/blocks/pages";
import {
  parseSiteMessage,
  VISUAL_EDITING_CHANNEL,
  VISUAL_EDITING_PROTOCOL_VERSION,
  VISUAL_EDITING_PROTOCOL_VERSIONS,
  speaksProtocolVersion,
} from "../src/lib/visual-editing/protocol";
import type { RenderSite } from "../src/lib/delivery/renderModel";

// The agency half of the block contract: what a developer declares in their own
// repo, and how a page SnabbSajt knows about is served by their app.
//
// The app half already shipped (`blockSchemas`, the props checker, the `block`
// section). What these cases defend is the promise this end makes: a
// declaration the app would refuse fails in the developer's own build instead
// of hours later in a push, and a live page never grows a hole because a deploy
// went out before a component did.

const pricing = defineBlock({
  type: "pricing-table",
  label: "Prislista",
  fields: [
    { key: "title", kind: "text", label: "Rubrik" },
    { key: "note", kind: "richtext", optional: true },
    { key: "cta", kind: "link" },
  ],
  variants: ["light", "dark"],
});

function siteWith(blockType: string, version = 1): RenderSite {
  return {
    source: "published",
    businessName: "Kund AB",
    language: "sv",
    theme: {},
    assets: {},
    pages: [
      {
        slug: "",
        title: "Hem",
        order: 0,
        showInNav: true,
        sections: [
          {
            type: "block",
            variant: "light",
            content: {
              type: "block",
              blockType,
              version,
              props: { title: "Priser" },
            },
          },
        ],
      },
      {
        slug: "om-oss",
        title: "Om oss",
        order: 1,
        showInNav: true,
        sections: [],
      },
    ],
  };
}

describe("declaring a block", () => {
  it("keeps what the developer wrote, and fills in the version", () => {
    expect(pricing.type).toBe("pricing-table");
    expect(pricing.label).toBe("Prislista");
    // A first `defineBlock` should not have to think about versioning.
    expect(pricing.version).toBe(1);
  });

  it("fails in the developer's own build, not in a later push", () => {
    // The whole reason this throws rather than returns a result: the message
    // lands in the terminal next to the file that caused it.
    expect(() => defineBlock({ type: "Pricing Table", label: "x", fields: [] })).toThrow(
      BlockDefinitionError,
    );
    expect(() =>
      defineBlock({
        type: "ok",
        label: "x",
        fields: [{ key: "a", kind: "text" }, { key: "a", kind: "richtext" }],
      }),
    ).toThrow(/twice/);
    expect(() =>
      defineBlock({ type: "ok", label: "x", fields: [{ key: "pick", kind: "select" }] }),
    ).toThrow(/no options/);
    expect(() =>
      // @ts-expect-error a kind the app does not know would be stored and then
      // refused on the client's first edit.
      defineBlock({ type: "ok", label: "x", fields: [{ key: "a", kind: "markdown" }] }),
    ).toThrow(/kind/);
  });

  it("refuses two blocks with the same name in one library", () => {
    expect(() => blockLibrary(pricing, { ...pricing, label: "Annan" })).toThrow(
      /both called/,
    );
  });
});

describe("serving a page SnabbSajt knows about", () => {
  const library = blockLibrary(pricing);

  it("finds the home page for an empty catch-all", () => {
    // Next hands a catch-all no segments at all for the home route, and an app
    // that only handles `[""]` falls through on its most important page.
    const site = siteWith("pricing-table");
    expect(pageForSegments(site, undefined)?.slug).toBe("");
    expect(pageForSegments(site, [])?.slug).toBe("");
    expect(pageForSegments(site, ["om-oss"])?.slug).toBe("om-oss");
    expect(pageForSegments(site, ["nope"])).toBeUndefined();
  });

  it("lists every path for generateStaticParams, home included", () => {
    expect(staticParamsFor(siteWith("pricing-table"))).toEqual([
      { slug: [] },
      { slug: ["om-oss"] },
    ]);
  });

  it("resolves a block section against the repo's own components", () => {
    const site = siteWith("pricing-table");
    const section = site.pages[0].sections[0];
    expect(isBlockSection(section)).toBe(true);
    if (!isBlockSection(section)) return;
    const resolved = resolveBlockSection(section, library);
    expect(resolved.definition).toBe(pricing);
    expect(resolved.variant).toBe("light");
    // Passed through as data: the client's content is what the client wrote.
    expect(resolved.props).toEqual({ title: "Priser" });
  });

  it("names a block the repo does not declare instead of rendering a hole", () => {
    const site = siteWith("gone-missing");
    expect(missingBlocks(site, library)).toEqual(["gone-missing"]);
    const section = site.pages[0].sections[0];
    if (!isBlockSection(section)) return;
    // Resolved with no definition: the caller renders nothing and the build log
    // gets to complain, rather than the visitor seeing a grey box.
    expect(resolveBlockSection(section, library).definition).toBeUndefined();
  });

  it("reports a page still written against an older version of a block", () => {
    const drift = blockVersionDrift(siteWith("pricing-table", 1), {
      "pricing-table": { ...pricing, version: 3 },
    });
    expect(drift).toEqual([
      {
        blockType: "pricing-table",
        pageSlug: "",
        contentVersion: 1,
        libraryVersion: 3,
      },
    ]);
  });
});

describe("agreeing a protocol version with the editor", () => {
  it("speaks every version it lists, and nothing else", () => {
    for (const version of VISUAL_EDITING_PROTOCOL_VERSIONS) {
      expect(speaksProtocolVersion(version)).toBe(true);
    }
    expect(speaksProtocolVersion(99)).toBe(false);
    expect(speaksProtocolVersion("1")).toBe(false);
  });

  it("accepts a message in any version it still speaks", () => {
    for (const version of VISUAL_EDITING_PROTOCOL_VERSIONS) {
      const parsed = parseSiteMessage({
        channel: VISUAL_EDITING_CHANNEL,
        version,
        type: "ready",
      });
      expect(parsed?.type, `version ${version}`).toBe("ready");
      // Answered in the version it arrived in, not blindly in the newest.
      expect(parsed?.version).toBe(version);
    }
    expect(
      parseSiteMessage({
        channel: VISUAL_EDITING_CHANNEL,
        version: VISUAL_EDITING_PROTOCOL_VERSION + 50,
        type: "ready",
      }),
    ).toBeUndefined();
  });
});
