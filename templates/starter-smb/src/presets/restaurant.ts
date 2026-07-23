import { defineSite } from "@snabbsajt/site-kit";

// Restaurant / café — warm amber palette, premium serif display, call-first.
export const restaurant = defineSite({
  format: "sajt-site",
  version: 1,
  exportedAt: "2026-01-01T00:00:00.000Z",
  site: {
    businessName: "Ekot Kök & Bar",
    vertical: "restaurant",
    goal: "get_calls",
    language: "en",
    theme: { palette: "amber", fontPair: "premium", density: "spacious", radius: "sharp", buttonStyle: "outline", appearance: "dark" },
    contact: { email: "bord@ekot.example", phone: "+46 8 55 66 77" },
  },
  folders: [],
  pages: [
    { tmpId: "home", slug: "", title: "Home", order: 0, showInNav: true },
    { tmpId: "contact", slug: "contact", title: "Visit", order: 1, showInNav: true },
  ],
  sections: [
    { pageTmpId: "home", type: "hero", variant: "overlay", order: "a0", content: { type: "hero", headline: "Seasonal plates, natural wine", subheadline: "A neighbourhood kitchen serving what's good right now. Walk-ins welcome, tables by phone.", primaryCta: { label: "Book a table", target: { kind: "phone", value: "+46855667" } } } },
    { pageTmpId: "home", type: "about", variant: "text-only", order: "a1", content: { type: "about", heading: "Our kitchen", body: "We cook with what the season gives us — a short menu that changes often, built around Nordic produce and an open fire. Simple, generous, unfussy." } },
    { pageTmpId: "home", type: "services", variant: "grid-2", order: "a2", content: { type: "services", heading: "On the menu", items: [ { title: "Small plates", description: "Made to share, from the fire and the garden." }, { title: "Natural wine", description: "A short, changing list of low-intervention bottles." } ] } },
    { pageTmpId: "home", type: "testimonials", variant: "single", order: "a3", content: { type: "testimonials", heading: "A local favourite", quotes: [ { text: "The best meal I've had all year. Book ahead.", author: "Restaurant guide", rating: 5 } ] } },
    { pageTmpId: "home", type: "cta-band", variant: "split", order: "a4", content: { type: "cta-band", headline: "Join us for dinner", primaryCta: { label: "Call to reserve", target: { kind: "phone", value: "+46855667" } } } },
    { pageTmpId: "home", type: "footer", variant: "centered", order: "a5", content: { type: "footer", businessName: "Ekot Kök & Bar" } },
    {
      pageTmpId: "contact", type: "contact", variant: "info-cards", order: "a0", anchorId: "contact",
      content: {
        type: "contact", heading: "Find us",
        fields: [
          { key: "name", label: "Name", type: "text", required: true },
          { key: "message", label: "Message", type: "textarea", required: true },
        ],
        submitLabel: "Send", successMessage: "Tack! We'll be in touch.", infoItems: [],
      },
    },
    { pageTmpId: "contact", type: "footer", variant: "centered", order: "a1", content: { type: "footer", businessName: "Ekot Kök & Bar" } },
  ],
  fonts: [],
  assets: [],
});
