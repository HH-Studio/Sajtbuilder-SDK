import { defineSection, defineSite, createStarterSite } from "../src/index";

defineSection({
  pageTmpId: "home",
  type: "hero",
  variant: "minimal",
  order: "a0",
  content: { type: "hero", headline: "Valid" },
});

defineSection({
  pageTmpId: "home",
  type: "hero",
  variant: "minimal",
  order: "a1",
  content: {
    type: "hero",
    headline: "Portable asset reference",
    media: { assetId: "hero-office", alt: "Office" },
  },
});

defineSection({
  pageTmpId: "home",
  type: "services",
  variant: "grid-3",
  order: "a2",
  content: {
    type: "services",
    heading: "Services",
    items: [{ title: "Design", description: "A service", serviceId: "service-design" }],
    source: { kind: "table", serviceIds: ["service-design"] },
  },
});

defineSection({
  pageTmpId: "home",
  type: "hero",
  variant: "minimal",
  order: "a0",
  // @ts-expect-error outer hero sections cannot carry footer content
  content: { type: "footer", businessName: "Mismatch" },
});

defineSection({
  pageTmpId: "home",
  type: "hero",
  variant: "minimal",
  order: "a0",
  // @ts-expect-error unknown hero fields are rejected for object literals
  content: { type: "hero", headline: "Invalid", invented: true },
});

defineSite({
  ...createStarterSite(),
  // @ts-expect-error unknown top-level fields are rejected for object literals
  invented: true,
});
