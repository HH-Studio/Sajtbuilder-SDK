import { defineSite } from "@snabbsajt/site-kit";

// Clinic / dental / health — calm ocean palette, classic serif+sans, trust-first.
export const clinic = defineSite({
  format: "sajt-site",
  version: 1,
  exportedAt: "2026-01-01T00:00:00.000Z",
  site: {
    businessName: "Vik Tandvård",
    vertical: "dentist",
    goal: "get_bookings",
    language: "en",
    theme: { palette: "ocean", fontPair: "classic", density: "comfortable", radius: "soft", buttonStyle: "solid", appearance: "light" },
    contact: { email: "info@viktandvard.example", phone: "+46 31 12 34 56" },
  },
  folders: [],
  pages: [
    { tmpId: "home", slug: "", title: "Home", order: 0, showInNav: true },
    { tmpId: "contact", slug: "contact", title: "Book", order: 1, showInNav: true },
  ],
  sections: [
    { pageTmpId: "home", type: "hero", variant: "minimal", order: "a0", content: { type: "hero", headline: "Gentle, modern dental care", subheadline: "A calm clinic where you are seen on time and treated with care. New patients welcome.", primaryCta: { label: "Book an appointment", target: { kind: "page", pageSlug: "contact" } } } },
    { pageTmpId: "home", type: "services", variant: "grid-3", order: "a1", content: { type: "services", heading: "Treatments", items: [ { title: "Check-ups", description: "Routine exams and cleaning." }, { title: "Whitening", description: "Safe, professional whitening." }, { title: "Implants", description: "Long-lasting tooth replacement." } ] } },
    { pageTmpId: "home", type: "team", variant: "cards", order: "a2", content: { type: "team", heading: "Your dentists", members: [ { name: "Dr. Lena Vik", role: "Lead dentist" }, { name: "Dr. Omar Haddad", role: "Implants" }, { name: "Sofia B.", role: "Hygienist" } ] } },
    { pageTmpId: "home", type: "testimonials", variant: "cards", order: "a3", content: { type: "testimonials", heading: "Patients feel at ease", quotes: [ { text: "I used to dread the dentist. Not here — calm and painless.", author: "Petra L.", rating: 5 }, { text: "On time, clearly explained, no upselling.", author: "Nils G.", rating: 5 } ] } },
    { pageTmpId: "home", type: "cta-band", variant: "centered", order: "a4", content: { type: "cta-band", headline: "Book your first visit", primaryCta: { label: "Find a time", target: { kind: "page", pageSlug: "contact" } } } },
    { pageTmpId: "home", type: "footer", variant: "columns", order: "a5", content: { type: "footer", businessName: "Vik Tandvård" } },
    {
      pageTmpId: "contact", type: "contact", variant: "form-info", order: "a0", anchorId: "contact",
      content: {
        type: "contact", heading: "Request an appointment",
        fields: [
          { key: "name", label: "Name", type: "text", required: true },
          { key: "email", label: "Email", type: "email", required: true },
          { key: "message", label: "Reason for visit", type: "textarea", required: true },
        ],
        submitLabel: "Request", successMessage: "Thanks! Reception will confirm your appointment.", infoItems: [],
      },
    },
    { pageTmpId: "contact", type: "footer", variant: "columns", order: "a1", content: { type: "footer", businessName: "Vik Tandvård" } },
  ],
  fonts: [],
  assets: [],
});
