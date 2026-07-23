import { describe, expect, it } from "vitest";
import { packSitePackage, validateSitePackage } from "../src/index";
import { PRESETS, PRESET_KEYS } from "../templates/starter-smb/src/presets";

// The starter template's presets are living conformance fixtures: if the
// portable format, section schemas, or theme tokens drift, this fails loudly.
describe("starter-smb presets", () => {
  it("ships the expected preset set", () => {
    expect(PRESET_KEYS).toEqual(["consultant", "salon", "cleaning", "clinic", "restaurant", "fitness"]);
  });

  for (const key of PRESET_KEYS) {
    describe(key, () => {
      const site = PRESETS[key];

      it("is a valid SnabbSajt site package", () => {
        const report = validateSitePackage(site);
        const errors = report.issues.filter((i) => i.level === "error");
        expect(errors).toEqual([]);
        expect(report.ok).toBe(true);
      });

      it("packs into an importable bundle", async () => {
        const packed = await packSitePackage({ site, assetFiles: {}, exportedAt: site.exportedAt });
        expect(packed.zip.byteLength).toBeGreaterThan(0);
        expect(packed.missing).toEqual([]);
      });

      it("has a home page at slug \"\"", () => {
        expect(site.pages.some((p) => p.slug === "")).toBe(true);
      });
    });
  }
});
