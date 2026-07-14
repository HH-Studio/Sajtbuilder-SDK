import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { generateKeyBetween } from "fractional-indexing";
import { detectSupportedBookingProvider, nativeFormReplacement } from "../src/import/native-replacements";
import { ingestHtmlInput } from "../src/import/html/input";
import { mapHtmlIngestion } from "../src/import/html/map";
import { validateImportReport } from "../src/import/report";

const golden = resolve(import.meta.dirname, "../fixtures/import/html-multipage/index.html");

describe("deterministic HTML mapping", () => {
  it("maps the golden multipage fixture to native content and reports every active source", async () => {
    const mapped = mapHtmlIngestion(await ingestHtmlInput(golden), {
      startedAt: "2026-07-14T10:00:00.000Z",
      completedAt: "2026-07-14T10:00:01.000Z",
      cliVersion: "0.1.0",
    });

    expect(mapped.validation.ok).toBe(true);
    expect(validateImportReport(mapped.report)).toEqual({ ok: true, issues: [] });
    expect(mapped.site.pages).toHaveLength(4);
    expect(mapped.site.site.businessName).toBe("Harbor Bakery");
    expect(mapped.site.sections.some((section) => section.type === "hero")).toBe(true);
    expect(mapped.site.sections.some((section) => section.type === "footer")).toBe(true);
    for (const section of mapped.site.sections) {
      expect(() => generateKeyBetween(section.order, null)).not.toThrow();
    }
    expect(mapped.site.sections).toContainEqual(expect.objectContaining({
      pageTmpId: "page-2",
      type: "rich-text",
      content: expect.objectContaining({ blocks: [expect.objectContaining({ kind: "ul", items: ["Breakfast box", "Office fika", "Celebration cake"] })] }),
    }));
    const homeHero = mapped.site.sections.find((section) => section.pageTmpId === "page-1" && section.type === "hero")!;
    expect((homeHero.content as { subheadline?: string }).subheadline).toBe("Explicitly synthetic bakery content for import testing.");
    expect(JSON.stringify(mapped.site)).toContain("synthetic bakery content");
    expect(mapped.site.site.tracking).toBeUndefined();
    expect(mapped.report.status).toBe("review_required");
    expect(mapped.report.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ disposition: "manual", reason: expect.stringContaining("verified mailto recipient") }),
      expect.objectContaining({ disposition: "skipped", reason: expect.stringContaining("never execute") }),
      expect.objectContaining({ disposition: "skipped", reason: expect.stringContaining("motion preset") }),
    ]));
    expect(JSON.stringify(mapped.site)).not.toContain("IntersectionObserver");
    expect(mapped.evidence.some((item) => item.excerpt.includes("app.js"))).toBe(true);
  });

  it("imports only verified typed analytics, booking URLs, and form facts", async () => {
    const root = mkdtempSync(join(tmpdir(), "snabbsajt-map-"));
    mkdirSync(join(root, "assets"));
    writeFileSync(join(root, "index.html"), `<!doctype html><title>Verified Studio</title><nav><a href="index.html">Home</a></nav><main>
      <h1>Verified Studio</h1><h2>Work</h2><p>We provide carefully sourced services for our clients.</p>
      <a href="https://calendly.com/verified-studio/intro">Book</a>
      <form action="mailto:leads@example.com" method="post">
        <label for="name">Your name</label><input id="name" name="name" required>
        <label for="email">Email</label><input id="email" name="email" type="email" required>
      </form>
      <script>gtag('config','G-ABC1234567');fbq('init','123456789012')</script>
    </main>`);
    const mapped = mapHtmlIngestion(await ingestHtmlInput(join(root, "index.html")));

    expect(mapped.validation.ok).toBe(true);
    expect(mapped.site.site.tracking).toEqual({ ga4: "G-ABC1234567", metaPixel: "123456789012" });
    expect(mapped.site.site.contact.email).toBe("leads@example.com");
    expect(mapped.site.sections).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "booking", content: expect.objectContaining({ source: { kind: "provider", url: "https://calendly.com/verified-studio/intro", ctaLabel: "Book" } }) }),
      expect.objectContaining({ type: "lead-form", content: expect.objectContaining({ fields: [
        { key: "name", label: "Your name", type: "text", required: true },
        { key: "email", label: "Email", type: "email", required: true },
      ] }) }),
    ]));
    expect(mapped.report.status).toBe("review_required");
    expect(mapped.report.items.filter((item) => item.id.includes("consent"))).toHaveLength(2);
  });

  it("does not import conflicting or partially matched synthetic analytics ids", async () => {
    const root = mkdtempSync(join(tmpdir(), "snabbsajt-conflict-"));
    writeFileSync(join(root, "index.html"), `<h1>x</h1><script>
      gtag('config','G-AAAA1111');gtag('config','G-BBBB2222');
      gtag('config','G-SYNTHETIC-1');
    </script>`);
    const mapped = mapHtmlIngestion(await ingestHtmlInput(join(root, "index.html")));
    expect(mapped.site.site.tracking).toBeUndefined();
    expect(mapped.report.items).toContainEqual(expect.objectContaining({ id: "tracking-conflict-001", disposition: "manual" }));
  });

  it("does not treat analytics-looking prose as verified tracking configuration", async () => {
    const root = mkdtempSync(join(tmpdir(), "snabbsajt-analytics-prose-"));
    writeFileSync(join(root, "index.html"), `<title>Demo</title><h1>Demo</h1><script>console.log("Example token G-DEMO1234 and GTM-DEMO1234 only")</script>`);
    const mapped = mapHtmlIngestion(await ingestHtmlInput(join(root, "index.html")));
    expect(mapped.site.site.tracking).toBeUndefined();
  });

  it("preserves bounded content order and blocks approval when content is truncated", async () => {
    const root = mkdtempSync(join(tmpdir(), "snabbsajt-content-cap-"));
    const paragraphs = Array.from({ length: 100 }, (_, index) => `<p>Paragraph ${index + 1}</p>`).join("");
    writeFileSync(join(root, "index.html"), `<title>Long page</title><h1>Long page</h1>${paragraphs}`);
    const mapped = mapHtmlIngestion(await ingestHtmlInput(join(root, "index.html")));
    const rich = mapped.site.sections.find((section) => section.type === "rich-text")!;
    expect((rich.content as { blocks: unknown[] }).blocks).toHaveLength(80);
    expect(mapped.report.status).toBe("blocked");
    expect(mapped.report.items).toContainEqual(expect.objectContaining({ id: "content-truncated-001", blocking: true }));
  });

  it("reports unavailable media and survives malformed contact escapes", async () => {
    const root = mkdtempSync(join(tmpdir(), "snabbsajt-hostile-contact-"));
    writeFileSync(join(root, "index.html"), `<title>Studio</title><h1>Studio</h1><a href="tel:%ZZ">Call</a><img src="https://cdn.example/photo.jpg">`);
    const mapped = mapHtmlIngestion(await ingestHtmlInput(join(root, "index.html")));
    expect(mapped.site.site.contact.phone).toBeUndefined();
    expect(mapped.report.items).toContainEqual(expect.objectContaining({ id: "contact-invalid", disposition: "manual" }));
    expect(mapped.report.items).toContainEqual(expect.objectContaining({ id: "media-unavailable-001", disposition: "missing" }));
  });

  it("keeps a long first paragraph in rich text instead of silently reducing it to hero copy", async () => {
    const root = mkdtempSync(join(tmpdir(), "snabbsajt-long-intro-"));
    const paragraph = "A".repeat(2_000);
    writeFileSync(join(root, "index.html"), `<title>Long</title><h1>Long</h1><p>${paragraph}</p>`);
    const mapped = mapHtmlIngestion(await ingestHtmlInput(join(root, "index.html")));
    const hero = mapped.site.sections.find((section) => section.type === "hero")!;
    const rich = mapped.site.sections.find((section) => section.type === "rich-text")!;
    expect((hero.content as { subheadline: string }).subheadline).toHaveLength(240);
    expect((rich.content as { blocks: Array<{ kind: string; text: string }> }).blocks).toContainEqual({ kind: "p", text: "A".repeat(1_200) });
    expect(mapped.report).toMatchObject({ status: "blocked" });
    expect(mapped.report.items).toContainEqual(expect.objectContaining({ id: "content-value-truncated-001", blocking: true }));
  });

  it("keeps booking and forms on their source page and preserves verified image dimensions", async () => {
    const root = mkdtempSync(join(tmpdir(), "snabbsajt-page-map-"));
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(png.buffer).setUint32(16, 640);
    new DataView(png.buffer).setUint32(20, 480);
    writeFileSync(join(root, "index.html"), '<title>Studio</title><h1>Home</h1><a href="contact.html">Contact</a>');
    writeFileSync(join(root, "contact.html"), `<title>Contact</title><h1>Contact</h1>
      <a href="https://calendly.com/studio/demo">Book</a>
      <form action="mailto:lead@example.com" method="post"><label>Name <input name="name" required></label></form>
      <img src="photo.png">`);
    writeFileSync(join(root, "photo.png"), png);

    const mapped = mapHtmlIngestion(await ingestHtmlInput(join(root, "index.html")));
    const contact = mapped.site.pages.find((page) => page.slug === "contact")!;
    expect(mapped.site.sections).toEqual(expect.arrayContaining([
      expect.objectContaining({ pageTmpId: contact.tmpId, type: "booking" }),
      expect.objectContaining({ pageTmpId: contact.tmpId, type: "lead-form" }),
    ]));
    expect(mapped.site.assets[0]).toMatchObject({ width: 640, height: 480 });
  });
});

describe("native replacement safety", () => {
  it("accepts exact supported https hosts and rejects spoofing, credentials, and http", () => {
    expect(detectSupportedBookingProvider("https://team.calendly.com/demo")).toBe("calendly");
    expect(detectSupportedBookingProvider("https://calendly.com.evil.test/demo")).toBeNull();
    expect(detectSupportedBookingProvider("https://calendly.com@evil.test/demo")).toBeNull();
    expect(detectSupportedBookingProvider("https://user@calendly.com/demo")).toBeNull();
    expect(detectSupportedBookingProvider("http://calendly.com/demo")).toBeNull();
  });

  it("refuses unknown recipients, selects without sourced options, and sanitized key collisions", () => {
    expect(nativeFormReplacement({ method: "post", fields: [{ name: "email", type: "email" }] })).toBeNull();
    expect(nativeFormReplacement({ action: "mailto:a@example.com", method: "post", fields: [{ name: "choice", type: "select" }] })).toBeNull();
    expect(nativeFormReplacement({ action: "mailto:a@example.com", method: "post", fields: [
      { name: "first name", type: "text" }, { name: "first-name", type: "text" },
    ] })).toBeNull();
  });
});
