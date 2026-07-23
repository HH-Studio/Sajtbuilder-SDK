import { defineSite } from "@snabbsajt/site-kit";

// Salon / beauty — warm rose palette, rounded friendly type, booking-first.
export const salon = defineSite({
  format: "sajt-site",
  version: 1,
  exportedAt: "2026-01-01T00:00:00.000Z",
  site: {
    businessName: "Rosa Hår & Skönhet",
    vertical: "salon",
    goal: "get_bookings",
    language: "en",
    theme: { palette: "rose", fontPair: "friendly", density: "comfortable", radius: "round", buttonStyle: "pill", appearance: "light" },
    contact: { email: "hej@rosa.example", phone: "+46 8 123 45 67" },
  },
  folders: [],
  pages: [
    { tmpId: "home", slug: "", title: "Home", order: 0, showInNav: true },
    { tmpId: "contact", slug: "contact", title: "Book", order: 1, showInNav: true },
  ],
  sections: [
    { pageTmpId: "home", type: "hero", variant: "centered", order: "a0", content: { type: "hero", headline: "Look good, feel better", subheadline: "A calm salon in the heart of town. Cuts, colour, and care by people who love it.", primaryCta: { label: "Book a time", target: { kind: "page", pageSlug: "contact" } } } },
    { pageTmpId: "home", type: "services", variant: "icon-grid", order: "a1", content: { type: "services", heading: "Treatments", items: [ { title: "Cut & style", description: "A fresh cut and finish for any hair type." }, { title: "Colour", description: "Balayage, highlights, and full colour." }, { title: "Care", description: "Treatments that keep hair healthy." } ] } },
    { pageTmpId: "home", type: "pricing", variant: "simple-list", order: "a2", content: { type: "pricing", heading: "Prices", currency: "kr", tiers: [ { name: "Cut", price: "From 450", features: ["Wash, cut & style"] }, { name: "Colour", price: "From 1 200", features: ["Consultation included"] }, { name: "Treatment", price: "From 350", features: ["Add to any visit"] } ] } },
    { pageTmpId: "home", type: "testimonials", variant: "single", order: "a3", content: { type: "testimonials", heading: "Loved by regulars", quotes: [ { text: "Best colour I've had in years. I won't go anywhere else.", author: "Elin S.", rating: 5 } ] } },
    { pageTmpId: "home", type: "cta-band", variant: "gradient", order: "a4", content: { type: "cta-band", headline: "Ready for a fresh look?", primaryCta: { label: "Book now", target: { kind: "page", pageSlug: "contact" } } } },
    { pageTmpId: "home", type: "footer", variant: "centered", order: "a5", content: { type: "footer", businessName: "Rosa Hår & Skönhet" } },
    {
      pageTmpId: "contact", type: "contact", variant: "form-info", order: "a0", anchorId: "contact",
      content: {
        type: "contact", heading: "Book a visit",
        fields: [
          { key: "name", label: "Name", type: "text", required: true },
          { key: "email", label: "Email", type: "email", required: true },
          { key: "message", label: "What would you like?", type: "textarea", required: true },
        ],
        submitLabel: "Request time", successMessage: "Thanks! We'll confirm your time shortly.", infoItems: [],
      },
    },
    { pageTmpId: "contact", type: "footer", variant: "centered", order: "a1", content: { type: "footer", businessName: "Rosa Hår & Skönhet" } },
  ],
  fonts: [],
  assets: [],
});
