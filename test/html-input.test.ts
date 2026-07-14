import { appendFileSync, mkdirSync, mkdtempSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { parseCssEvidence } from "../src/import/html/css";
import { parseHtmlDocument } from "../src/import/html/dom";
import { readLocalFile } from "../src/import/html/assets";
import { ingestHtmlInput } from "../src/import/html/input";
import { SafeFetchError, type SafeFetchOptions, type SafeFetchResult } from "../src/import/net/safeFetch";

describe("structural HTML inventory", () => {
  it("extracts content and stores active behavior only as inert evidence", () => {
    const html = `<!doctype html><html><head>
      <title>Real &amp; safe</title>
      <style>.hero { color: #123456; animation: fade 1s }</style>
      <link rel="stylesheet" href="/style.css">
    </head><body onload="steal()">
      <h1>Hello <em>world</em></h1><p>Visible copy</p>
      <a href="/about">About</a><img src="/hero.jpg" srcset="/small.jpg 480w, /hero.jpg 1200w">
      <script src="/app.js"></script><script>window.evil = true</script>
      <form action="https://forms.example/lead" method="post"><input name="email"><button>Send</button></form>
      <iframe src="https://video.example/embed/1"></iframe>
    </body></html>`;
    const result = parseHtmlDocument(html, "https://example.com/");

    expect(result.title).toBe("Real & safe");
    expect(result.headings).toEqual([{ level: 1, text: "Hello world" }]);
    expect(result.text).toContain("Visible copy");
    expect(result.text).not.toContain("window.evil");
    expect(result.links).toContain("https://example.com/about");
    expect(result.media).toEqual(expect.arrayContaining([
      "https://example.com/hero.jpg",
      "https://example.com/small.jpg",
    ]));
    expect(result.stylesheets).toEqual(["https://example.com/style.css"]);
    expect(result.evidence.scripts).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: "https://example.com/app.js" }),
      expect.objectContaining({ inline: "window.evil = true" }),
    ]));
    expect(result.evidence.inlineHandlers).toEqual([
      { element: "body", attribute: "onload", value: "steal()" },
    ]);
    expect(result.evidence.forms[0]).toMatchObject({
      action: "https://forms.example/lead",
      method: "post",
      fields: [{ name: "email", type: "text" }],
    });
    expect(result.evidence.embeds).toEqual([{ element: "iframe", src: "https://video.example/embed/1" }]);
    expect(result.evidence.thirdPartyHosts).toEqual(["forms.example", "video.example"]);
  });

  it("uses a real parser for malformed but browser-valid structure", () => {
    const result = parseHtmlDocument("<title>x</title><H1 data-x='>'>One</H1><p>Two &amp; three", "https://example.com");
    expect(result.headings).toEqual([{ level: 1, text: "One" }]);
    expect(result.text).toContain("Two & three");
  });

  it("resolves references against the first valid base URL without changing page identity", () => {
    const result = parseHtmlDocument(`
      <base href="javascript:bad"><base href="/nested/">
      <a href="about">About</a><img src="hero.png">
    `, "https://example.com/index.html");

    expect(result.url).toBe("https://example.com/index.html");
    expect(result.links).toEqual(["https://example.com/nested/about"]);
    expect(result.media).toEqual(["https://example.com/nested/hero.png"]);
  });

  it("classifies script and style preloads as inert evidence, never generic assets", () => {
    const result = parseHtmlDocument(`
      <link rel="preload" as="script" href="classic.js">
      <link rel="modulepreload" href="module.js">
      <link rel="preload" as="style" href="theme.css">
      <link rel="preload" as="image" href="hero.webp">
      <link rel="preload" as="fetch" href="data.json">
    `, "https://example.com/");

    expect(result.evidence.scripts).toEqual([
      { src: "https://example.com/classic.js" },
      { src: "https://example.com/module.js" },
    ]);
    expect(result.stylesheets).toEqual(["https://example.com/theme.css"]);
    expect(result.media).toEqual(["https://example.com/hero.webp"]);
    expect(JSON.stringify(result)).not.toContain("data.json");
  });

  it("parses srcset candidates without turning data URL commas into network requests", () => {
    const result = parseHtmlDocument(`
      <img srcset="data:image/svg+xml,%3Csvg%3E 1x, hero.png 2x">
    `, "https://example.com/page/");

    expect(result.media).toEqual(["https://example.com/page/hero.png"]);
  });

  it("inventories video posters and track media", () => {
    const result = parseHtmlDocument(`
      <video poster="poster.jpg"><track src="captions.vtt"></video>
    `, "https://example.com/page/");

    expect(result.media).toEqual([
      "https://example.com/page/poster.jpg",
      "https://example.com/page/captions.vtt",
    ]);
  });

  it("walks deeply nested hostile markup without recursive overflow or quadratic subtree scans", () => {
    const depth = 3_000;
    const html = `<h1>${"<span>".repeat(depth)}Deep${"</span>".repeat(depth)}</h1><p>Done</p>`;
    const result = parseHtmlDocument(html, "https://example.com");
    expect(result.headings).toEqual([{ level: 1, text: "Deep" }]);
    expect(result.text).toContain("Done");
  });
});

