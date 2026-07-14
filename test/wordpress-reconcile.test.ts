import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { importWordpressToDirectory } from "../packages/cli/src/commands/site/import-wordpress";
import { parseWxr } from "../src/import/wordpress/wxr";
import { reconcileWxrWithHtml } from "../src/import/wordpress/reconcile";
import type { SafeFetchResult } from "../src/import/net/safeFetch";

const wxrPath = resolve("fixtures/import/wordpress-wxr/export.xml");
const encoder = new TextEncoder();

function png(width = 1200, height = 800): Uint8Array {
  const value = new Uint8Array(24);
  value.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(value.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return value;
}

function response(url: string, html: string): SafeFetchResult {
  return {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: encoder.encode(html),
    finalUrl: url,
    redirects: [],
  };
}

describe("WordPress URL + WXR reconciliation", () => {
  it("creates a valid review package with posts, held drafts, SEO, redirects, and explicit losses", async () => {
    const root = mkdtempSync(join(tmpdir(), "snabbsajt-wordpress-"));
    const output = join(root, "package");
    const result = await importWordpressToDirectory(
      "https://garden.example.test/",
      wxrPath,
      output,
      "0.1.0",
      {
        fetcher: async (url) => url.includes("assets.example.test")
          ? { status: 200, headers: { "content-type": "image/png" }, body: png(), finalUrl: url, redirects: [] }
          : response(url, "<html><head><title>Synthetic Garden Journal</title></head><body><h1>Home</h1><p>Welcome to the synthetic garden journal.</p></body></html>"),
      },
    );

    expect(result.validation.ok).toBe(true);
    expect(result.report.status).toBe("review_required");
    expect(result.site.pages.filter((page) => page.pageType === "post")).toHaveLength(26);
    expect(result.site.pages.filter((page) => page.excludeFromPublish)).toHaveLength(2);
    expect(result.site.contentCollections).toEqual([{ tmpId: "wordpress-blog", kind: "blog", name: "Blog", slugPrefix: "news", order: 0 }]);
    expect(result.site.pages.find((page) => page.tmpId === "wxr-201")?.seo?.metaTitle).toBe("Synthetic spring guide");
    expect(result.site.pages.find((page) => page.tmpId === "wxr-201")?.featuredImage?.assetId).toBe("image-1");
    expect(result.site.assets).toHaveLength(3);
    expect(result.site.sections.some((section) => section.pageTmpId === "wxr-104" && section.type === "gallery")).toBe(true);
    expect(result.site.redirects?.some((redirect) => redirect.fromPath === "2024/01/spring-guide-01" && redirect.toPath === "news/spring-guide-01")).toBe(true);
    expect(result.site.redirects?.some((redirect) => redirect.fromPath === "retired-guide-a")).toBe(false);
    expect(result.report.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "draft-redirect-225", disposition: "manual" }),
      expect.objectContaining({ id: "plugin-103", disposition: "manual" }),
      expect.objectContaining({ id: "gallery-104", disposition: "converted" }),
      expect.objectContaining({ id: "taxonomy-201", disposition: "manual" }),
    ]));
    expect(JSON.parse(readFileSync(join(output, "site.json"), "utf8")).pages).toHaveLength(31);
  });

  it("reports public-only, WXR-only, mismatched, duplicate, and missing-media conflicts", async () => {
    const wxr = parseWxr(readFileSync(wxrPath));
    wxr.items.find((item) => item.sourceId === "202")!.slug = "spring-guide-01";
    wxr.items.find((item) => item.sourceId === "203")!.featuredMediaSourceId = "999";
    const html = await import("../src/import/html/input").then(({ ingestHtmlInput }) => ingestHtmlInput(
      "https://garden.example.test/",
      {
        fetcher: async (url) => response(url, "<html><head><title>Different home title</title></head><body><h1>Different</h1><p>This public content is deliberately different from the WXR body.</p><a href='/public-only/'>Only public</a></body></html>"),
        maxPages: 2,
      },
    ));
    const conflicts = reconcileWxrWithHtml(wxr, html);
    expect(conflicts.map((conflict) => conflict.code)).toEqual(expect.arrayContaining([
      "title_mismatch",
      "content_mismatch",
      "public_only",
      "wxr_only",
      "duplicate_slug",
      "missing_attachment",
    ]));
  });
});
