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

  it("rejects section order keys that the editor cannot extend", () => {
    const site = createStarterSite();
    site.sections[0].order = "a000";
    expect(validateSitePackage(site).issues).toContainEqual({
      level: "error",
      path: "sections[0].order",
      // Substring, not equality: the sentence after this prefix is app-owned
      // copy that gets improved, and asserting it verbatim made a better error
      // message read as a broken mirror.
      message: expect.stringContaining("invalid fractional order key"),
    });
  });

  it("keeps old bundles valid and validates redirect graphs", () => {
    const legacy = createStarterSite();
    expect("redirects" in legacy).toBe(false);
    expect(validateSitePackage(legacy).ok).toBe(true);

    const valid = createStarterSite();
    valid.pages.push({
      tmpId: "contact",
      slug: "contact",
      title: "Contact",
      order: 1,
      showInNav: true,
    });
    valid.redirects = [
      { fromPath: "/old-contact/", toPath: "legacy-contact" },
      { fromPath: "legacy-contact", toPath: "contact" },
    ];
    expect(validateSitePackage(valid).ok).toBe(true);
  });

  it("accepts secondary-locale pages and the news index as real targets", () => {
    const site = createStarterSite();
    site.site.languages = ["en", "sv"];
    site.pages.push({
      tmpId: "contact",
      slug: "contact",
      title: "Contact",
      order: 1,
      showInNav: true,
    });
    site.redirects = [
      { fromPath: "old-swedish-contact", toPath: "sv/contact" },
      { fromPath: "old-news", toPath: "news" },
    ];
    expect(validateSitePackage(site).issues.filter((issue) => issue.level === "error")).toEqual([]);
  });

  it.each([
    [[{ fromPath: "", toPath: "contact" }], "redirects[0].fromPath"],
    [[{ fromPath: "old", toPath: "old" }], "redirects[0].toPath"],
    [[{ fromPath: "news", toPath: "" }], "redirects[0].fromPath"],
    [[{ fromPath: "en/old", toPath: "" }], "redirects[0].fromPath"],
    [[{ fromPath: "old", toPath: "missing" }], "redirects[0].toPath"],
    [[{ fromPath: "/old/", toPath: "" }, { fromPath: "OLD", toPath: "" }], "redirects[1].fromPath"],
    [[{ fromPath: "a", toPath: "b" }, { fromPath: "b", toPath: "a" }], "redirects[0].toPath"],
  ])("reports invalid redirects at their JSON path", (redirects, path) => {
    const site = createStarterSite();
    site.redirects = redirects;
    const report = validateSitePackage(site);
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.path === path)).toBe(true);
  });

  it("rejects a redirect source that shadows a live page", () => {
    const site = createStarterSite();
    site.pages.push({
      tmpId: "contact",
      slug: "contact",
      title: "Contact",
      order: 1,
      showInNav: true,
    });
    site.redirects = [{ fromPath: "contact", toPath: "" }];

    expect(validateSitePackage(site).issues).toContainEqual({
      level: "error",
      path: "redirects[0].fromPath",
      message: "REDIRECT_FROM_IS_PAGE",
    });
  });

  it("enforces the shared 500 redirect cap", () => {
    const site = createStarterSite();
    site.redirects = Array.from({ length: 501 }, (_, index) => ({
      fromPath: `old-${index}`,
      toPath: "",
    }));
    expect(validateSitePackage(site).issues).toContainEqual({
      level: "error",
      path: "redirects",
      message: expect.stringContaining("too_many_redirects"),
    });
  });

  it("carries self-hosted video when the clip is declared in the bundle", () => {
    const site = createStarterSite();
    site.assets.push({
      exportId: "clip",
      url: "bundle://clip",
      width: 1920,
      height: 1080,
      mimeType: "video/mp4",
      kind: "video",
      alt: "Background clip",
    });
    site.sections[0].content = {
      type: "hero",
      headline: "Video hero",
      bgVideo: { assetId: "clip", alt: "Background clip" },
    };
    expect(validateSitePackage(site)).toMatchObject({ ok: true });
  });

  it("rejects a video reference the bundle never declares", () => {
    const site = createStarterSite();
    site.sections[0].content = {
      type: "hero",
      headline: "Video hero",
      bgVideo: { assetId: "clip", alt: "Background clip" },
    };
    const report = validateSitePackage(site);
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.message.includes("unknown asset"))).toBe(true);
  });

  it('rejects provider "upload" without the clip', () => {
    const site = createStarterSite();
    site.sections[0].type = "video";
    site.sections[0].variant = "wide";
    site.sections[0].content = { type: "video", provider: "upload" };
    const report = validateSitePackage(site);
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.message.includes("requires a video assetRef"))).toBe(true);
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