describe("CSS evidence", () => {
  it("parses allowlisted design signals without returning runtime CSS", () => {
    const css = `
      @import url("theme.css") screen;
      @font-face { font-family: "Studio Sans"; src: url(font.woff2); font-weight: 700 }
      @media (min-width: 768px) { .grid { display: grid; gap: 2rem } }
      .hero { color: #123456; border-color: red; outline-color: rgb(1 2 3); background: hsl(120 50% 50%) url('../hero.webp') center/cover; margin: 1rem; animation: fade 1s }
      @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
    `;
    const result = parseCssEvidence(css, "https://example.com/css/main.css");

    expect(result.colors).toContain("#123456");
    expect(result.colors).toEqual(expect.arrayContaining(["red", "rgb(1 2 3)", "hsl(120 50% 50%)"]));
    expect(result.fontFamilies).toContain("\"Studio Sans\"");
    expect(result.fontWeights).toContain("700");
    expect(result.spacing).toEqual(expect.arrayContaining(["gap:2rem", "margin:1rem"]));
    expect(result.breakpoints).toContain("(min-width:768px)");
    expect(result.layout).toEqual(expect.arrayContaining(["display:grid"]));
    expect(result.media).toEqual(expect.arrayContaining([
      "https://example.com/css/font.woff2",
      "https://example.com/hero.webp",
    ]));
    expect(result.imports).toEqual(["https://example.com/css/theme.css"]);
    expect(result.animations).toEqual(expect.arrayContaining(["animation:fade 1s", "@keyframes fade"]));
    expect(result).not.toHaveProperty("css");
  });

  it("reports invalid CSS without executing or emitting it", () => {
    const result = parseCssEvidence("a { color: red; broken", "https://example.com/a.css");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result).not.toHaveProperty("runtimeCss");
  });

  it("does not misclassify color-like identifiers outside color-bearing declarations", () => {
    const result = parseCssEvidence(`
      #header { font-family: red; content: red; animation-name: chartreuse; --brand: purple }
      .real { border: 1px solid green; background-image: linear-gradient(red, rgb(1 2 3)); border-inline: 1px solid blue }
    `, "https://example.com/a.css");

    expect(result.colors).toEqual(expect.arrayContaining(["green", "red", "rgb(1 2 3)", "blue"]));
    expect(result.colors).not.toContain("chartreuse");
    expect(result.colors).not.toContain("purple");
  });
});

