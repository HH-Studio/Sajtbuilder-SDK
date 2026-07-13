import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateImportReport } from "../src/import/report";

const fixturesRoot = fileURLToPath(new URL("../fixtures/import/", import.meta.url));

function read(name: string): string {
  return readFileSync(join(fixturesRoot, name), "utf8");
}

function json<T>(name: string): T {
  return JSON.parse(read(name)) as T;
}

function filesUnder(name: string): string[] {
  const root = join(fixturesRoot, name);
  const visit = (directory: string): string[] => readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? visit(path) : [relative(root, path)];
  });
  return visit(root).sort();
}

type Inventory = {
  fixture: string;
  sourceFiles: string[];
  evidence: Array<{ kind: string; locator: string; marker: string }>;
  expected: Record<string, unknown>;
};

type GoldenReport = {
  evidence: Array<{ locator: string; contentHash: string }>;
};

const fixtureNames = [
  "nextjs-small-business",
  "html-multipage",
  "wordpress-wxr",
  "unsafe-inputs",
] as const;

describe("golden import fixtures", () => {
  it("snapshots every source corpus as evidence inventory and import report", () => {
    for (const name of fixtureNames) {
      const inventory = json<Inventory>(`${name}/expected/evidence-inventory.json`);
      const report = json<unknown>(`${name}/expected/import-report.json`);
      expect(inventory.fixture).toBe(name);
      expect(inventory.sourceFiles).toEqual(
        filesUnder(name).filter((path) => !path.startsWith("expected/")),
      );
      expect(inventory.evidence.length).toBeGreaterThan(0);
      expect(validateImportReport(report)).toEqual({ ok: true, issues: [] });
      for (const item of (report as GoldenReport).evidence) {
        const sourceFile = item.locator.split(/[#:]/, 1)[0];
        const digest = createHash("sha256")
          .update(readFileSync(join(fixturesRoot, name, sourceFile)))
          .digest("hex");
        expect(item.contentHash).toBe(`sha256:${digest}`);
      }
    }
  });

  it("models a five-route Next.js business site without executing the unsupported widget", () => {
    const inventory = json<Inventory>("nextjs-small-business/expected/evidence-inventory.json");
    expect(inventory.expected).toMatchObject({
      routes: ["/", "/about", "/booking", "/contact", "/services"],
      reusableComponents: ["BusinessFacts", "Footer", "Header", "UnsupportedMapWidget"],
      images: 2,
      unsupportedWidgets: 1,
    });
    expect(read("nextjs-small-business/app/contact/page.tsx")).toContain("hello@northstar.example");
    expect(read("nextjs-small-business/components/BusinessFacts.tsx")).toContain("+46 8 555 0100");
    expect(read("nextjs-small-business/components/UnsupportedMapWidget.tsx")).toContain("unsupported-widget");
    expect(read("nextjs-small-business/app/booking/page.tsx")).toContain("booking.example.test");
  });

  it("captures linked HTML pages, analytics, animation, form, and obfuscated-script evidence", () => {
    const inventory = json<Inventory>("html-multipage/expected/evidence-inventory.json");
    expect(inventory.expected).toMatchObject({ pages: 4, forms: 1, analyticsTags: 2, animations: 2, obfuscatedScripts: 1 });
    expect(read("html-multipage/index.html")).toContain("G-SYNTHETIC-1");
    expect(read("html-multipage/index.html")).toContain("GTM-SYNTHETIC-ID");
    expect(read("html-multipage/assets/styles.css")).toContain("@keyframes");
    expect(read("html-multipage/assets/app.js")).toContain("IntersectionObserver");
    expect(read("html-multipage/contact.html")).toContain("data-obfuscated-synthetic");
  });

  it("covers realistic WXR relationships and migration edge cases", () => {
    const inventory = json<Inventory>("wordpress-wxr/expected/evidence-inventory.json");
    expect(inventory.expected).toMatchObject({
      publishedPosts: 24,
      draftPosts: 2,
      pages: 5,
      categories: 3,
      tags: 4,
      authors: 2,
      attachments: 3,
      menuItems: 5,
      featuredMediaLinks: 3,
      oldPermalinks: 2,
      seoPlugins: ["Yoast SEO", "Rank Math"],
      contentPlugins: ["booking", "form", "gallery"],
    });
    const wxr = read("wordpress-wxr/export.xml");
    expect((wxr.match(/<wp:post_type>post<\/wp:post_type>/g) ?? [])).toHaveLength(26);
    expect((wxr.match(/<wp:status>publish<\/wp:status><wp:post_type>post<\/wp:post_type>/g) ?? [])).toHaveLength(24);
    expect((wxr.match(/<wp:status>draft<\/wp:status><wp:post_type>post<\/wp:post_type>/g) ?? [])).toHaveLength(2);
    expect((wxr.match(/<wp:post_type>page<\/wp:post_type>/g) ?? [])).toHaveLength(5);
    expect((wxr.match(/<wp:post_type>attachment<\/wp:post_type>/g) ?? [])).toHaveLength(3);
    expect((wxr.match(/<wp:post_type>nav_menu_item<\/wp:post_type>/g) ?? [])).toHaveLength(5);
    expect((wxr.match(/<wp:meta_key>_menu_item_type<\/wp:meta_key>/g) ?? [])).toHaveLength(5);
    expect((wxr.match(/<wp:meta_key>_menu_item_object<\/wp:meta_key>/g) ?? [])).toHaveLength(5);
    expect((wxr.match(/<wp:author>/g) ?? [])).toHaveLength(2);
    expect((wxr.match(/<dc:creator>/g) ?? [])).toHaveLength(24);
    expect((wxr.match(/<wp:category>/g) ?? [])).toHaveLength(3);
    expect((wxr.match(/<wp:tag>/g) ?? [])).toHaveLength(4);
    expect((wxr.match(/<wp:meta_key>_thumbnail_id<\/wp:meta_key>/g) ?? [])).toHaveLength(3);
    expect((wxr.match(/<wp:meta_key>_wp_old_slug<\/wp:meta_key>/g) ?? [])).toHaveLength(2);
    expect(wxr).toContain("_yoast_wpseo_title");
    expect(wxr).toContain("rank_math_description");
    expect(wxr).toContain("[synthetic_booking]");
    expect(wxr).toContain("synthetic_booking_plugin");
    expect(wxr).toContain('[synthetic_form id="7"]');
    expect(wxr).toContain('[synthetic_gallery ids="501,502,503"]');
  });

  it("keeps unsafe samples inert while preserving each rejection marker", () => {
    const inventory = json<Inventory>("unsafe-inputs/expected/evidence-inventory.json");
    expect(inventory.expected).toMatchObject({ blocked: 8 });
    expect(json<{ entry: string }>("unsafe-inputs/zip-traversal.json").entry).toBe("../../outside.txt");
    expect(json<{ type: string }>("unsafe-inputs/symlink-entry.json").type).toBe("symlink");
    expect(json<{ ratio: number }>("unsafe-inputs/zip-bomb-metadata.json").ratio).toBeGreaterThan(10_000);
    expect(read("unsafe-inputs/malformed.html")).toContain("<script");
    expect(read("unsafe-inputs/xml-entity.xml")).toContain("<!DOCTYPE");
    expect(read("unsafe-inputs/oversized-cdata.xml").length).toBeGreaterThan(4_096);
    const hostileUrls = read("unsafe-inputs/hostile-urls.txt");
    expect(hostileUrls).toContain("javascript:");
    expect(hostileUrls).toContain("data:text/html");
    expect(hostileUrls).toContain("file:///private/");
    expect(hostileUrls).toContain("127.0.0.1");
    expect(hostileUrls).toContain("169.254.169.254");
  });

  it("contains only synthetic public data and obvious test identifiers", () => {
    const allText = fixtureNames.flatMap((name) => filesUnder(name).map((path) => read(`${name}/${path}`))).join("\n");
    expect(allText).not.toMatch(/(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/);
    expect(allText).not.toMatch(/AIza[0-9A-Za-z_-]{30,}/);
    expect(allText).not.toMatch(/G-[A-Z0-9]{10}(?![A-Z0-9])/);
    expect(allText).not.toMatch(/GTM-[A-Z0-9]{7}(?![A-Z0-9])/);
    expect(allText).not.toMatch(/@(?:gmail|outlook|hotmail|icloud)\./i);
    expect(allText).not.toContain("BEGIN PRIVATE KEY");
  });
});
