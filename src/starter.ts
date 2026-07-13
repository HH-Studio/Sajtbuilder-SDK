import { DEFAULT_THEME } from "./convex/model/theme";
import type { PortableSiteV1 } from "./convex/model/portable";

export type StarterTemplate = "nextjs" | "html";

export function createStarterSite(template: StarterTemplate = "nextjs"): PortableSiteV1 {
  const sourceLabel = template === "html" ? "HTML site" : "Next.js site";
  return {
    format: "sajt-site",
    version: 1,
    exportedAt: new Date().toISOString(),
    site: {
      businessName: "Example Studio",
      vertical: "consultant",
      goal: "show_services",
      language: "en",
      theme: { ...DEFAULT_THEME },
      contact: { email: "hello@example.com" },
    },
    folders: [],
    pages: [
      { tmpId: "home", slug: "", title: "Home", order: 0, showInNav: true },
    ],
    sections: [
      {
        pageTmpId: "home",
        type: "hero",
        variant: "image-right",
        order: "a0",
        content: {
          type: "hero",
          headline: "Built outside SnabbSajt. Editable inside it.",
          subheadline: `Replace this starter content with the real content from your ${sourceLabel}.`,
          primaryCta: {
            label: "Contact us",
            target: { kind: "anchor", anchorId: "contact" },
          },
        },
      },
      {
        pageTmpId: "home",
        type: "contact",
        variant: "form-info",
        order: "a1",
        anchorId: "contact",
        content: {
          type: "contact",
          heading: "Contact us",
          fields: [
            { key: "name", label: "Name", type: "text", required: true },
            { key: "email", label: "Email", type: "email", required: true },
            { key: "message", label: "Message", type: "textarea", required: true },
          ],
          submitLabel: "Send",
          successMessage: "Thanks. We will get back to you soon.",
        },
      },
      {
        pageTmpId: "home",
        type: "footer",
        variant: "columns",
        order: "a2",
        content: { type: "footer", businessName: "Example Studio" },
      },
    ],
    fonts: [],
    assets: [],
  };
}
