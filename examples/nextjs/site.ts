import { DEFAULT_THEME, defineSite } from "../../src/index";

export const site = defineSite({
  format: "sajt-site",
  version: 1,
  exportedAt: new Date().toISOString(),
  site: {
    businessName: "North Studio",
    vertical: "consultant",
    goal: "show_services",
    language: "en",
    theme: DEFAULT_THEME,
    contact: { email: "hello@example.com" },
  },
  folders: [],
  pages: [{ tmpId: "home", slug: "", title: "Home", order: 0, showInNav: true }],
  sections: [
    {
      pageTmpId: "home",
      type: "hero",
      variant: "minimal",
      order: "a0",
      content: { type: "hero", headline: "Strategy that becomes shipped work" },
    },
    {
      pageTmpId: "home",
      type: "footer",
      variant: "centered",
      order: "a1",
      content: { type: "footer", businessName: "North Studio" },
    },
  ],
  fonts: [],
  assets: [],
});
