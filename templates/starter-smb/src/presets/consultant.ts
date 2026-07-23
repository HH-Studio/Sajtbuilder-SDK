import { defineSite } from "@snabbsajt/site-kit";

// Consultant / agency — the flagship 4-page preset. Editorial serif on a deep
// navy palette reads considered and premium.
export const consultant = defineSite({
  format: "sajt-site",
  version: 1,
  exportedAt: "2026-01-01T00:00:00.000Z",
  site: {
    businessName: "Northwind Studio",
    vertical: "consultant",
    goal: "show_services",
    language: "en",
    theme: { palette: "midnight", fontPair: "editorial", density: "comfortable", radius: "soft", buttonStyle: "solid", appearance: "light" },
    contact: { email: "hello@northwind.example", phone: "+46 70 123 45 67" },
  },
  folders: [],
  pages: [
    { tmpId: "home", slug: "", title: "Home", order: 0, showInNav: true },
    { tmpId: "services", slug: "services", title: "Services", order: 1, showInNav: true },
    { tmpId: "about", slug: "about", title: "About", order: 2, showInNav: true },
    { tmpId: "contact", slug: "contact", title: "Contact", order: 3, showInNav: true },
  ],
  sections: [
    {
      pageTmpId: "home", type: "hero", variant: "split", order: "a0",
      content: {
        type: "hero",
        headline: "Strategy that becomes shipped work",
        subheadline: "We help small teams turn a good idea into a website, a brand, and a plan people actually act on.",
        primaryCta: { label: "Start a project", target: { kind: "page", pageSlug: "contact" } },
        secondaryCta: { label: "See our work", target: { kind: "page", pageSlug: "services" } },
      },
    },
    {
      pageTmpId: "home", type: "services", variant: "grid-3", order: "a1",
      content: {
        type: "services", heading: "What we do",
        items: [
          { title: "Brand & identity", description: "A name, a look, and a voice that fit who you are." },
          { title: "Website design", description: "A fast, clear site that turns visitors into enquiries." },
          { title: "Launch strategy", description: "A simple plan for the first 90 days after you go live." },
        ],
      },
    },
    {
      pageTmpId: "home", type: "testimonials", variant: "cards", order: "a2",
      content: {
        type: "testimonials", heading: "What clients say",
        quotes: [
          { text: "They made the hard decisions simple. We launched in three weeks.", author: "Mara L., founder", rating: 5 },
          { text: "The clearest brief we have ever been given. Worth every krona.", author: "Jonas P., director", rating: 5 },
        ],
      },
    },
    {
      pageTmpId: "home", type: "cta-band", variant: "centered", order: "a3",
      content: { type: "cta-band", headline: "Have a project in mind?", primaryCta: { label: "Get in touch", target: { kind: "page", pageSlug: "contact" } } },
    },
    { pageTmpId: "home", type: "footer", variant: "columns", order: "a4", content: { type: "footer", businessName: "Northwind Studio" } },

    {
      pageTmpId: "services", type: "services", variant: "list", order: "a0",
      content: {
        type: "services", heading: "Services",
        items: [
          { title: "Brand & identity", description: "Positioning, naming, logo, and a usable style guide." },
          { title: "Website design & build", description: "Design, copy, and a site your team can update." },
          { title: "Launch strategy", description: "Channels, messaging, and a 90-day plan." },
          { title: "Ongoing support", description: "A monthly retainer for changes and advice." },
        ],
      },
    },
    {
      pageTmpId: "services", type: "pricing", variant: "tiers-3", order: "a1",
      content: {
        type: "pricing", heading: "Simple pricing", currency: "kr",
        tiers: [
          { name: "Starter", price: "From 12 000", features: ["One-page site", "Brand basics", "Two revisions"] },
          { name: "Studio", price: "From 28 000", features: ["Up to 5 pages", "Full brand kit", "Launch plan"] },
          { name: "Partner", price: "From 6 000/mo", features: ["Everything in Studio", "Monthly support", "Priority turnaround"] },
        ],
      },
    },
    {
      pageTmpId: "services", type: "faq", variant: "accordion", order: "a2",
      content: {
        type: "faq", heading: "Frequently asked questions",
        items: [
          { question: "How long does a project take?", answer: "Most sites go live in three to five weeks." },
          { question: "Do you write the copy?", answer: "Yes. Clear words are part of the design." },
          { question: "Can we edit the site ourselves?", answer: "Yes. You get an editor built for non-technical teams." },
        ],
      },
    },
    { pageTmpId: "services", type: "footer", variant: "columns", order: "a3", content: { type: "footer", businessName: "Northwind Studio" } },

    {
      pageTmpId: "about", type: "about", variant: "wide", order: "a0",
      content: { type: "about", heading: "About Northwind", body: "We are a small studio in Stockholm. We work with founders and small teams who want work that looks considered and reads clearly. No jargon, no bloat, just the useful parts done well." },
    },
    {
      pageTmpId: "about", type: "team", variant: "grid", order: "a1",
      content: { type: "team", heading: "The team", members: [ { name: "Alex Nord", role: "Design" }, { name: "Sam Berg", role: "Strategy" }, { name: "Robin Ek", role: "Build" } ] },
    },
    { pageTmpId: "about", type: "footer", variant: "columns", order: "a2", content: { type: "footer", businessName: "Northwind Studio" } },

    {
      pageTmpId: "contact", type: "contact", variant: "form-info", order: "a0", anchorId: "contact",
      content: {
        type: "contact", heading: "Contact us",
        fields: [
          { key: "name", label: "Name", type: "text", required: true },
          { key: "email", label: "Email", type: "email", required: true },
          { key: "message", label: "Message", type: "textarea", required: true },
        ],
        submitLabel: "Send", successMessage: "Thanks. We will get back to you soon.", infoItems: [],
      },
    },
    { pageTmpId: "contact", type: "footer", variant: "columns", order: "a1", content: { type: "footer", businessName: "Northwind Studio" } },
  ],
  fonts: [],
  assets: [],
});
