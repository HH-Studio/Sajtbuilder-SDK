/**
 * build:snabbsajt — turn `src/site.ts` into an importable SnabbSajt bundle.
 *
 *   1. Validate the site against the real SnabbSajt import validators.
 *   2. Pack it into `out/snabbsajt-bundle.zip`.
 *
 * Import the .zip in SnabbSajt: Settings -> Backup & move -> Import. It creates
 * a NEW unpublished draft — nothing is overwritten.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { packSitePackage, validateSitePackage } from "@snabbsajt/site-kit";
import { site } from "../src/site";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../out");
const zipPath = resolve(outDir, "snabbsajt-bundle.zip");

async function main() {
  // This template ships no bundled image blobs (it is content-first), so there
  // are no asset files to pass. Drop files into an `assets/` map here if you
  // reference `bundle://` assets from `site.ts`.
  const report = validateSitePackage(site);
  for (const issue of report.issues) {
    console.log(`${issue.level === "error" ? "✗" : "!"} ${issue.path}: ${issue.message}`);
  }
  if (!report.ok) {
    console.error("\nSite is invalid — fix the errors above before packing.");
    process.exit(1);
  }

  const packed = await packSitePackage({ site, assetFiles: {}, exportedAt: site.exportedAt });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(zipPath, packed.zip);

  console.log(`\n✓ ${site.pages.length} pages, ${site.sections.length} sections`);
  console.log(`✓ wrote ${zipPath} (${packed.zip.byteLength} bytes)`);
  console.log("→ Import in SnabbSajt: Settings → Backup & move → Import");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
