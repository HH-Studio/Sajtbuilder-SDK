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
  evidence: Array<{ id: string; locator: string; contentHash: string }>;
  items: Array<{ evidenceIds: string[] }>;
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
      const goldenReport = report as GoldenReport;
      for (const item of goldenReport.evidence) {
        const sourceFile = item.locator.split(/[#:]/, 1)[0];
        const digest = createHash("sha256")
          .update(readFileSync(join(fixturesRoot, name, sourceFile)))
          .digest("hex");
        expect(item.contentHash).toBe(`sha256:${digest}`);
      }
      expect(new Set(goldenReport.items.flatMap((item) => item.evidenceIds))).toEqual(
        new Set(goldenReport.evidence.map((item) => item.id)),
      );
    }
  });

  it("models a five-route Next.js business site without executing the unsupported widget", () => {
    const inventory = json<Inventory>("nextjs-small-business/expected/evidence-inventory.json");
    const expected = inventory.expected as {
      routes: string[];
      reusableComponents: string[];
      images: number;
      unsupportedWidgets: number;
    };
    const routeFiles = inventory.sourceFiles.filter((path) => /^app\/(?:.+\/)?page\.tsx$/.test(path));
    const routes = routeFiles.map((path) => {
      const segment = path.replace(/^app\//, "").replace(/\/page\.tsx$/, "");
      return segment === "page.tsx" ? "/" : `/${segment}`;
    }).sort();
    expect(routes).toEqual(expected.routes);

    const componentFiles = inventory.sourceFiles.filter((path) => path.startsWith("components/"));
    const components = componentFiles.map((path) => path.replace(/^components\//, "").replace(/\.tsx$/, "")).sort();
    expect(components).toEqual(expected.reusableComponents);

    const appSource = inventory.sourceFiles
      .filter((path) => path.startsWith("app/") && path.endsWith(".tsx"))
      .map((path) => read(`nextjs-small-business/${path}`))
      .join("\n");
    const importedComponents = [...appSource.matchAll(/from ["'](?:\.\.\/)+components\/([^"']+)["']/g)]
      .map((match) => match[1]);
    expect([...new Set(importedComponents)].sort()).toEqual(expected.reusableComponents);
    expect(importedComponents.filter((name) => name === "BusinessFacts")).toHaveLength(2);
    expect((appSource.match(/<Header\s*\/>/g) ?? [])).toHaveLength(1);
    expect((appSource.match(/<Footer\s*\/>/g) ?? [])).toHaveLength(1);

    const imageSources = [...appSource.matchAll(/<Image src="([^"]+)"/g)].map((match) => match[1]);
    expect(imageSources).toHaveLength(expected.images);
    for (const source of imageSources) {
      expect(inventory.sourceFiles).toContain(`public${source}`);
    }
    expect((appSource.match(/<UnsupportedMapWidget\s*\/>/g) ?? [])).toHaveLength(expected.unsupportedWidgets);

    const contact = read("nextjs-small-business/app/contact/page.tsx");
    const businessFacts = read("nextjs-small-business/components/BusinessFacts.tsx");
    expect(contact).toContain("hello@northstar.example");
    expect(contact).toContain("<BusinessFacts />");
    expect(businessFacts).toContain("+46 8 555 0100");
    expect(businessFacts).toContain("Example Street");
    expect(read("nextjs-small-business/components/UnsupportedMapWidget.tsx")).toContain("unsupported-widget");
    expect(read("nextjs-small-business/app/booking/page.tsx")).toContain("booking.example.test");

    const report = json<GoldenReport>("nextjs-small-business/expected/import-report.json");
    expect(report.evidence.map((item) => item.id).sort()).toEqual([
      "next-about-route", "next-booking-route", "next-contact-route", "next-facts", "next-footer",
      "next-header", "next-image-mechanic", "next-image-workshop", "next-root-route",
      "next-services-route", "next-shared-layout", "next-widget",
    ]);
  });

  it("captures linked HTML pages, analytics, animation, form, and obfuscated-script evidence", () => {
    const inventory = json<Inventory>("html-multipage/expected/evidence-inventory.json");
    const expected = inventory.expected as {
      pages: number;
      forms: number;
      analyticsTags: number;
      animations: number;
      obfuscatedScripts: number;
    };
    const htmlFiles = inventory.sourceFiles.filter((path) => !path.includes("/") && path.endsWith(".html"));
    expect(htmlFiles).toHaveLength(expected.pages);
    const pageSources = htmlFiles.map((path) => read(`html-multipage/${path}`));
    const interPageLinks = pageSources.flatMap((source) =>
      [...source.matchAll(/href="([^"]+\.html)"/g)].map((match) => match[1]),
    );
    for (const source of pageSources) expect(source).toMatch(/href="[^"]+\.html"/);
    expect([...new Set(interPageLinks)].sort()).toEqual(htmlFiles.sort());
    for (const target of interPageLinks) expect(inventory.sourceFiles).toContain(target);

    const linkedAssets = pageSources.flatMap((source) => [
      ...[...source.matchAll(/(?:href|src)="(assets\/[^"]+)"/g)].map((match) => match[1]),
    ]);
    expect([...new Set(linkedAssets)].sort()).toEqual(["assets/app.js", "assets/loaf.svg", "assets/styles.css"]);
    for (const target of linkedAssets) expect(inventory.sourceFiles).toContain(target);
    expect(pageSources.filter((source) => /<link rel="stylesheet" href="assets\/styles\.css">/.test(source))).toHaveLength(expected.pages);

    const allHtml = pageSources.join("\n");
    expect((allHtml.match(/<form\b/g) ?? [])).toHaveLength(expected.forms);
    expect(allHtml).toMatch(/googletagmanager\.com\/gtag\/js\?id=G-SYNTHETIC-1/);
    expect(allHtml).toContain("syntheticGtag('config','G-SYNTHETIC-1')");
    expect(allHtml).toMatch(/<noscript><iframe src="https:\/\/www\.googletagmanager\.com\/ns\.html\?id=GTM-SYNTHETIC-ID"/);
    expect((allHtml.match(/G-(?:SYNTHETIC-1)|GTM-(?:SYNTHETIC-ID)/g) ?? []).length).toBeGreaterThanOrEqual(expected.analyticsTags);

    const css = read("html-multipage/assets/styles.css");
    const script = read("html-multipage/assets/app.js");
    expect(Number(css.includes("@keyframes")) + Number(script.includes("IntersectionObserver"))).toBe(expected.animations);
    expect((allHtml.match(/data-obfuscated-synthetic/g) ?? [])).toHaveLength(expected.obfuscatedScripts);

    const report = json<GoldenReport>("html-multipage/expected/import-report.json");
    expect(report.evidence.map((item) => item.id).sort()).toEqual([
      "html-about", "html-animation-css", "html-animation-js", "html-contact", "html-css",
      "html-form", "html-ga4", "html-gtm", "html-home", "html-loaf-asset", "html-obfuscated",
      "html-services",
    ]);
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
