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

/** One temporary source tree, returned as the entry file to ingest. */
function fixture(name: string, files: Record<string, string | Uint8Array>): string {
  const root = mkdtempSync(join(tmpdir(), `snabbsajt-${name}-`));
  for (const [file, body] of Object.entries(files)) writeFileSync(join(root, file), body);
  return join(root, "index.html");
}

const typesOn = (mapped: Awaited<ReturnType<typeof mapHtmlIngestion>>, tmpId: string) =>
  mapped.site.sections.filter((section) => section.pageTmpId === tmpId).map((section) => section.type);

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
    // The page's own shape, not a fixed ladder: the home page's prose becomes an
    // About band and the catering page's list stays a list.
    expect(typesOn(mapped, "home")).toContain("about");
    const catering = mapped.site.sections.find(
      (section) => section.pageTmpId === "services" && section.type === "highlights",
    );
    expect((catering!.content as { items: Array<{ title: string }> }).items.map((item) => item.title))
      .toEqual(["Breakfast box", "Office fika", "Celebration cake"]);
    const homeHero = mapped.site.sections.find((section) => section.pageTmpId === "home" && section.type === "hero")!;
    expect((homeHero.content as { subheadline?: string }).subheadline).toBe("Fresh bread by the harbor");
    expect(JSON.stringify(mapped.site)).toContain("synthetic bakery content");
    // Synthetic-looking ids are not measurement ids. A package written to disk
    // holds a higher bar than an in-app import an owner is watching.
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
    const mapped = mapHtmlIngestion(await ingestHtmlInput(fixture("map", {
      "index.html": `<!doctype html><title>Verified Studio</title><nav><a href="index.html">Home</a></nav><main>
      <h1>Verified Studio</h1><h2>Work</h2><p>We provide carefully sourced services for our clients.</p>
      <a href="https://calendly.com/verified-studio/intro">Book</a>
      <form action="mailto:leads@example.com" method="post">
        <label for="name">Your name</label><input id="name" name="name" required>
        <label for="email">Email</label><input id="email" name="email" type="email" required>
      </form>
      <script>gtag('config','G-ABC1234567');fbq('init','123456789012')</script>
    </main>`,
    })));

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
    const mapped = mapHtmlIngestion(await ingestHtmlInput(fixture("conflict", {
      "index.html": `<h1>x</h1><script>
      gtag('config','G-AAAA1111');gtag('config','G-BBBB2222');
      gtag('config','G-SYNTHETIC-1');
    </script>`,
    })));
    expect(mapped.site.site.tracking).toBeUndefined();
    expect(mapped.report.items).toContainEqual(expect.objectContaining({ id: "tracking-conflict-001", disposition: "manual" }));
  });

  it("does not treat analytics-looking prose as verified tracking configuration", async () => {
    const mapped = mapHtmlIngestion(await ingestHtmlInput(fixture("prose", {
      "index.html": `<title>Demo</title><h1>Demo</h1><script>console.log("Example token G-DEMO1234 and GTM-DEMO1234 only")</script>`,
    })));
    expect(mapped.site.site.tracking).toBeUndefined();
  });

  it("survives a malformed contact escape instead of aborting the import", async () => {
    const mapped = mapHtmlIngestion(await ingestHtmlInput(fixture("hostile-contact", {
      "index.html": `<title>Studio</title><h1>Studio</h1><a href="tel:%ZZ">Call</a><img src="https://cdn.example/photo.jpg">`,
    })));
    expect(mapped.validation.ok).toBe(true);
    expect(mapped.site.site.contact.phone).toBeUndefined();
    expect(mapped.report.items).toContainEqual(expect.objectContaining({ id: "contact-invalid", disposition: "manual" }));
    // The image lives on a host we never fetched, so no blob backs it and the
    // package must not declare it.
    expect(mapped.report.items).toContainEqual(expect.objectContaining({ id: "assets-unavailable", disposition: "missing" }));
  });

  // "Nothing vanishes silently" has to cover layout and copy, not only
  // behaviour: a real client page lost two thirds of its blocks while every
  // skipped script was itemised.
  it("either shows a source heading or names it in the report", async () => {
    // The invariant, not one shape of it: whatever the mapper does with a page,
    // a heading the source showed is on the imported page or in the findings.
    // Asserting a specific loss would go stale every time the mapper gets
    // better at a layout — which is exactly what happened to this file.
    const sources = [
      golden,
      fixture("invariant-a", {
        "index.html": `<html><body><main><h1>Studio</h1>` +
          ["Utbildning", "Handledning", "Forelasningar"].map((h) => `<h2>${h}</h2><div class="deco"></div>`).join("") +
          `</main></body></html>`,
      }),
      fixture("invariant-b", {
        "index.html": `<html><body><main><h1>Klinik</h1><h2>Priser</h2><table><tr><td>Klippning</td><td>450 kr</td></tr></table>` +
          `<h2>Om oss</h2><p>Vi har funnits sedan 2014 och tar emot i centrala Stockholm, med kvallstider tva dagar i veckan.</p>` +
          `<h2>Bilder</h2><img src="a.jpg"><img src="b.jpg"></main></body></html>`,
      }),
    ];

    for (const source of sources) {
      const mapped = mapHtmlIngestion(await ingestHtmlInput(source));
      const rendered = JSON.stringify(mapped.site.sections).toLowerCase();
      const reported = mapped.report.items
        .filter((item) => item.id.startsWith("structure-unmapped"))
        .map((item) => item.reason.toLowerCase())
        .join(" ");
      const ingested = await ingestHtmlInput(source);
      for (const page of ingested.pages) {
        for (const heading of page.headings.filter((h) => h.level <= 3 && h.text.length > 1)) {
          const needle = heading.text.toLowerCase();
          expect(
            rendered.includes(needle) || reported.includes(needle),
            `heading "${heading.text}" is neither shown nor reported`,
          ).toBe(true);
        }
      }
      // And a report that names a loss is never publish-ready.
      if (reported) expect(mapped.report.status).toBe("review_required");
    }
  });

  it("reports prose the import does not carry, even when it has no heading over it", async () => {
    const paragraph = (index: number) =>
      `Stycke ${index}: vi arbetar med ${"ordet".repeat(index + 2)} och beskriver har exakt hur det gar till hos oss, steg for steg.`;
    const mapped = mapHtmlIngestion(await ingestHtmlInput(fixture("prose-loss", {
      "index.html": `<html><body><main><h1>Klinik</h1>${[1, 2, 3, 4, 5, 6].map((i) => `<p>${paragraph(i)}</p>`).join("")}` +
        // A gallery of headings the About band cannot hold, so most paragraphs
        // are genuinely dropped rather than joined.
        `<h2>Priser</h2><h2>Om oss</h2><h2>Kontakt</h2></main></body></html>`,
    })));
    const missing = mapped.report.items.find((item) => item.id === "prose-missing-001");
    if (missing) {
      expect(missing.disposition).toBe("missing");
      expect(mapped.report.status).toBe("review_required");
    }
    // Whatever the mapper kept, it must not claim to have kept more: every
    // paragraph is either rendered or reported.
    const rendered = JSON.stringify(mapped.site.sections);
    const reported = mapped.report.items.some((item) => item.id.startsWith("prose-missing"));
    const carried = [1, 2, 3, 4, 5, 6].filter((i) => rendered.includes(paragraph(i).slice(0, 40)));
    expect(carried.length === 6 || reported).toBe(true);
  });

  it("stays ready when a page keeps everything it had", async () => {
    const mapped = mapHtmlIngestion(await ingestHtmlInput(fixture("kept", {
      "index.html": `<html><body><main><h1>Klinik</h1>` +
        `<p>Vi startade kliniken 2014 med en enkel tanke: en behandling ska kannas trygg fran forsta samtalet till sista aterbesoket.</p>` +
        `<p>Teamet bestar av fyra legitimerade terapeuter, och alla har minst tio ars erfarenhet av arbete med stress och smarta.</p>` +
        `<p>Ett forlopp inleds med ett kostnadsfritt samtal dar vi tillsammans gar igenom vad du vill fa ut av tiden hos oss.</p>` +
        `</main></body></html>`,
    })));
    expect(mapped.site.sections.map((section) => section.type)).toContain("about");
    expect(mapped.report.items.some((item) => item.id.startsWith("prose-missing"))).toBe(false);
    expect(mapped.report.items.some((item) => item.id.startsWith("structure-unmapped"))).toBe(false);
    expect(mapped.report.status).toBe("ready");
  });

  it("keeps booking and forms on their source page and ships verified image dimensions", async () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(png.buffer).setUint32(16, 640);
    new DataView(png.buffer).setUint32(20, 480);
    const entry = fixture("page-map", {
      "index.html": '<title>Studio</title><h1>Home</h1><a href="contact.html">Contact</a>',
      "contact.html": `<title>Contact</title><h1>Contact</h1>
      <a href="https://calendly.com/studio/demo">Book</a>
      <form action="mailto:lead@example.com" method="post"><label>Name <input name="name" required></label></form>
      <img src="photo.png" alt="Studion">`,
      "photo.png": png,
    });

    const mapped = mapHtmlIngestion(await ingestHtmlInput(entry));
    const contact = mapped.site.pages.find((page) => page.slug === "contact")!;
    expect(mapped.site.sections).toEqual(expect.arrayContaining([
      expect.objectContaining({ pageTmpId: contact.tmpId, type: "booking" }),
      expect.objectContaining({ pageTmpId: contact.tmpId, type: "lead-form" }),
    ]));
    // Real pixels, read from the blob the package carries — not the mapper's
    // nominal 1600x1066, which is all the app can know before it downloads.
    expect(mapped.site.assets[0]).toMatchObject({ width: 640, height: 480 });
    // And every declared asset has exactly one file in the package.
    expect(mapped.assetFiles.map((file) => file.fileName))
      .toEqual(mapped.site.assets.map((asset) => `${asset.exportId}.png`));
    expect(mapped.validation.ok).toBe(true);
  });

  it("never declares an asset the package cannot carry", async () => {
    const mapped = mapHtmlIngestion(await ingestHtmlInput(fixture("remote-media", {
      "index.html": `<title>Studio</title><h1>Studio</h1>` +
        `<p>En bild vi aldrig hamtade far inte hamna i paketet som en tom referens.</p>` +
        `<img src="https://cdn.example/one.jpg"><img src="https://cdn.example/two.jpg">`,
    })));
    expect(mapped.site.assets).toHaveLength(0);
    expect(JSON.stringify(mapped.site.sections)).not.toContain("assetId");
    expect(mapped.validation.ok).toBe(true);
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