describe("bounded HTML input", () => {
  it("ingests a local HTML tree without leaving its selected root", async () => {
    const root = mkdtempSync(join(tmpdir(), "snabbsajt-html-"));
    const outside = join(root, "..", `outside-${Date.now()}.txt`);
    writeFileSync(outside, "do not read");
    mkdirSync(join(root, "css"));
    mkdirSync(join(root, "assets"));
    writeFileSync(join(root, "index.html"), `
      <title>Home</title><h1>Home</h1>
      <a href="about.html">About</a><a href="../${outside.split("/").pop()}">Outside</a>
      <link rel="stylesheet" href="css/main.css"><img src="assets/hero.png" srcset="data:image/svg+xml,%3Csvg%3E 1x, assets/hero.png 2x">
      <video poster="assets/hero.png"><track src="assets/captions.vtt"></video>
      <style>.inline{background:url('assets/inline.png')}</style>
      <script src="app.js"></script><link rel="preload" as="script" href="preloaded.js">`);
    writeFileSync(join(root, "about.html"), "<title>About</title><h1>About us</h1>");
    writeFileSync(join(root, "css/main.css"), ".x{display:flex;background:url('../assets/bg.png')}");
    writeFileSync(join(root, "app.js"), "window.analytics = true");
    writeFileSync(join(root, "preloaded.js"), "window.preloaded = true");
    writeFileSync(join(root, "assets/hero.png"), new Uint8Array([1, 2, 3]));
    writeFileSync(join(root, "assets/bg.png"), new Uint8Array([4, 5]));
    writeFileSync(join(root, "assets/inline.png"), new Uint8Array([6]));
    writeFileSync(join(root, "assets/captions.vtt"), "WEBVTT");

    const result = await ingestHtmlInput(join(root, "index.html"));
    expect(result.source.kind).toBe("html-file");
    expect(result.pages.map((page) => page.title).sort()).toEqual(["About", "Home"]);
    expect(result.assets.map((asset) => asset.path).sort()).toEqual(["assets/bg.png", "assets/captions.vtt", "assets/hero.png", "assets/inline.png"]);
    expect(result.css[0].layout).toContain("display:flex");
    expect(result.evidence.scripts).toContainEqual(expect.objectContaining({
      src: "app.js",
      externalText: "window.analytics = true",
    }));
    expect(result.evidence.scripts).toContainEqual(expect.objectContaining({
      src: "preloaded.js",
      externalText: "window.preloaded = true",
    }));
    expect(result.assets.some((asset) => asset.path.endsWith(".js"))).toBe(false);
    expect(JSON.stringify(result)).not.toContain("do not read");
    expect(result.warnings).toEqual([]);
  });

  it("accepts a zip and preserves scripts/forms as evidence, not runtime assets", async () => {
    const root = mkdtempSync(join(tmpdir(), "snabbsajt-html-zip-"));
    const archive = join(root, "site.zip");
    writeFileSync(archive, zipSync({
      "index.html": strToU8('<h1>Zip</h1><script src="app.js"></script><link rel="modulepreload" href="preloaded.js"><form action="/send"></form><img src="hero.png" srcset="data:image/svg+xml,%3Csvg%3E 1x, hero.png 2x"><video poster="hero.png"><track src="captions.vtt"></video>'),
      "app.js": strToU8("alert('inert')"),
      "preloaded.js": strToU8("window.preloaded = true"),
      "hero.png": new Uint8Array([1, 2]),
      "captions.vtt": strToU8("WEBVTT"),
    }));

    const result = await ingestHtmlInput(archive);
    expect(result.source.kind).toBe("zip");
    expect(result.pages).toHaveLength(1);
    expect(result.assets.map((asset) => asset.path).sort()).toEqual(["captions.vtt", "hero.png"]);
    expect(result.evidence.scripts[0]).toMatchObject({ src: "app.js", externalText: "alert('inert')" });
    expect(result.evidence.scripts).toContainEqual(expect.objectContaining({ src: "preloaded.js", externalText: "window.preloaded = true" }));
    expect(result.evidence.forms).toHaveLength(1);
    expect(result.assets.some((asset) => asset.path === "app.js")).toBe(false);
  });

  it("enforces page, file, and aggregate byte caps before expanding work", async () => {
    const root = mkdtempSync(join(tmpdir(), "snabbsajt-html-caps-"));
    writeFileSync(join(root, "index.html"), '<a href="two.html">Two</a><img src="large.bin"><img src="small.bin">');
    writeFileSync(join(root, "two.html"), "<h1>Two</h1>");
    writeFileSync(join(root, "large.bin"), new Uint8Array(10));
    writeFileSync(join(root, "small.bin"), new Uint8Array(1));

    await expect(ingestHtmlInput(join(root, "index.html"), { maxPages: 1 })).resolves.toMatchObject({
      pages: [expect.any(Object)],
      truncated: true,
    });
    await expect(ingestHtmlInput(join(root, "index.html"), { maxSingleAssetBytes: 5 }))
      .rejects.toThrow(/asset byte cap/i);
    await expect(ingestHtmlInput(join(root, "index.html"), { maxAssets: 1 }))
      .rejects.toThrow(/asset cap/i);
    await expect(ingestHtmlInput(join(root, "index.html"), { maxTotalBytes: 5 }))
      .rejects.toThrow(/total byte cap/i);
  });

  it("reads initial HTML and ZIP inputs through their byte caps", async () => {
    const root = mkdtempSync(join(tmpdir(), "snabbsajt-html-initial-caps-"));
    const htmlPath = join(root, "index.html");
    const zipPath = join(root, "site.zip");
    writeFileSync(htmlPath, "<h1>larger than cap</h1>");
    const archive = zipSync({ "index.html": strToU8("<h1>Zip</h1>") });
    writeFileSync(zipPath, archive);

    await expect(ingestHtmlInput(htmlPath, { maxHtmlBytes: 4 })).rejects.toThrow(/input byte cap/i);
    await expect(ingestHtmlInput(zipPath, { maxArchiveBytes: archive.byteLength - 1 })).rejects.toThrow(/input byte cap/i);
  });

  it("rejects symlinked ancestors and final input components", async () => {
    const root = mkdtempSync(join(tmpdir(), "snabbsajt-html-links-"));
    const outside = mkdtempSync(join(tmpdir(), "snabbsajt-html-outside-"));
    writeFileSync(join(outside, "secret.html"), "<h1>Outside</h1>");
    writeFileSync(join(outside, "site.zip"), zipSync({ "index.html": strToU8("<h1>Outside ZIP</h1>") }));
    symlinkSync(outside, join(root, "linked-directory"));
    symlinkSync(join(outside, "secret.html"), join(root, "linked.html"));
    symlinkSync(join(outside, "site.zip"), join(root, "linked.zip"));

    expect(() => readLocalFile({ root, path: "linked-directory/secret.html", maxBytes: 1_000, capLabel: "HTML" }))
      .toThrow(/outside selected root/i);
    await expect(ingestHtmlInput(join(root, "linked.html"))).rejects.toThrow(/unsafe|not found/i);
    await expect(ingestHtmlInput(join(root, "linked.zip"))).rejects.toThrow(/unsafe|not found/i);
  });

  it("detects a final-component swap after opening the descriptor", () => {
    const root = mkdtempSync(join(tmpdir(), "snabbsajt-html-swap-"));
    const outside = join(root, "outside.html");
    const target = join(root, "index.html");
    writeFileSync(target, "safe");
    writeFileSync(outside, "outside");

    expect(() => readLocalFile(
      { root, path: "index.html", maxBytes: 100, capLabel: "HTML" },
      { afterOpen: () => {
        renameSync(target, join(root, "original.html"));
        symlinkSync(outside, target);
      } },
    )).toThrow(/changed while being read/i);
  });

  it("uses a cap-plus-one read and metadata recheck when an opened file grows", () => {
    const root = mkdtempSync(join(tmpdir(), "snabbsajt-html-growth-"));
    const target = join(root, "index.html");
    writeFileSync(target, "a");

    expect(() => readLocalFile(
      { root, path: "index.html", maxBytes: 4, capLabel: "HTML" },
      { afterOpen: () => appendFileSync(target, "bcdef") },
    )).toThrow(/HTML byte cap/i);

    writeFileSync(target, "stable");
    expect(() => readLocalFile(
      { root, path: "index.html", maxBytes: 100, capLabel: "HTML" },
      { afterRead: () => appendFileSync(target, "changed") },
    )).toThrow(/changed while being read/i);
  });

  it("crawls same-origin URL pages and routes every CSS, script, font, and media hop through safe fetch", async () => {
    const bodies: Record<string, [string, string]> = {
      "https://site.example/": ["text/html", `
        <title>Home</title><a href="/about">About</a>
        <link rel="stylesheet" href="/style.css"><link rel="preload" as="script" href="/preloaded.js"><img src="/hero.png" srcset="data:image/svg+xml,%3Csvg%3E 1x, /hero.png 2x">
        <video poster="/hero.png"><track src="/captions.vtt"></video>
        <img src="https://cdn.example/tracker.png"><script src="/app.js"></script>`],
      "https://site.example/about": ["text/html", "<title>About</title><h1>About</h1>"],
      "https://site.example/style.css": ["text/css", '@import "/theme.css"; .x{background:url("/bg.png")} @font-face{font-family:x;src:url("/font.woff2")}'],
      "https://site.example/theme.css": ["text/css", ".x{display:grid}"],
      "https://site.example/app.js": ["text/javascript", "window.inert = true"],
      "https://site.example/preloaded.js": ["text/javascript", "window.preloaded = true"],
      "https://site.example/hero.png": ["image/png", "hero"],
      "https://site.example/bg.png": ["image/png", "background"],
      "https://site.example/font.woff2": ["font/woff2", "font"],
      "https://site.example/captions.vtt": ["text/vtt", "WEBVTT"],
    };
    const calls: Array<{ url: string; options: SafeFetchOptions }> = [];
    const fetcher = async (url: string, options: SafeFetchOptions): Promise<SafeFetchResult> => {
      calls.push({ url, options });
      const value = bodies[url];
      if (!value) throw new Error(`unexpected fetch ${url}`);
      return {
        status: 200,
        headers: { "content-type": value[0] },
        body: new TextEncoder().encode(value[1]),
        finalUrl: url,
        redirects: [],
      };
    };

    const result = await ingestHtmlInput("https://site.example/", { fetcher, maxConcurrency: 2 });
    expect(result.pages.map((page) => page.title).sort()).toEqual(["About", "Home"]);
    expect(result.css).toHaveLength(2);
    expect(result.assets.map((asset) => asset.path).sort()).toEqual(["bg.png", "captions.vtt", "font.woff2", "hero.png"]);
    expect(result.evidence.scripts).toContainEqual(expect.objectContaining({ externalText: "window.inert = true" }));
    expect(result.evidence.scripts).toContainEqual(expect.objectContaining({ externalText: "window.preloaded = true" }));
    expect(result.assets.some((asset) => asset.path.endsWith(".js"))).toBe(false);
    expect(result.evidence.thirdPartyHosts).toContain("cdn.example");
    expect(calls.map((call) => call.url).sort()).toEqual(Object.keys(bodies).sort());
    expect(calls.every((call) => call.options.maxBytes! > 0 && call.options.timeoutMs! > 0)).toBe(true);
  });

  it("propagates safe-fetch rejection for a hostile media hop instead of bypassing the policy", async () => {
    const calls: string[] = [];
    const fetcher = async (url: string): Promise<SafeFetchResult> => {
      calls.push(url);
      if (url.endsWith("/private.png")) {
        throw new SafeFetchError("UNSAFE_DESTINATION", "redirect resolved to metadata address");
      }
      return {
        status: 200,
        headers: { "content-type": "text/html" },
        body: new TextEncoder().encode('<img src="/private.png">'),
        finalUrl: url,
        redirects: [],
      };
    };

    await expect(ingestHtmlInput("https://site.example/", { fetcher })).rejects.toMatchObject({
      code: "UNSAFE_DESTINATION",
    });
    expect(calls).toEqual(["https://site.example/", "https://site.example/private.png"]);
  });

  it.each([
    ['<a href="/hostile-page">Page</a>', "https://evil.example/hostile-page"],
    ['<link rel="stylesheet" href="/hostile.css">', "https://evil.example/hostile.css"],
    ['<img src="/hostile.png">', "https://evil.example/hostile.png"],
  ])("rejects a queued resource redirected outside the selected origin", async (html, finalUrl) => {
    const fetcher = async (url: string): Promise<SafeFetchResult> => ({
      status: 200,
      headers: { "content-type": url.endsWith(".css") ? "text/css" : "text/html" },
      body: new TextEncoder().encode(url === "https://site.example/" ? html : "content"),
      finalUrl: url === "https://site.example/" ? url : finalUrl,
      redirects: url === finalUrl ? [] : [finalUrl],
    });
    await expect(ingestHtmlInput("https://site.example/", { fetcher }))
      .rejects.toThrow(/left selected site origin/i);
  });

  it("enforces one total URL-ingestion deadline even if an injected fetcher ignores its timeout", async () => {
    const fetcher = async (url: string): Promise<SafeFetchResult> => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return {
        status: 200,
        headers: { "content-type": "text/html" },
        body: new TextEncoder().encode("<h1>Late</h1>"),
        finalUrl: url,
        redirects: [],
      };
    };
    await expect(ingestHtmlInput("https://site.example/", { fetcher, timeoutMs: 1 }))
      .rejects.toThrow(/ingestion timeout/i);
  });
});
