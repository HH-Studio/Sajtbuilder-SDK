import { defineSite } from "@snabbsajt/site-kit";

// Fitness / gym / coach — bold mono palette, grotesk type, membership-first.
export const fitness = defineSite({
  format: "sajt-site",
  version: 1,
  exportedAt: "2026-01-01T00:00:00.000Z",
  site: {
    businessName: "Grind Studio",
    vertical: "fitness",
    goal: "get_bookings",
    language: "en",
    theme: { palette: "mono", fontPair: "grotesk", density: "compact", radius: "sharp", buttonStyle: "solid", appearance: "dark" },
    contact: { email: "train@grind.example", phone: "+46 70 222 33 44" },
  },
  folders: [],
  pages: [
    { tmpId: "home", slug: "", title: "Home", order: 0, showInNav: true },
    { tmpId: "contact", slug: "contact", title: "Join", order: 1, showInNav: true },
  ],
  sections: [
    { pageTmpId: "home", type: "hero", variant: "gradient", order: "a0", content: { type: "hero", headline: "Train hard. Feel unstoppable.", subheadline: "Small-group strength and conditioning coached by people who actually care about your progress.", primaryCta: { label: "Start free trial", target: { kind: "page", pageSlug: "contact" } } } },
    { pageTmpId: "home", type: "services", variant: "numbered", order: "a1", content: { type: "services", heading: "How it works", items: [ { title: "Book a trial", description: "Your first session is on us." }, { title: "Get a plan", description: "A coach builds around your goals." }, { title: "Show up", description: "We keep you accountable." } ] } },
    { pageTmpId: "home", type: "pricing", variant: "tiers-3", order: "a2", content: { type: "pricing", heading: "Membership", currency: "kr", tiers: [ { name: "Drop-in", price: "199", features: ["One session", "No commitment"] }, { name: "Monthly", price: "899/mo", features: ["Unlimited classes", "Cancel anytime"] }, { name: "Coached", price: "1 690/mo", features: ["Everything monthly", "1:1 coaching", "Nutrition plan"] } ] } },
    { pageTmpId: "home", type: "testimonials", variant: "marquee", order: "a3", content: { type: "testimonials", heading: "Results that stick", quotes: [ { text: "Strongest I've ever been. The coaching makes it.", author: "Viktor A.", rating: 5 }, { text: "Actually looked forward to training. First time ever.", author: "Nadia K.", rating: 5 } ] } },
    { pageTmpId: "home", type: "cta-band", variant: "gradient", order: "a4", content: { type: "cta-band", headline: "Your first session is free", primaryCta: { label: "Claim trial", target: { kind: "page", pageSlug: "contact" } } } },
    { pageTmpId: "home", type: "footer", variant: "simple", order: "a5", content: { type: "footer", businessName: "Grind Studio" } },
    {
      pageTmpId: "contact", type: "contact", variant: "form-info", order: "a0", anchorId: "contact",
      content: {
        type: "contact", heading: "Claim your free trial",
        fields: [
          { key: "name", label: "Name", type: "text", required: true },
          { key: "email", label: "Email", type: "email", required: true },
          { key: "message", label: "Your goal", type: "textarea", required: false },
        ],
        submitLabel: "Book trial", successMessage: "Let's go! We'll be in touch to set your time.", infoItems: [],
      },
    },
    { pageTmpId: "contact", type: "footer", variant: "simple", order: "a1", content: { type: "footer", businessName: "Grind Studio" } },
  ],
  fonts: [],
  assets: [],
});
