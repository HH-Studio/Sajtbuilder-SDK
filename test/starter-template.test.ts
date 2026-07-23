import { describe, expect, it } from "vitest";
import { packSitePackage, validateSitePackage } from "../src/index";
import { site } from "../templates/starter-smb/src/site";

// The starter template's site.ts is a living conformance fixture: if the
// portable format, section schemas, or theme tokens drift, this fails loudly.
describe("starter-smb template", () => {
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

  it("uses the expected page set", () => {
    expect(site.pages.map((p) => p.slug)).toEqual(["", "services", "about", "contact"]);
  });
});
