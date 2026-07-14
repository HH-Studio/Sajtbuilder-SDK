import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { indexWxrMedia } from "../src/import/wordpress/media";
import { parseWxr } from "../src/import/wordpress/wxr";

const fixture = readFileSync(resolve("fixtures/import/wordpress-wxr/export.xml"));

describe("bounded WordPress WXR parsing", () => {
  it("preserves content relationships from the 20+ post fixture", () => {
    const document = parseWxr(fixture);
    expect(document.version).toBe("1.2");
    expect(document.authors).toHaveLength(2);
    expect(document.terms.filter((term) => term.taxonomy === "category")).toHaveLength(3);
    expect(document.terms.filter((term) => term.taxonomy === "tag")).toHaveLength(4);
    expect(document.items.filter((item) => item.type === "page")).toHaveLength(5);
    expect(document.items.filter((item) => item.type === "post" && item.status === "publish")).toHaveLength(24);
    expect(document.items.filter((item) => item.type === "post" && item.status === "draft")).toHaveLength(2);
    expect(document.items.filter((item) => item.type === "attachment")).toHaveLength(3);
    expect(document.items.filter((item) => item.type === "nav_menu_item")).toHaveLength(5);

    const firstPost = document.items.find((item) => item.sourceId === "201");
    expect(firstPost).toMatchObject({
      creator: "fixture-editor",
      featuredMediaSourceId: "501",
      seo: { title: "Synthetic spring guide" },
      terms: expect.arrayContaining([
        { taxonomy: "category", slug: "guides", name: "Guides" },
        { taxonomy: "post_tag", slug: "beginner", name: "Beginner" },
      ]),
    });
    expect(document.items.find((item) => item.sourceId === "225")?.metadata._wp_old_slug).toBe("retired-guide-a");
    expect(indexWxrMedia(document).missingFeaturedMedia).toEqual([]);
  });

  it.each([
    ["doctype", "<!DOCTYPE rss><rss/>", /DTD and entity/],
    ["entity", "<!ENTITY x SYSTEM 'file:///etc/passwd'><rss/>", /DTD and entity/],
    ["unknown entity", "<rss><channel>&xxe;</channel></rss>", /Invalid or unsafe WXR/],
    ["malformed namespaces", "<rss><wp:item></rss>", /Invalid or unsafe WXR/],
  ])("rejects %s input", (_name, xml, message) => {
    expect(() => parseWxr(xml)).toThrow(message);
  });

  it("enforces byte, text, depth, item, term, author, attachment, and metadata caps", () => {
    expect(() => parseWxr(fixture, { maxBytes: 10 })).toThrow(/byte cap/);
    expect(() => parseWxr(fixture, { maxTextNodeBytes: 8 })).toThrow(/text node/);
    expect(() => parseWxr(fixture, { maxDepth: 2 })).toThrow(/depth cap/);
    expect(() => parseWxr(fixture, { maxElements: 2 })).toThrow(/element cap/);
    expect(() => parseWxr(fixture, { maxItems: 1 })).toThrow(/item cap/);
    expect(() => parseWxr(fixture, { maxTerms: 1 })).toThrow(/term cap/);
    expect(() => parseWxr(fixture, { maxAuthors: 1 })).toThrow(/author cap/);
    expect(() => parseWxr(fixture, { maxAttachments: 1 })).toThrow(/attachment cap/);
    expect(() => parseWxr(fixture, { maxMetadataPerItem: 1 })).toThrow(/metadata cap/);
  });

  it("preserves hierarchy, order, dates, excerpts, menu metadata, and attachment URLs", () => {
    const xml = `<?xml version="1.0"?><rss xmlns:wp="http://wordpress.org/export/1.2/" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Fixture</title><wp:wxr_version>1.2</wp:wxr_version><wp:base_site_url>https://example.test</wp:base_site_url><wp:base_blog_url>https://example.test/blog</wp:base_blog_url><item><title>Child</title><wp:post_id>2</wp:post_id><wp:post_type>page</wp:post_type><wp:status>publish</wp:status><wp:post_name>child</wp:post_name><wp:post_parent>1</wp:post_parent><wp:menu_order>4</wp:menu_order><wp:post_date_gmt>2025-01-02 03:04:05</wp:post_date_gmt><excerpt:encoded>Summary</excerpt:encoded><content:encoded>Body</content:encoded><wp:postmeta><wp:meta_key>_menu_item_object_id</wp:meta_key><wp:meta_value>1</wp:meta_value></wp:postmeta></item><item><title>Image</title><wp:post_id>9</wp:post_id><wp:post_type>attachment</wp:post_type><wp:status>inherit</wp:status><wp:post_name>image</wp:post_name><wp:attachment_url>https://example.test/image.jpg</wp:attachment_url></item></channel></rss>`;
    const document = parseWxr(xml);
    expect(document.blogUrl).toBe("https://example.test/blog");
    expect(document.items[0]).toMatchObject({
      parentSourceId: "1",
      menuOrder: 4,
      publishedAt: "2025-01-02 03:04:05",
      excerpt: "Summary",
      content: "Body",
      metadata: { _menu_item_object_id: "1" },
    });
    expect(document.items[1]?.attachmentUrl).toBe("https://example.test/image.jpg");
  });

  it("keeps source ids as strings and ignores account secrets as model fields", () => {
    const document = parseWxr(fixture);
    expect(document.items[0]?.sourceId).toBe("101");
    expect(document.authors[0]).not.toHaveProperty("email");
    expect(JSON.stringify(document)).not.toContain("fixture-editor@example.test");
  });
});
