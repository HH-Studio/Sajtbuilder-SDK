import { describe, expect, it } from "vitest";
import { createStarterSite, validateSitePackage } from "../src/index";

// ---------------------------------------------------------------------------
// The capabilities the app importer has accepted for a while but that the
// published contract could not express. Each case is a package a developer
// would realistically hand-author; if the mirrored model drifts behind the app
// again, these fail before anyone ships a broken SDK release.
// ---------------------------------------------------------------------------

describe("portable capabilities", () => {
  it("carries a site's own brand colours and typefaces", () => {
    // A real brand: cream page, blue-grey ink, sage accent.
    const surface = {
      bg: "#fbfcf2",
      fg: "#3c6373",
      muted: "#f1f4e4",
      mutedFg: "#537582",
      primary: "#3c6373",
      primaryFg: "#fbfcf2",
      accent: "#9dbb9d",
      accentFg: "#24404c",
      border: "#cbd6d2",
      card: "#fdfef7",
      cardFg: "#3c6373",
      cardBorder: "#d8e0db",
    };
    const site = createStarterSite();
    site.site.theme = {
      ...site.site.theme,
      palette: "sand",
      fontPair: "editorial",
      customBrandHex: "#3c6373",
      customPalette: { light: surface, dark: { ...surface, bg: "#24404c", fg: "#fbfcf2" } },
      customFonts: { heading: "Newsreader", body: "Geist" },
      typeScale: "normal",
    };

    expect(validateSitePackage(site)).toMatchObject({ ok: true });
  });

  it("accepts sections without a hand-authored order key", () => {
    const site = createStarterSite();
    site.sections.forEach((section) => {
      delete section.order;
    });

    expect(validateSitePackage(site)).toMatchObject({ ok: true });
  });

  it("still rejects an order key that is present but malformed", () => {
    const site = createStarterSite();
    site.sections.forEach((section) => {
      section.order = "a000";
    });

    const report = validateSitePackage(site);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.message.includes("fractional order key"))).toBe(true);
  });

  it("carries stable keys so a second import can update instead of duplicate", () => {
    const site = createStarterSite();
    site.pages.forEach((page) => {
      page.externalKey = `page:${page.slug || "home"}`;
    });
    site.sections.forEach((section) => {
      section.externalKey = `${section.pageTmpId}/${section.type}`;
    });

    expect(validateSitePackage(site)).toMatchObject({ ok: true });
  });

  it("carries old-URL redirects", () => {
    const site = createStarterSite();
    site.redirects = [{ fromPath: "/gamla-sidan", toPath: "/" }];

    expect(validateSitePackage(site)).toMatchObject({ ok: true });
  });
});
