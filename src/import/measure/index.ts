import { createServer, type Server } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { computedDesignScript, normalizeComputedSample } from "./sampleComputedStyles";
import { extractMotion } from "./motionExtract";
import type { ComputedSample } from "./types";
import type { CustomMotion } from "../../convex/model/theme";

// ---------------------------------------------------------------------------
// `site-kit measure` (backlog 1725 item 6).
//
// A developer building a Site Kit package by hand had no way to produce
// measured values at all. The reference package was built with hand-written
// Playwright scripts and hand-transcribed computed styles - which is not a
// workflow, it is a person doing by hand what the product does automatically
// for every URL import.
//
// This runs the SAME in-page script the app's import runs
// (`computedDesignScript`), through the same normaliser, and prints the result
// as a `site.json` fragment. Sharing the implementation is the whole point: a
// second measurement that disagreed with the product's own would produce
// packages that look right in the CLI and wrong once imported.
//
// Playwright is an OPTIONAL dependency, loaded only when this command runs. A
// developer who only validates and packs should not have to install a browser,
// and the CLI says exactly what to install when they do want to measure.
// ---------------------------------------------------------------------------

export type MeasureResult = {
  /** The address that was actually rendered (a local one for a directory). */
  url: string;
  sample: ComputedSample;
  /** Entrance motion read from the page's own scripts, by PARSING - never by
   *  executing them. Same module the app's import uses. */
  motion?: CustomMotion;
};

/** What the CLI prints: exactly the keys an author pastes into `site.json`. */
export type MeasureFragment = {
  theme: {
    customBrandHex?: string;
    customType?: ComputedSample["type"];
    customLayout?: ComputedSample["layout"];
    customMotion?: CustomMotion;
  };
  /** Per-band geometry, keyed by heading. Goes on each section's
   *  `layout.measured`, never on the theme - a band's own padding is a fact
   *  about that band. */
  sections: NonNullable<ComputedSample["sections"]>;
  /** What was measured but has no home in `site.json`, so an author can see
   *  that we read it rather than wonder why it vanished. */
  notes: string[];
};

/**
 * Render `url` in a real browser and read the design off it.
 *
 * Playwright is imported dynamically so it stays optional. The error thrown
 * when it is missing names the install command, because "Cannot find module
 * 'playwright'" is not something a developer should have to translate.
 */
export async function measureUrl(url: string): Promise<ComputedSample> {
  let chromium: { launch: (opts?: unknown) => Promise<PlaywrightBrowser> };
  try {
    ({ chromium } = (await import("playwright")) as unknown as {
      chromium: { launch: (opts?: unknown) => Promise<PlaywrightBrowser> };
    });
  } catch {
    throw new Error(
      "measure needs a browser. Install it once with:\n  npm i -D playwright && npx playwright install chromium",
    );
  }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(url, { waitUntil: "load", timeout: 60_000 });
    // Webfonts and above-the-fold CSS have to settle, or the sample reports an
    // unstyled first paint. Same constant and same reason as the app's
    // renderer.
    await page.waitForTimeout(1200);
    const raw = await page.evaluate(computedDesignScript());
    return normalizeComputedSample(raw as Parameters<typeof normalizeComputedSample>[0]);
  } finally {
    await browser.close();
  }
}

/** The slice of Playwright this file uses. Declared rather than imported so the
 *  package type-checks without the optional dependency installed. */
type PlaywrightBrowser = {
  newPage: (opts?: unknown) => Promise<{
    goto: (url: string, opts?: unknown) => Promise<unknown>;
    waitForTimeout: (ms: number) => Promise<void>;
    evaluate: (script: string) => Promise<unknown>;
    content: () => Promise<string>;
  }>;
  close: () => Promise<void>;
};

/**
 * Measure a local package directory by serving it on loopback and rendering it.
 *
 * This is NOT the app's "an archive has no address" case. That rule exists
 * because putting a stranger's HTML on a reachable URL makes us a host for it;
 * here the files are the developer's own, on their own machine, and the server
 * binds to 127.0.0.1 and dies with the command. Nothing is executed that the
 * developer's own browser would not execute when they open the folder.
 */
export async function measureDirectory(dir: string): Promise<MeasureResult> {
  const root = resolve(dir);
  const entry = ["index.html", "site.html"].map((f) => join(root, f)).find((f) => existsSync(f));
  if (!entry) throw new Error(`${dir} has no index.html to render`);
  const { server, port } = await serveLoopback(root);
  try {
    const url = `http://127.0.0.1:${port}/${entry.slice(root.length + 1)}`;
    const sample = await measureUrl(url);
    return { url, sample };
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
  }
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

/** A static server on 127.0.0.1, on an OS-assigned port, that cannot serve a
 *  path outside `root` — a `..` in a URL resolves before it is joined, so the
 *  containment check is on the RESOLVED path. */
function serveLoopback(root: string): Promise<{ server: Server; port: number }> {
  const server = createServer((req, res) => {
    const raw = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const target = resolve(join(root, normalize(raw)));
    if (target !== root && !target.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(target) || statSync(target).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[extname(target).toLowerCase()] ?? "application/octet-stream" });
    createReadStream(target).pipe(res);
  });
  return new Promise((done, failed) => {
    server.on("error", failed);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        failed(new Error("could not bind a local port"));
        return;
      }
      done({ server, port: address.port });
    });
  });
}

/**
 * Turn a measurement into the fragment an author pastes into `site.json`.
 *
 * Two measured things deliberately do NOT appear in it, and both are listed in
 * `notes` rather than dropped silently:
 *
 *   - The measured FONT families. `site.json` names typefaces by curated
 *     family, and a family the source used is a name, not a licence - the app's
 *     own import resolves it to the nearest curated face for exactly that
 *     reason. Printing it as `customFonts` would produce a package that asks
 *     for a face nothing loads.
 *   - Page colours. They belong to a palette, and a palette is thirteen paired
 *     tokens; emitting four of them would leave the other nine derived from a
 *     brand hue that no longer matches.
 */
export function measureFragment(result: MeasureResult): MeasureFragment {
  const { sample } = result;
  const notes: string[] = [];
  if (sample.headingFont || sample.bodyFont) {
    notes.push(
      `fonts measured (${[sample.headingFont, sample.bodyFont].filter(Boolean).join(", ")}) — pick the nearest curated family in site.json rather than pasting these`,
    );
  }
  if (sample.colors) {
    notes.push("page colours measured — set one brand hex and let the palette derive the rest");
  }
  if (sample.heroBackgroundImage) notes.push('hero renders a background image — the "overlay" hero variant matches it');
  return {
    theme: {
      ...(sample.brandHex ? { customBrandHex: sample.brandHex } : {}),
      ...(sample.type ? { customType: sample.type } : {}),
      ...(sample.layout ? { customLayout: sample.layout } : {}),
      ...(result.motion ? { customMotion: result.motion } : {}),
    },
    sections: sample.sections ?? [],
    notes,
  };
}

/** Read entrance motion off the page's own markup and scripts. Parsed, never
 *  executed — the same guarantee the app's import makes. */
export function motionFrom(html: string, externalScripts: string[] = []): CustomMotion | undefined {
  return extractMotion(html, externalScripts).motion;
}
