import { defineSite } from "@snabbsajt/site-kit";

// Cleaning / outdoor services — fresh green palette, modern sans, call-first.
export const cleaning = defineSite({
  format: "sajt-site",
  version: 1,
  exportedAt: "2026-01-01T00:00:00.000Z",
  site: {
    businessName: "Klart & Rent",
    vertical: "cleaning",
    goal: "get_calls",
    language: "en",
    theme: { palette: "forest", fontPair: "modern", density: "comfortable", radius: "soft", buttonStyle: "solid", appearance: "light" },
    contact: { email: "hej@klartrent.example", phone: "+46 70 987 65 43" },
  },
  folders: [],
  pages: [
    { tmpId: "home", slug: "", title: "Home", order: 0, showInNav: true },
    { tmpId: "contact", slug: "contact", title: "Contact", order: 1, showInNav: true },
  ],
  sections: [
    { pageTmpId: "home", type: "hero", variant: "image-left", order: "a0", content: { type: "hero", headline: "A cleaner home, without the hassle", subheadline: "Reliable home and office cleaning across the city. Insured, vetted, and always on time.", primaryCta: { label: "Call for a quote", target: { kind: "phone", value: "+46709876543" } }, secondaryCta: { label: "Our services", target: { kind: "anchor", anchorId: "services" } } } },
    { pageTmpId: "home", type: "services", variant: "list", order: "a1", anchorId: "services", content: { type: "services", heading: "What we clean", items: [ { title: "Home cleaning", description: "Weekly, biweekly, or one-off." }, { title: "Move-out cleaning", description: "Deposit-back deep clean." }, { title: "Office cleaning", description: "Evenings and weekends available." }, { title: "Windows", description: "Streak-free, inside and out." } ] } },
    { pageTmpId: "home", type: "faq", variant: "two-column", order: "a2", content: { type: "faq", heading: "Good to know", items: [ { question: "Are you insured?", answer: "Yes, fully insured and background-checked." }, { question: "Do I need to be home?", answer: "No. Many clients leave a key or code." }, { question: "What products do you use?", answer: "Eco-friendly by default, on request otherwise." } ] } },
    { pageTmpId: "home", type: "testimonials", variant: "cards", order: "a3", content: { type: "testimonials", heading: "Trusted by neighbours", quotes: [ { text: "Spotless every time and lovely to deal with.", author: "Karin M.", rating: 5 }, { text: "Booked a move-out clean and got my full deposit back.", author: "Ahmed R.", rating: 5 } ] } },
    { pageTmpId: "home", type: "cta-band", variant: "boxed", order: "a4", content: { type: "cta-band", headline: "Get a free quote today", primaryCta: { label: "Call us", target: { kind: "phone", value: "+46709876543" } } } },
    { pageTmpId: "home", type: "footer", variant: "columns", order: "a5", content: { type: "footer", businessName: "Klart & Rent" } },
    {
      pageTmpId: "contact", type: "contact", variant: "form-info", order: "a0", anchorId: "contact",
      content: {
        type: "contact", heading: "Request a quote",
        fields: [
          { key: "name", label: "Name", type: "text", required: true },
          { key: "phone", label: "Phone", type: "phone", required: true },
          { key: "message", label: "What do you need cleaned?", type: "textarea", required: true },
        ],
        submitLabel: "Send request", successMessage: "Thanks! We'll call you back with a quote.", infoItems: [],
      },
    },
    { pageTmpId: "contact", type: "footer", variant: "columns", order: "a1", content: { type: "footer", businessName: "Klart & Rent" } },
  ],
  fonts: [],
  assets: [],
});
