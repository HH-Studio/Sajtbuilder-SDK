import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import {
  createStarterSite,
  defineSection,
  defineSite,
  packSitePackage,
  validateSitePackage,
} from "../src/index";

describe("public Site Kit API", () => {
  it("creates a runtime-valid starter for both source workflows", () => {
    for (const template of ["nextjs", "html"] as const) {
      const site = createStarterSite(template);
      expect(validateSitePackage(site)).toMatchObject({ ok: true });
    }
  });

  it("keeps typed authoring helpers as zero-cost identity functions", () => {
    const section = defineSection({
      pageTmpId: "home",
      type: "hero",
      variant: "minimal",
      order: "a0",
      content: { type: "hero", headline: "Hello" },
    });
    const site = defineSite({ ...createStarterSite(), sections: [section] });
    expect(site.sections[0]).toBe(section);
    expect(validateSitePackage(site).ok).toBe(true);
  });

  it("packs a checksum manifest that matches the importer bundle contract", async () => {
    const site = createStarterSite();
    const result = await packSitePackage({ site, assetFiles: {} });
    const files = unzipSync(result.zip);
    expect(Object.keys(files).sort()).toEqual(["manifest.json", "site.json"]);
    expect(JSON.parse(strFromU8(files["manifest.json"]))).toMatchObject({
      format: "sajt-backup",
      version: 1,
      assets: [],
      fonts: [],
    });
    expect(JSON.parse(strFromU8(files["site.json"])).site.businessName).toBe("Example Studio");
  });

  it("reports cross-reference errors before upload", () => {
    const site = createStarterSite();
    site.sections[0].pageTmpId = "missing";
    const report = validateSitePackage(site);
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.message.includes("unknown page"))).toBe(true);
  });

  it("rejects self-hosted video that the v1 importer cannot preserve", () => {
    const site = createStarterSite();
    site.sections[0].content = {
      type: "hero",
      headline: "Video hero",
      bgVideo: { assetId: "clip", alt: "Background clip" },
    };
    expect(validateSitePackage(site)).toMatchObject({ ok: false });
    expect(validateSitePackage(site).issues.some((issue) => issue.message.includes("not portable"))).toBe(true);
  });

  it("refuses to pack a symlinked asset", () => {
    const root = mkdtempSync(join(tmpdir(), "site-kit-symlink-"));
    const siteDir = join(root, "site");
    mkdirSync(join(siteDir, "assets"), { recursive: true });
    mkdirSync(join(siteDir, "fonts"), { recursive: true });
    const secret = join(root, "secret.txt");
    writeFileSync(secret, "must-not-enter-bundle");
    const site = createStarterSite();
    site.assets.push({
      exportId: "hero",
      url: "bundle://hero",
      width: 1,
      height: 1,
      mimeType: "image/png",
      kind: "image",
    });
    site.sections[0].content = {
      ...site.sections[0].content,
      media: { assetId: "hero", alt: "Hero" },
    };
    writeFileSync(join(siteDir, "site.json"), JSON.stringify(site));
    symlinkSync(secret, join(siteDir, "assets", "hero.png"));

    expect(() =>
      execFileSync(process.execPath, [join(process.cwd(), "dist", "cli.js"), "pack", siteDir], {
        encoding: "utf8",
        stdio: "pipe",
      }),
    ).toThrow(/must not be a symbolic link/);
  });

  it("refuses to read a symlinked site.json", () => {
    const root = mkdtempSync(join(tmpdir(), "site-kit-json-symlink-"));
    const siteDir = join(root, "site");
    mkdirSync(siteDir, { recursive: true });
    const privateSite = join(root, "private-site.json");
    writeFileSync(privateSite, JSON.stringify(createStarterSite()));
    symlinkSync(privateSite, join(siteDir, "site.json"));

    expect(() =>
      execFileSync(process.execPath, [join(process.cwd(), "dist", "cli.js"), "pack", siteDir], {
        encoding: "utf8",
        stdio: "pipe",
      }),
    ).toThrow(/must not be a symbolic link/);
  });
});
