import { describe, expect, it } from "vitest";
import type { PortableSiteV1 } from "../src/convex/model/portable";
import type { PublishedSite } from "../src/lib/delivery/client";
import {
  findPage,
  renderModelFromPackage,
  renderModelFromPublished,
  resolveAsset,
} from "../src/lib/delivery/renderModel";
import { PRESETS } from "../templates/starter-smb/src/presets";

const heroContent = { type: "hero" as const, headline: "Vi städar kontor" };
const aboutContent = { type: "about" as const, heading: "Om oss", body: "Sedan 2011." };

function published(overrides: Partial<PublishedSite["snapshot"]> = {}): PublishedSite {
  return {
    version: 1,
    siteId: "k17abcdefghijklmnopqrstuvwx",
    versionId: "v42",
    publishedAt: 1_700_000_000_000,
    snapshot: {
      businessName: "Kvarterets Städ",
      language: "sv",
      theme: { palette: "forest", fontPair: "modern" },
      resolvedAssets: {
        a1: { url: "https://cdn.example/a1.jpg", width: 1600, height: 900 },
      },
      pages: [
        {
          slug: "tjanster",
          title: "Tjänster",
          order: 2,
          showInNav: true,
          sections: [{ type: "about", variant: "split", content: aboutContent }],
        },
        {
          slug: "",
          title: "Hem",
          order: 1,
          showInNav: true,
          sections: [
            { type: "hero", variant: "centered", anchorId: "top", content: heroContent },
          ],
        },
      ],
      ...overrides,
    } as unknown as PublishedSite["snapshot"],
  } as PublishedSite;
}

describe("renderModelFromPublished", () => {
  it("orders pages, keeps section order, and carries publish identity", () => {
    const model = renderModelFromPublished(published());

    expect(model.source).toBe("published");
    expect(model.businessName).toBe("Kvarterets Städ");
    expect(model.versionId).toBe("v42");
    expect(model.publishedAt).toBe(1_700_000_000_000);
    expect(model.pages.map((p) => p.slug)).toEqual(["", "tjanster"]);
    expect(model.pages[0].sections[0]).toMatchObject({
      type: "hero",
      variant: "centered",
      anchorId: "top",
      content: heroContent,
    });
  });

  it("leaves posts and jobs out of top-level routing", () => {
    const model = renderModelFromPublished(
      published({
        pages: [
          { slug: "", title: "Hem", order: 1, showInNav: true, sections: [] },
          {
            slug: "var-nya-lokal",
            title: "Vår nya lokal",
            order: 2,
            showInNav: false,
            pageType: "post",
            sections: [],
          },
          {
            slug: "lokalvardare",
            title: "Lokalvårdare",
            order: 3,
            showInNav: false,
            pageType: "job",
            sections: [],
          },
        ],
      } as unknown as Partial<PublishedSite["snapshot"]>),
    );

    // A headless app maps this model onto `/[[...slug]]`. Routing a post here
    // as well as under /news would publish two URLs for one page.
    expect(model.pages.map((p) => p.slug)).toEqual([""]);
  });

  it("resolves image refs against the snapshot's published assets", () => {
    const model = renderModelFromPublished(published());

    expect(resolveAsset(model, { assetId: "a1" })?.url).toBe("https://cdn.example/a1.jpg");
    expect(resolveAsset(model, { assetId: "missing" })).toBeUndefined();
    expect(resolveAsset(model, undefined)).toBeUndefined();
  });
});

describe("renderModelFromPackage", () => {
  const site: PortableSiteV1 = {
    ...PRESETS.consultant,
    pages: [
      { tmpId: "p_home", slug: "", title: "Hem", order: 1, showInNav: true, seo: { metaTitle: "Hem", metaDescription: "" } },
      { tmpId: "p_news", slug: "nyhet", title: "Nyhet", order: 2, showInNav: false, pageType: "post", seo: { metaTitle: "Nyhet", metaDescription: "" } },
    ],
    sections: [
      { pageTmpId: "p_home", type: "about", variant: "split", order: "a1", content: aboutContent },
      { pageTmpId: "p_home", type: "hero", variant: "centered", order: "a0", content: heroContent },
      { pageTmpId: "p_home", type: "faq", variant: "list", order: "a2", hidden: true, content: { type: "faq", items: [] } },
    ],
  } as unknown as PortableSiteV1;

  it("groups sections onto their page in fractional-index order", () => {
    const model = renderModelFromPackage(site);

    expect(model.source).toBe("package");
    expect(model.pages.map((p) => p.slug)).toEqual([""]);
    expect(model.pages[0].sections.map((s) => s.type)).toEqual(["hero", "about"]);
  });

  it("drops sections the author hid, the way a publish would", () => {
    const model = renderModelFromPackage(site);
    expect(model.pages[0].sections.some((s) => s.type === "faq")).toBe(false);
  });

  it("has nothing to resolve — a package's images are not published yet", () => {
    const model = renderModelFromPackage(site);
    expect(model.assets).toEqual({});
    expect(resolveAsset(model, { assetId: "a1" })).toBeUndefined();
  });

  it("renders every shipped preset without losing a page", () => {
    for (const preset of Object.values(PRESETS)) {
      const model = renderModelFromPackage(preset);
      expect(model.pages.length).toBeGreaterThan(0);
      expect(findPage(model, "")).toBeDefined();
      // Every routable page keeps at least one section, or the deployed site
      // would serve a blank route.
      for (const page of model.pages) {
        expect(page.sections.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("findPage", () => {
  it("maps the empty slug to the home page", () => {
    const model = renderModelFromPublished(published());
    expect(findPage(model, "")?.title).toBe("Hem");
    expect(findPage(model, "tjanster")?.title).toBe("Tjänster");
    expect(findPage(model, "finns-inte")).toBeUndefined();
  });
});
