import type { Locale } from "../i18n";
import type { SectionTone } from "./theme";
import type {
  SectionContent,
  SectionType,
} from "../../convex/model/sections";

// ---------------------------------------------------------------------------
// Section registry - the single source of truth for: plain-language labels,
// the allow-listed layout variants per type, the default tone, the add-section
// category, and a generic default-content factory (used by add-section and as
// a fallback by the generation engine). Variants here are validated server-side
// in convex/sections.ts so a tampered client can't store an unknown variant.
// ---------------------------------------------------------------------------

type L = { sv: string; en: string };

export type VariantDef = {
  key: string;
  label: L;
  /** One-line, plain-language description shown as a tooltip in the layout
   *  picker so a non-technical owner knows what this layout looks like
   *  before picking it. Optional - older variants don't have one. */
  description?: L;
};

export type SectionDef = {
  type: SectionType;
  label: L;
  /** One-line, plain-language "when to use this block" guidance. Shown under
   *  the label in the add-section picker, and the exact spec an LLM
   *  block-selector reads to choose blocks for a business. */
  whenToUse: L;
  /** add-section grouping */
  category:
    | "intro"
    | "services"
    | "trust"
    | "content"
    | "contact"
    | "structure";
  icon: string; // section icon name (Tabler-backed, see lib/sections/sectionIcon.tsx)
  variants: VariantDef[];
  defaultVariant: string;
  defaultTone: SectionTone;
  /** tones offered in the editor for this type */
  allowedTones: SectionTone[];
  defaultContent: (lang: Locale) => SectionContent;
  /** Optional capability gate - the add-section picker hides this block unless
   *  the website has the capability active (e.g. commerce "sell"). */
  requiresCapability?: "sell";
};

const pick = (lang: Locale, sv: string, en: string, pl: string) =>
  lang === "pl" ? pl : lang === "sv" ? sv : en;

export const SECTION_REGISTRY: Record<SectionType, SectionDef> = {
  hero: {
    type: "hero",
    label: { sv: "Introduktion", en: "Introduction" },
    whenToUse: {
      sv: "Längst upp på sidan – det första besökaren ser. Använd en gång per sida för att säga vilka ni är och vad besökaren ska göra.",
      en: "Top of the page – the first thing visitors see. Use once per page to say who you are and the main action to take.",
    },
    category: "intro",
    icon: "PanelTop",
    variants: [
      { key: "image-right", label: { sv: "Bild höger", en: "Image right" } },
      { key: "image-left", label: { sv: "Bild vänster", en: "Image left" } },
      { key: "centered", label: { sv: "Centrerad", en: "Centered" } },
      { key: "split", label: { sv: "Delad", en: "Split" } },
      { key: "minimal", label: { sv: "Enkel", en: "Minimal" } },
      { key: "overlay", label: { sv: "Bild bakom", en: "Image behind" } },
      { key: "gradient", label: { sv: "Färgtoning", en: "Gradient" } },
    ],
    defaultVariant: "image-right",
    defaultTone: "light",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "hero",
      headline: pick(
        lang,
        "Välkommen till vårt företag",
        "Welcome to our business",
        "Witamy w naszej firmie",
      ),
      subheadline: pick(
        lang,
        "Vi hjälper dig med det du behöver – enkelt och tryggt.",
        "We help you with what you need – simple and reliable.",
        "Pomożemy Ci w tym, czego potrzebujesz – prosto i bezpiecznie.",
      ),
      primaryCta: {
        label: pick(lang, "Kontakta oss", "Contact us", "Skontaktuj się z nami"),
        target: { kind: "anchor", anchorId: "kontakt" },
      },
    }),
  },

  services: {
    type: "services",
    label: { sv: "Tjänster", en: "Services" },
    whenToUse: {
      sv: "Visa vad ni erbjuder som 2–6 kort. Använd på startsidan så besökaren direkt ser vad ni gör.",
      en: "List what you offer as 2–6 cards. Use on the home page so visitors instantly see what you do.",
    },
    category: "services",
    icon: "LayoutGrid",
    variants: [
      { key: "grid-3", label: { sv: "Tre kort", en: "Three cards" } },
      { key: "grid-2", label: { sv: "Två kort", en: "Two cards" } },
      { key: "list", label: { sv: "Lista", en: "List" } },
      {
        key: "split",
        label: { sv: "Delad", en: "Split" },
        description: {
          sv: "Rubrik till vänster, tjänsterna som avdelad lista till höger.",
          en: "Heading on the left, services as a divided list on the right.",
        },
      },
      { key: "icon-grid", label: { sv: "Ikonrutnät", en: "Icon grid" } },
      { key: "numbered", label: { sv: "Numrerad", en: "Numbered" } },
      {
        key: "icon-grid-cta",
        label: { sv: "Ikonrutnät med knapp", en: "Icon grid with button" },
        description: {
          sv: "Ikonrutnätet plus en rad med uppmaningsknappar under.",
          en: "The icon grid plus a call-to-action button row underneath.",
        },
      },
    ],
    defaultVariant: "grid-3",
    defaultTone: "light",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "services",
      heading: pick(lang, "Våra tjänster", "Our services", "Nasze usługi"),
      items: [1, 2, 3].map((i) => ({
        title: pick(lang, `Tjänst ${i}`, `Service ${i}`, `Usługa ${i}`),
        description: pick(
          lang,
          "Kort beskrivning av vad ni erbjuder.",
          "A short description of what you offer.",
          "Krótki opis tego, co oferujesz.",
        ),
      })),
    }),
  },

  "service-detail": {
    type: "service-detail",
    label: { sv: "Tjänst i detalj", en: "Service detail" },
    whenToUse: {
      sv: "Förklara en enskild tjänst på djupet med punkter och bild. Använd på en egen tjänstesida.",
      en: "Explain one service in depth with bullet points and an image. Use on a dedicated service page.",
    },
    category: "services",
    icon: "FileText",
    variants: [
      { key: "media-right", label: { sv: "Bild höger", en: "Image right" } },
      { key: "media-left", label: { sv: "Bild vänster", en: "Image left" } },
      { key: "stacked", label: { sv: "Staplad", en: "Stacked" } },
    ],
    defaultVariant: "media-right",
    defaultTone: "light",
    allowedTones: ["light", "clear"],
    defaultContent: (lang) => ({
      type: "service-detail",
      title: pick(lang, "Om tjänsten", "About this service", "O tej usłudze"),
      body: pick(
        lang,
        "Beskriv tjänsten lite mer utförligt här.",
        "Describe this service in a bit more detail here.",
        "Opisz tę usługę nieco bardziej szczegółowo.",
      ),
      bullets: [
        pick(lang, "Fördel ett", "Benefit one", "Zaleta pierwsza"),
        pick(lang, "Fördel två", "Benefit two", "Zaleta druga"),
      ],
    }),
  },

  about: {
    type: "about",
    label: { sv: "Om oss", en: "About" },
    whenToUse: {
      sv: "Berätta er historia och skapa förtroende. Använd när besökaren vill veta vilka som står bakom företaget.",
      en: "Tell your story and build trust. Use when visitors want to know who is behind the business.",
    },
    category: "trust",
    icon: "Users",
    variants: [
      { key: "text-image", label: { sv: "Text och bild", en: "Text & image" } },
      { key: "text-only", label: { sv: "Bara text", en: "Text only" } },
      { key: "image-left", label: { sv: "Bild vänster", en: "Image left" } },
      {
        key: "wide",
        label: { sv: "Bred", en: "Wide" },
        description: {
          sv: "Ett bredare textblock utan bild vid sidan – redaktionell känsla.",
          en: "A wider, editorial-style text block – no side image.",
        },
      },
    ],
    defaultVariant: "text-image",
    defaultTone: "clear",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "about",
      heading: pick(lang, "Om oss", "About us", "O nas"),
      body: pick(
        lang,
        "Berätta kort om ert företag och vad som gör er speciella.",
        "Tell visitors a little about your business and what makes you special.",
        "Opowiedz krótko o swojej firmie i o tym, co ją wyróżnia.",
      ),
    }),
  },

  team: {
    type: "team",
    label: { sv: "Medarbetare", en: "Team" },
    whenToUse: {
      sv: "Visa personerna bakom företaget med foton. Använd när personligt förtroende är viktigt (kliniker, salonger, byråer).",
      en: "Show the people behind the business with photos. Use when personal trust matters (clinics, salons, agencies).",
    },
    category: "trust",
    icon: "UserRound",
    variants: [
      { key: "grid", label: { sv: "Rutnät", en: "Grid" } },
      { key: "list", label: { sv: "Lista", en: "List" } },
      { key: "cards", label: { sv: "Kort", en: "Cards" } },
      {
        key: "grid-cta",
        label: { sv: "Rutnät med rekrytering", en: "Grid with hiring CTA" },
        description: {
          sv: 'Teamrutnätet plus en "vi anställer"-banner längst ner.',
          en: 'The team grid plus a "We\'re hiring" banner at the end.',
        },
      },
    ],
    defaultVariant: "grid",
    defaultTone: "light",
    allowedTones: ["light", "clear"],
    defaultContent: (lang) => ({
      type: "team",
      heading: pick(lang, "Vårt team", "Our team", "Nasz zespół"),
      members: [1, 2, 3].map((i) => ({
        name: pick(lang, `Namn ${i}`, `Name ${i}`, `Imię ${i}`),
        role: pick(lang, "Roll", "Role", "Stanowisko"),
      })),
    }),
  },

  testimonials: {
    type: "testimonials",
    label: { sv: "Recensioner", en: "Reviews" },
    whenToUse: {
      sv: "Visa vad kunder säger. Använd för att bygga förtroende innan du ber besökaren kontakta eller boka.",
      en: "Show customer reviews. Use to build trust before asking visitors to contact or book.",
    },
    category: "trust",
    icon: "Quote",
    variants: [
      { key: "cards", label: { sv: "Kort", en: "Cards" } },
      { key: "single", label: { sv: "Ett citat", en: "Single quote" } },
      { key: "marquee", label: { sv: "Löpande band", en: "Marquee" } },
      {
        key: "logos-quote",
        label: { sv: "Citat med logotyp", en: "Quote with logo" },
        description: {
          sv: "Varje citat visas ihop med kundens företagslogotyp istället för ett foto.",
          en: "Pairs each quote with the customer’s company logo instead of a headshot.",
        },
      },
    ],
    defaultVariant: "cards",
    defaultTone: "clear",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "testimonials",
      heading: pick(lang, "Vad kunderna säger", "What customers say", "Co mówią klienci"),
      quotes: [1, 2].map((i) => ({
        text: pick(
          lang,
          "Riktigt nöjd med jobbet – rekommenderas varmt!",
          "Really happy with the work – highly recommended!",
          "Bardzo zadowolony z pracy – gorąco polecam!",
        ),
        author: pick(lang, `Kund ${i}`, `Customer ${i}`, `Klient ${i}`),
        rating: 5,
      })),
    }),
  },

  gallery: {
    type: "gallery",
    label: { sv: "Bildgalleri", en: "Gallery" },
    whenToUse: {
      sv: "Visa foton på ert arbete eller er lokal. Använd för visuella verksamheter (restauranger, salonger, hantverkare).",
      en: "Show photos of your work or space. Use for visual businesses (restaurants, salons, builders).",
    },
    category: "content",
    icon: "Images",
    variants: [
      { key: "grid-3", label: { sv: "Tre i bredd", en: "Three wide" } },
      { key: "grid-4", label: { sv: "Fyra i bredd", en: "Four wide" } },
      { key: "masonry", label: { sv: "Tegel", en: "Masonry" } },
      { key: "carousel", label: { sv: "Karusell", en: "Carousel" } },
      {
        key: "full-bleed",
        label: { sv: "Kant till kant", en: "Full bleed" },
        description: {
          sv: "Bilderna går kant till kant utan marginal – ett djärvt, galleriliknande utseende.",
          en: "Photos run edge-to-edge with no side padding – a bold, gallery-style look.",
        },
      },
    ],
    defaultVariant: "grid-3",
    defaultTone: "light",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "gallery",
      heading: pick(lang, "Galleri", "Gallery", "Galeria"),
      images: [],
    }),
  },

  "before-after": {
    type: "before-after",
    label: { sv: "Före och efter", en: "Before & after" },
    whenToUse: {
      sv: "Jämför resultat sida vid sida. Använd när arbetet har en tydlig visuell förändring (städ, renovering, tandvård).",
      en: "Compare results side by side. Use when your work has a clear visual transformation (cleaning, renovation, dental).",
    },
    category: "content",
    icon: "GitCompareArrows",
    variants: [
      { key: "side-by-side", label: { sv: "Sida vid sida", en: "Side by side" } },
      { key: "stacked", label: { sv: "Staplad", en: "Stacked" } },
      {
        key: "wide",
        label: { sv: "Bred", en: "Wide" },
        description: {
          sv: "Varje före- och efterpar får hela radens bredd för tydligare resultat.",
          en: "Each before-and-after pair uses the full row for a clearer result.",
        },
      },
    ],
    defaultVariant: "side-by-side",
    defaultTone: "light",
    allowedTones: ["light", "clear"],
    defaultContent: (lang) => ({
      type: "before-after",
      heading: pick(lang, "Före och efter", "Before & after", "Przed i po"),
      pairs: [],
    }),
  },

  pricing: {
    type: "pricing",
    label: { sv: "Priser", en: "Pricing" },
    whenToUse: {
      sv: "Visa priser eller paket. Använd när tydliga priser hjälper besökaren att bestämma sig (gym, salonger, tjänster).",
      en: "Show prices or packages. Use when clear pricing helps visitors decide (gyms, salons, service businesses).",
    },
    category: "services",
    icon: "Tag",
    variants: [
      { key: "tiers-3", label: { sv: "Tre nivåer", en: "Three tiers" } },
      { key: "simple-list", label: { sv: "Prislista", en: "Price list" } },
      { key: "two-col", label: { sv: "Två nivåer", en: "Two tiers" } },
      {
        key: "single",
        label: { sv: "Ett paket", en: "Single plan" },
        description: {
          sv: "Ett paket visas stort och centrerat – för företag med ett fast pris.",
          en: "One plan shown large and centered – for businesses with one flat price.",
        },
      },
    ],
    defaultVariant: "tiers-3",
    defaultTone: "clear",
    allowedTones: ["light", "clear"],
    defaultContent: (lang) => ({
      type: "pricing",
      heading: pick(lang, "Priser", "Pricing", "Cennik"),
      currency: pick(lang, "kr", "$", "zł"),
      tiers: [
        {
          name: pick(lang, "Bas", "Basic", "Podstawowy"),
          price: pick(lang, "Från 500", "From 500", "Od 500"),
          features: [pick(lang, "Vad som ingår", "What’s included", "Co jest w cenie")],
        },
      ],
    }),
  },

  faq: {
    type: "faq",
    label: { sv: "Vanliga frågor", en: "FAQ" },
    whenToUse: {
      sv: "Svara på vanliga frågor. Använd för att ta bort tveksamheter och minska upprepade samtal och mejl.",
      en: "Answer common questions. Use to remove doubts and cut down on repetitive calls and emails.",
    },
    category: "content",
    icon: "MessageCircleQuestion",
    variants: [
      { key: "accordion", label: { sv: "Hopfällbar", en: "Accordion" } },
      { key: "two-column", label: { sv: "Två kolumner", en: "Two columns" } },
      { key: "cards", label: { sv: "Kort", en: "Cards" } },
      {
        key: "accordion-cta",
        label: { sv: "Hopfällbar med fråga", en: "Accordion with CTA" },
        description: {
          sv: 'Hopfällbara frågor plus en uppmaning "Har du fler frågor?" med knapp längst ner.',
          en: 'The accordion plus a "Still have questions?" prompt with a button at the end.',
        },
      },
    ],
    defaultVariant: "accordion",
    defaultTone: "light",
    allowedTones: ["light", "clear"],
    defaultContent: (lang) => ({
      type: "faq",
      heading: pick(
        lang,
        "Vanliga frågor",
        "Frequently asked questions",
        "Często zadawane pytania",
      ),
      items: [
        {
          question: pick(lang, "En vanlig fråga?", "A common question?", "Częste pytanie?"),
          answer: pick(lang, "Ett tydligt svar.", "A clear answer.", "Jasna odpowiedź."),
        },
      ],
    }),
  },

  process: {
    type: "process",
    label: { sv: "Så går det till", en: "How it works" },
    whenToUse: {
      sv: "Visa hur det går till att jobba med er, steg för steg. Använd för att få nya kunder att känna sig trygga.",
      en: "Show how working with you works, step by step. Use to make first-time customers feel safe.",
    },
    category: "content",
    icon: "ListOrdered",
    variants: [
      { key: "steps-horizontal", label: { sv: "Steg i rad", en: "Steps in a row" } },
      { key: "steps-vertical", label: { sv: "Steg under varandra", en: "Vertical steps" } },
      { key: "timeline", label: { sv: "Tidslinje", en: "Timeline" } },
      {
        key: "numbered-cards",
        label: { sv: "Numrerade kort", en: "Numbered cards" },
        description: {
          sv: "Varje steg får ett eget kort med en stor stegsiffra.",
          en: "Each step gets its own card with a large step number.",
        },
      },
    ],
    defaultVariant: "steps-horizontal",
    defaultTone: "clear",
    allowedTones: ["light", "clear"],
    defaultContent: (lang) => ({
      type: "process",
      heading: pick(lang, "Så går det till", "How it works", "Jak to działa"),
      steps: [1, 2, 3].map((i) => ({
        title: pick(lang, `Steg ${i}`, `Step ${i}`, `Krok ${i}`),
        description: pick(lang, "Beskriv steget.", "Describe the step.", "Opisz ten krok."),
      })),
    }),
  },

  "service-areas": {
    type: "service-areas",
    label: { sv: "Områden", en: "Service areas" },
    whenToUse: {
      sv: "Lista orterna ni jobbar i. Använd för lokala företag som åker ut till kunderna (städ, hantverkare).",
      en: "List the places you serve. Use for local businesses that travel to customers (cleaning, handyman).",
    },
    category: "services",
    icon: "MapPinned",
    variants: [
      { key: "chips", label: { sv: "Etiketter", en: "Chips" } },
      { key: "list", label: { sv: "Lista", en: "List" } },
      {
        key: "cards",
        label: { sv: "Områdeskort", en: "Area cards" },
        description: {
          sv: "Varje område får ett eget tydligt kort med kartnål.",
          en: "Each service area gets its own clear card with a map pin.",
        },
      },
    ],
    defaultVariant: "chips",
    defaultTone: "light",
    allowedTones: ["light", "clear"],
    defaultContent: (lang) => ({
      type: "service-areas",
      heading: pick(
        lang,
        "Områden vi jobbar i",
        "Areas we serve",
        "Obszary, w których pracujemy",
      ),
      areas: [pick(lang, "Din ort", "Your city", "Twoja miejscowość")],
    }),
  },

  contact: {
    type: "contact",
    label: { sv: "Kontakt", en: "Contact" },
    whenToUse: {
      sv: "Kontaktformulär plus era uppgifter. Använd så besökaren kan nå er – oftast långt ner eller på en egen kontaktsida.",
      en: "Contact form plus your details. Use so visitors can reach you – usually near the bottom or on a contact page.",
    },
    category: "contact",
    icon: "Mail",
    variants: [
      { key: "form-info", label: { sv: "Formulär och info", en: "Form & info" } },
      { key: "info-only", label: { sv: "Bara info", en: "Info only" } },
      {
        key: "info-cards",
        label: { sv: "Infokort", en: "Info cards" },
        description: {
          sv: "E-post, telefon och adress visas som tre ikonkort istället för ett formulär.",
          en: "Email, phone and address shown as three icon cards instead of a form.",
        },
      },
    ],
    defaultVariant: "form-info",
    defaultTone: "clear",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "contact",
      heading: pick(lang, "Kontakta oss", "Contact us", "Skontaktuj się z nami"),
      fields: [
        {
          key: "name",
          label: pick(lang, "Namn", "Name", "Imię i nazwisko"),
          type: "text",
          required: true,
        },
        {
          key: "email",
          label: pick(lang, "E-post", "Email", "E-mail"),
          type: "email",
          required: true,
        },
        {
          key: "message",
          label: pick(lang, "Meddelande", "Message", "Wiadomość"),
          type: "textarea",
          required: true,
        },
      ],
      submitLabel: pick(lang, "Skicka", "Send", "Wyślij"),
      successMessage: pick(
        lang,
        "Tack! Vi hör av oss.",
        "Thanks! We’ll be in touch.",
        "Dziękujemy! Odezwiemy się.",
      ),
      // Always present (even empty) so "info-cards" can add/reorder items via
      // the generic array ops - matches gallery.images/certifications.items.
      infoItems: [],
    }),
  },

  "opening-hours": {
    type: "opening-hours",
    label: { sv: "Öppettider", en: "Opening hours" },
    whenToUse: {
      sv: "Visa veckans öppettider. Använd för platser folk besöker (butiker, kliniker, restauranger).",
      en: "Show your weekly opening hours. Use for places people visit (shops, clinics, restaurants).",
    },
    category: "contact",
    icon: "Clock",
    variants: [
      { key: "table", label: { sv: "Tabell", en: "Table" } },
      { key: "compact", label: { sv: "Kompakt", en: "Compact" } },
      {
        key: "cards",
        label: { sv: "Dagskort", en: "Day cards" },
        description: {
          sv: "Varje dag visas som ett eget kort i ett luftigt rutnät.",
          en: "Each day appears in its own card in an airy grid.",
        },
      },
    ],
    defaultVariant: "table",
    defaultTone: "light",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "opening-hours",
      heading: pick(lang, "Öppettider", "Opening hours", "Godziny otwarcia"),
      days: (["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).map(
        (day) => ({
          day,
          closed: day === "sat" || day === "sun",
          open: "09:00",
          close: "17:00",
        }),
      ),
    }),
  },

  location: {
    type: "location",
    label: { sv: "Hitta hit", en: "Location" },
    whenToUse: {
      sv: "Karta och adress. Använd när besökaren behöver hitta er fysiska plats.",
      en: "Map and address. Use when visitors need to find your physical place.",
    },
    category: "contact",
    icon: "MapPin",
    variants: [
      { key: "map-card", label: { sv: "Karta och adress", en: "Map & address" } },
      { key: "address-only", label: { sv: "Bara adress", en: "Address only" } },
      {
        key: "map-first",
        label: { sv: "Karta först", en: "Map first" },
        description: {
          sv: "Kartan ligger överst med adressen samlad i en kort rad under.",
          en: "The map leads, with the address collected in a short row below.",
        },
      },
    ],
    defaultVariant: "map-card",
    defaultTone: "light",
    allowedTones: ["light", "clear"],
    defaultContent: (lang) => ({
      type: "location",
      heading: pick(lang, "Hitta hit", "Find us", "Jak dojechać"),
      address: { city: pick(lang, "Din ort", "Your city", "Twoja miejscowość") },
    }),
  },

  certifications: {
    type: "certifications",
    label: { sv: "Certifieringar", en: "Certifications" },
    whenToUse: {
      sv: "Lista behörigheter, licenser eller utmärkelser. Använd för att bevisa trovärdighet (hantverk, vård, ekonomi).",
      en: "List qualifications, licences or awards. Use to prove credibility (trades, health, finance).",
    },
    category: "trust",
    icon: "BadgeCheck",
    variants: [
      { key: "list", label: { sv: "Lista", en: "List" } },
      { key: "grid", label: { sv: "Rutnät", en: "Grid" } },
      {
        key: "badges",
        label: { sv: "Emblem", en: "Badges" },
        description: {
          sv: "Certifieringarna visas som en enkel rad med emblem.",
          en: "Certifications shown as a simple row of badges.",
        },
      },
    ],
    defaultVariant: "list",
    defaultTone: "clear",
    allowedTones: ["light", "clear"],
    defaultContent: (lang) => ({
      type: "certifications",
      heading: pick(lang, "Certifieringar", "Certifications", "Certyfikaty"),
      items: [{ label: pick(lang, "Din certifiering", "Your certification", "Twój certyfikat") }],
    }),
  },

  "social-proof": {
    type: "social-proof",
    label: { sv: "Siffror", en: "Stats" },
    whenToUse: {
      sv: "Lyft fram nyckeltal (kunder, år, projekt). Använd för att bygga omedelbar trovärdighet.",
      en: "Headline numbers (customers, years, projects). Use to build instant credibility.",
    },
    category: "trust",
    icon: "TrendingUp",
    variants: [
      { key: "stats", label: { sv: "Siffror", en: "Stats" } },
      { key: "cards", label: { sv: "Kort", en: "Cards" } },
      {
        key: "inline",
        label: { sv: "Rad", en: "Inline" },
        description: {
          sv: "Siffrorna visas som en kompakt rad istället för rutor.",
          en: "Numbers shown as one compact line instead of boxed stat cards.",
        },
      },
    ],
    defaultVariant: "stats",
    defaultTone: "dark",
    allowedTones: ["light", "clear", "dark"],
    // Stat VALUES default to a fill-in placeholder token, never a fabricated
    // claim: a brand-new business has no "100+ customers" or "10 years". The
    // `{…}` token reads as "replace me" and is enforced by the publish QA gate
    // (example_stat_left), so real numbers must be entered before going live.
    defaultContent: (lang) => ({
      type: "social-proof",
      stats: [
        {
          value: pick(lang, "{antal}", "{number}", "{liczba}"),
          label: pick(lang, "Nöjda kunder", "Happy customers", "Zadowoleni klienci"),
        },
        {
          value: pick(lang, "{antal}", "{number}", "{liczba}"),
          label: pick(lang, "Års erfarenhet", "Years of experience", "Lata doświadczenia"),
        },
      ],
    }),
  },

  instagram: {
    type: "instagram",
    label: { sv: "Instagram", en: "Instagram" },
    whenToUse: {
      sv: "Visa ett rutnät av senaste Instagram-bilderna. Använd för att visa att ni är aktiva och visa riktigt arbete.",
      en: "Show a grid of recent Instagram photos. Use to prove you’re active and show real work.",
    },
    category: "content",
    icon: "Instagram",
    variants: [
      { key: "grid", label: { sv: "Rutnät", en: "Grid" } },
      { key: "row", label: { sv: "Rad", en: "Row" } },
      {
        key: "collage",
        label: { sv: "Kollage", en: "Collage" },
        description: {
          sv: "Ett större foto får sällskap av mindre bilder i ett redaktionellt rutnät.",
          en: "One larger photo is paired with smaller images in an editorial grid.",
        },
      },
    ],
    defaultVariant: "grid",
    defaultTone: "light",
    allowedTones: ["light", "clear"],
    defaultContent: () => ({ type: "instagram", images: [] }),
  },

  "cta-band": {
    type: "cta-band",
    label: { sv: "Uppmaning", en: "Call to action" },
    whenToUse: {
      sv: "En tydlig uppmaningsremsa. Använd mellan sektioner för att putta besökaren till handling.",
      en: "A bold call-to-action strip. Use between sections to nudge visitors to act.",
    },
    category: "intro",
    icon: "Megaphone",
    variants: [
      { key: "centered", label: { sv: "Centrerad", en: "Centered" } },
      { key: "split", label: { sv: "Delad", en: "Split" } },
      { key: "gradient", label: { sv: "Färgtoning", en: "Gradient" } },
      {
        key: "boxed",
        label: { sv: "I ram", en: "Boxed" },
        description: {
          sv: "Uppmaningen ligger i en inramad ruta istället för en bred remsa.",
          en: "The call to action sits inside a bordered card instead of a full-width band.",
        },
      },
    ],
    defaultVariant: "centered",
    defaultTone: "dark",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "cta-band",
      headline: pick(lang, "Redo att börja?", "Ready to get started?", "Gotowy, aby zacząć?"),
      primaryCta: {
        label: pick(lang, "Kontakta oss", "Contact us", "Skontaktuj się z nami"),
        target: { kind: "anchor", anchorId: "kontakt" },
      },
    }),
  },

  booking: {
    type: "booking",
    label: { sv: "Boka tid", en: "Booking" },
    whenToUse: {
      sv: "Låt kunder boka tid. Klistra in din bokningslänk (Calendly, Cal.com, Bokadirekt …) eller bygg en enkel egen bokning. Använd när kunder bokar besök (kliniker, salonger).",
      en: "Let customers book a time. Paste your booking link (Calendly, Cal.com, Bokadirekt …) or build a simple native booking. Use when customers book appointments (clinics, salons).",
    },
    category: "contact",
    icon: "CalendarCheck",
    variants: [
      { key: "button", label: { sv: "Knapp", en: "Button" } },
      { key: "inline", label: { sv: "Inbäddad", en: "Inline" } },
    ],
    defaultVariant: "inline",
    defaultTone: "clear",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "booking",
      heading: pick(lang, "Boka en tid", "Book an appointment", "Umów wizytę"),
      intro: pick(
        lang,
        "Välj en tid som passar dig.",
        "Pick a time that suits you.",
        "Wybierz termin, który Ci odpowiada.",
      ),
      source: { kind: "provider", url: "" },
    }),
  },

  "lead-form": {
    type: "lead-form",
    label: { sv: "Offertförfrågan", en: "Lead form" },
    whenToUse: {
      sv: "Formulär för att begära offert. Använd när jobb prissätts individuellt (städ, hantverkare, B2B).",
      en: "Request-a-quote form. Use when jobs are custom-priced (cleaning, handyman, B2B).",
    },
    category: "contact",
    icon: "ClipboardList",
    variants: [
      { key: "stacked", label: { sv: "Staplad", en: "Stacked" } },
      { key: "two-column", label: { sv: "Två kolumner", en: "Two columns" } },
      {
        key: "card",
        label: { sv: "Formulär i ruta", en: "Form card" },
        description: {
          sv: "Rubriken ligger fritt medan formuläret får en tydlig inramad ruta.",
          en: "The heading stays open while the form sits in a clear bordered card.",
        },
      },
    ],
    defaultVariant: "stacked",
    defaultTone: "clear",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "lead-form",
      heading: pick(lang, "Få en offert", "Get a quote", "Otrzymaj wycenę"),
      fields: [
        {
          key: "name",
          label: pick(lang, "Namn", "Name", "Imię i nazwisko"),
          type: "text",
          required: true,
        },
        {
          key: "phone",
          label: pick(lang, "Telefon", "Phone", "Telefon"),
          type: "phone",
          required: true,
        },
        {
          key: "details",
          label: pick(
            lang,
            "Vad behöver du hjälp med?",
            "What do you need help with?",
            "W czym możemy pomóc?",
          ),
          type: "textarea",
          required: false,
        },
      ],
      submitLabel: pick(lang, "Skicka förfrågan", "Send request", "Wyślij zapytanie"),
      successMessage: pick(
        lang,
        "Tack! Vi återkommer med en offert.",
        "Thanks! We’ll get back to you with a quote.",
        "Dziękujemy! Wrócimy z wyceną.",
      ),
    }),
  },
  "quote-flow": {
    type: "quote-flow",
    label: { sv: "Offertguide", en: "Smart quote flow" },
    whenToUse: {
      sv: "Guidad fråga-för-fråga som ger besökaren ett prisförslag direkt och fångar en färdig förfrågan. Använd istället för ett långt formulär när jobb prissätts på storlek/typ (städ, hantverkare).",
      en: "A step-by-step wizard that gives the visitor an instant price estimate and captures a structured request. Use instead of a long form when jobs are priced by size/type (cleaning, handyman).",
    },
    category: "contact",
    icon: "Calculator",
    variants: [
      { key: "card", label: { sv: "Kort", en: "Card" } },
      { key: "inline", label: { sv: "Inbäddad", en: "Inline" } },
    ],
    defaultVariant: "card",
    defaultTone: "clear",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "quote-flow",
      heading: pick(lang, "Få ett prisförslag", "Get a price estimate", "Otrzymaj wycenę"),
      intro: pick(
        lang,
        "Svara på några snabba frågor så ger vi dig en uppskattning direkt.",
        "Answer a few quick questions and we’ll give you an instant estimate.",
        "Odpowiedz na kilka szybkich pytań, a od razu podamy szacunkową cenę.",
      ),
      steps: [
        {
          key: "service",
          title: pick(
            lang,
            "Vad behöver du hjälp med?",
            "What do you need help with?",
            "W czym możemy pomóc?",
          ),
          input: "single-select",
          options: [
            { label: pick(lang, "Tjänst 1", "Service 1", "Usługa 1") },
            { label: pick(lang, "Tjänst 2", "Service 2", "Usługa 2") },
            { label: pick(lang, "Annat", "Something else", "Coś innego") },
          ],
          required: true,
        },
        {
          key: "details",
          title: pick(lang, "Beskriv ditt behov", "Describe what you need", "Opisz, czego potrzebujesz"),
          input: "textarea",
          required: false,
        },
      ],
      pricing: "none",
      currency: "kr",
      estimateNote: pick(
        lang,
        "Kostnadsfri offert · svar inom 24 h",
        "Free quote · reply within 24 h",
        "Bezpłatna wycena · odpowiedź w 24 h",
      ),
      insufficientMessage: pick(
        lang,
        "Vi behöver lite mer information för att ge ett pris.",
        "We need a little more information to give a price.",
        "Potrzebujemy nieco więcej informacji, aby podać cenę.",
      ),
      allowAiAutofill: true,
      submitLabel: pick(lang, "Skicka förfrågan", "Send request", "Wyślij zapytanie"),
      successMessage: pick(
        lang,
        "Tack! Vi återkommer med en offert.",
        "Thanks! We’ll get back to you with a quote.",
        "Dziękujemy! Wrócimy z wyceną.",
      ),
    }),
  },

  footer: {
    type: "footer",
    label: { sv: "Sidfot", en: "Footer" },
    whenToUse: {
      sv: "Längst ner på varje sida – kontakt, länkar, juridik. Använd en gång, alltid allra längst ner.",
      en: "Bottom of every page – contact, links, legal. Use once, always at the very bottom.",
    },
    category: "structure",
    icon: "PanelBottom",
    variants: [
      { key: "simple", label: { sv: "Enkel", en: "Simple" } },
      { key: "columns", label: { sv: "Kolumner", en: "Columns" } },
      { key: "centered", label: { sv: "Centrerad", en: "Centered" } },
      {
        key: "contact",
        label: { sv: "Kontakt", en: "Contact" },
        description: {
          sv: "Lägger till en rad med kontaktuppgifter (adress, telefon, e-post) ovanför länkarna.",
          en: "Adds one line of contact details (address, phone, email) above the links.",
        },
      },
    ],
    defaultVariant: "simple",
    defaultTone: "dark",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "footer",
      businessName: pick(lang, "Ditt företag", "Your business", "Twoja firma"),
    }),
  },

  legal: {
    type: "legal",
    label: { sv: "Juridisk text", en: "Legal text" },
    whenToUse: {
      sv: "Lång juridisk text (integritetspolicy, villkor). Använd på en egen sida – oftast genererad automatiskt.",
      en: "Long-form legal text (privacy policy, terms). Use on its own page – usually auto-generated.",
    },
    category: "structure",
    icon: "FileText",
    variants: [
      { key: "document", label: { sv: "Dokument", en: "Document" } },
      { key: "centered", label: { sv: "Centrerad", en: "Centered" } },
      {
        key: "paper",
        label: { sv: "Dokumentark", en: "Paper" },
        description: {
          sv: "Texten samlas på ett avgränsat dokumentark för tydligare fokus.",
          en: "The copy sits on a contained document sheet for clearer focus.",
        },
      },
    ],
    defaultVariant: "document",
    defaultTone: "light",
    allowedTones: ["light", "clear"],
    defaultContent: (lang) => ({
      type: "legal",
      heading: pick(lang, "Integritetspolicy", "Privacy policy", "Polityka prywatności"),
      blocks: [
        {
          kind: "p",
          text: pick(lang, "Skriv din text här.", "Write your text here.", "Wpisz swój tekst tutaj."),
        },
      ],
    }),
  },

  // --- Ported marketing-website blocks (see docs/block-catalog.md) ----------

  logos: {
    type: "logos",
    label: { sv: "Logotyper", en: "Logos" },
    whenToUse: {
      sv: "Visa logotyper för kunder, partners eller varumärken ni säljer. Använd för att låna trovärdighet (”de litar på oss”).",
      en: "Show logos of clients, partners or brands you stock. Use to borrow credibility (“trusted by”).",
    },
    category: "trust",
    icon: "Building2",
    variants: [
      { key: "row", label: { sv: "Rad", en: "Row" } },
      { key: "grid", label: { sv: "Rutnät", en: "Grid" } },
      {
        key: "marquee",
        label: { sv: "Löpande band", en: "Marquee" },
        description: {
          sv: "Logotyperna rullar kontinuerligt i en rad – bra när det är fler logotyper än vad som får plats.",
          en: "Logos scroll continuously in a row – good for more logos than fit on one screen.",
        },
      },
    ],
    defaultVariant: "row",
    defaultTone: "clear",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "logos",
      heading: pick(lang, "Företag som litar på oss", "Trusted by", "Zaufali nam"),
      items: [1, 2, 3, 4].map((i) => ({
        label: pick(lang, `Kund ${i}`, `Client ${i}`, `Klient ${i}`),
      })),
    }),
  },

  highlights: {
    type: "highlights",
    label: { sv: "Fördelar", en: "Highlights" },
    whenToUse: {
      sv: "Lyft fram skälen att välja er (snabbt, tryggt, personligt). Använd nära tjänsterna – fördelar, inte priser.",
      en: "Highlight the reasons to choose you (fast, safe, personal). Use near your services – benefits, not prices.",
    },
    category: "trust",
    icon: "Sparkles",
    variants: [
      { key: "grid-3", label: { sv: "Tre kort", en: "Three cards" } },
      { key: "grid-2", label: { sv: "Två kort", en: "Two cards" } },
      { key: "alternating", label: { sv: "Varannan rad", en: "Alternating" } },
      { key: "icon-list", label: { sv: "Ikonlista", en: "Icon list" } },
      {
        key: "plain",
        label: { sv: "Ren", en: "Plain" },
        description: {
          sv: "Bara text i luftiga kolumner med tunn linje ovanför — inga kort eller ikoner.",
          en: "Text-only airy columns with a thin rule above — no cards or icons.",
        },
      },
    ],
    defaultVariant: "grid-3",
    defaultTone: "light",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "highlights",
      heading: pick(lang, "Varför välja oss", "Why choose us", "Dlaczego my"),
      items: [
        {
          title: pick(lang, "Pålitlig", "Reliable", "Niezawodni"),
          description: pick(
            lang,
            "Vi gör det vi lovar, i tid.",
            "We do what we promise, on time.",
            "Robimy to, co obiecujemy, na czas.",
          ),
          icon: "shield",
        },
        {
          title: pick(lang, "Erfaren", "Experienced", "Doświadczeni"),
          description: pick(
            lang,
            "Många nöjda kunder genom åren.",
            "Many happy customers over the years.",
            "Wielu zadowolonych klientów przez lata.",
          ),
          icon: "star",
        },
        {
          title: pick(lang, "Personlig", "Personal", "Osobiste podejście"),
          description: pick(
            lang,
            "Du möts alltid av en riktig människa.",
            "You always reach a real person.",
            "Zawsze rozmawiasz z prawdziwą osobą.",
          ),
          icon: "heart",
        },
      ],
    }),
  },

  bento: {
    type: "bento",
    label: { sv: "Bildmosaik", en: "Bento grid" },
    whenToUse: {
      sv: "Ett visuellt rutnät med olika stora kort. Använd för att visa flera höjdpunkter snyggt (studior, byråer, restauranger).",
      en: "A visual grid of mixed-size cards. Use to show several highlights with style (studios, agencies, restaurants).",
    },
    category: "content",
    icon: "LayoutDashboard",
    variants: [
      { key: "bento", label: { sv: "Bento", en: "Bento" } },
      { key: "uniform", label: { sv: "Jämn", en: "Uniform" } },
      {
        key: "list",
        label: { sv: "Stora rader", en: "Large rows" },
        description: {
          sv: "Höjdpunkterna visas som en lugn vertikal följd av stora kort.",
          en: "Highlights appear as a calm vertical sequence of large cards.",
        },
      },
    ],
    defaultVariant: "bento",
    defaultTone: "light",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "bento",
      heading: pick(lang, "Höjdpunkter", "Highlights", "Najważniejsze"),
      cells: [
        {
          title: pick(lang, "Det viktigaste", "The main thing", "Najważniejsze"),
          description: pick(
            lang,
            "Lyft fram din starkaste punkt här.",
            "Showcase your strongest point here.",
            "Pokaż tutaj swój najmocniejszy atut.",
          ),
          span: "lg",
        },
        {
          title: pick(lang, "En till sak", "Another thing", "Kolejna rzecz"),
          description: pick(lang, "En kortare höjdpunkt.", "A shorter highlight.", "Krótsze wyróżnienie."),
        },
        {
          title: pick(lang, "Och en till", "And one more", "I jeszcze jedno"),
          description: pick(lang, "En kortare höjdpunkt.", "A shorter highlight.", "Krótsze wyróżnienie."),
        },
      ],
    }),
  },

  banner: {
    type: "banner",
    label: { sv: "Meddelande", en: "Banner" },
    whenToUse: {
      sv: "En smal remsa med ett meddelande (rea, helgöppet, ”bokar nu”). Använd för en tillfällig notis högt upp.",
      en: "A thin strip with one message (a sale, holiday hours, “now booking”). Use for a temporary notice near the top.",
    },
    category: "intro",
    icon: "Flag",
    variants: [
      { key: "bar", label: { sv: "Remsa", en: "Bar" } },
      { key: "card", label: { sv: "Ruta", en: "Card" } },
      {
        key: "split",
        label: { sv: "Delad", en: "Split" },
        description: {
          sv: "Meddelandet står till vänster och uppmaningen till höger på större skärmar.",
          en: "The message sits left and the action right on larger screens.",
        },
      },
    ],
    defaultVariant: "bar",
    defaultTone: "dark",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "banner",
      text: pick(
        lang,
        "Vi tar emot nya kunder – hör av dig idag!",
        "Now taking on new customers – get in touch today!",
        "Przyjmujemy nowych klientów – skontaktuj się już dziś!",
      ),
      cta: {
        label: pick(lang, "Kontakta oss", "Contact us", "Skontaktuj się z nami"),
        target: { kind: "anchor", anchorId: "kontakt" },
      },
    }),
  },

  video: {
    type: "video",
    label: { sv: "Video", en: "Video" },
    whenToUse: {
      sv: "Bädda in en film från YouTube eller Vimeo. Använd för en presentation, rundtur eller videorecension.",
      en: "Embed a video from YouTube or Vimeo. Use for an intro, a tour, or a video testimonial.",
    },
    category: "content",
    icon: "Video",
    variants: [
      { key: "full", label: { sv: "Hel bredd", en: "Full width" } },
      { key: "side", label: { sv: "Bredvid text", en: "Beside text" } },
      {
        key: "cinema",
        label: { sv: "Biobredd", en: "Cinema" },
        description: {
          sv: "Videon får en extra bred yta med rubrik och text som en redaktionell introduktion.",
          en: "Video gets an extra-wide stage with an editorial heading and caption.",
        },
      },
    ],
    defaultVariant: "full",
    defaultTone: "light",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "video",
      heading: pick(lang, "Se vår film", "Watch our video", "Zobacz nasz film"),
      provider: "youtube",
      videoId: "",
    }),
  },

  comparison: {
    type: "comparison",
    label: { sv: "Jämförelse", en: "Comparison" },
    whenToUse: {
      sv: "En jämförelsetabell (ni mot alternativet, eller paket). Använd för att visa varför ni är ett bättre val.",
      en: "A comparison table (you vs. the alternative, or packages). Use to show why you’re the better choice.",
    },
    category: "services",
    icon: "Table2",
    variants: [
      { key: "table", label: { sv: "Tabell", en: "Table" } },
      { key: "cards", label: { sv: "Kort", en: "Cards" } },
      {
        key: "features",
        label: { sv: "Fördelar", en: "Features" },
        description: {
          sv: "Varje fördel får en egen rad med alternativen bredvid varandra.",
          en: "Each feature gets its own row with the options side by side.",
        },
      },
    ],
    defaultVariant: "table",
    defaultTone: "light",
    allowedTones: ["light", "clear"],
    defaultContent: (lang) => ({
      type: "comparison",
      heading: pick(lang, "Varför välja oss", "Why choose us", "Dlaczego my"),
      columns: [
        { label: pick(lang, "Oss", "Us", "My"), highlighted: true },
        { label: pick(lang, "Andra", "Others", "Inni") },
      ],
      rows: [
        { label: pick(lang, "Snabb service", "Fast service", "Szybka obsługa"), cells: ["✓", "–"] },
        { label: pick(lang, "Fast pris", "Fixed price", "Stała cena"), cells: ["✓", "–"] },
        {
          label: pick(lang, "Personlig kontakt", "Personal contact", "Osobisty kontakt"),
          cells: ["✓", "–"],
        },
      ],
    }),
  },

  newsletter: {
    type: "newsletter",
    label: { sv: "Nyhetsbrev", en: "Newsletter" },
    whenToUse: {
      sv: "Ett fält för att samla e-postadresser. Använd om ni skickar nyheter eller erbjudanden då och då.",
      en: "A field to collect email addresses. Use if you send news or offers now and then.",
    },
    category: "contact",
    icon: "Send",
    variants: [
      { key: "boxed", label: { sv: "Ruta", en: "Boxed" } },
      { key: "inline", label: { sv: "Inbäddad", en: "Inline" } },
      {
        key: "centered",
        label: { sv: "Enkel", en: "Simple" },
        description: {
          sv: "En avskalad, centrerad prenumeration utan kort eller delad rad.",
          en: "A stripped-back centered signup without a card or split row.",
        },
      },
    ],
    defaultVariant: "boxed",
    defaultTone: "clear",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "newsletter",
      heading: pick(lang, "Håll dig uppdaterad", "Stay in the loop", "Bądź na bieżąco"),
      intro: pick(
        lang,
        "Få nyheter och erbjudanden då och då. Inget spam.",
        "Get news and offers now and then. No spam.",
        "Otrzymuj nowości i oferty od czasu do czasu. Żadnego spamu.",
      ),
      placeholder: pick(lang, "Din e-post", "Your email", "Twój e-mail"),
      submitLabel: pick(lang, "Prenumerera", "Subscribe", "Zapisz się"),
      successMessage: pick(lang, "Tack! Du är anmäld.", "Thanks! You’re signed up.", "Dziękujemy! Zapisano Cię."),
    }),
  },

  statement: {
    type: "statement",
    label: { sv: "Citat", en: "Statement" },
    whenToUse: {
      sv: "Ett stort, kort uttalande eller löfte. Använd som en kraftfull paus mellan sektioner.",
      en: "One large, short statement or promise. Use as a powerful pause between sections.",
    },
    category: "content",
    icon: "Quote",
    variants: [
      { key: "centered", label: { sv: "Centrerad", en: "Centered" } },
      { key: "bordered", label: { sv: "Med kantlinje", en: "Bordered" } },
      {
        key: "framed",
        label: { sv: "Inramad", en: "Framed" },
        description: {
          sv: "Uttalandet visas som ett lugnt, inramat citatkort.",
          en: "The statement appears as a calm framed quote card.",
        },
      },
    ],
    defaultVariant: "centered",
    defaultTone: "clear",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "statement",
      text: pick(
        lang,
        "Vårt mål är enkelt: att göra dig nöjd, varje gång.",
        "Our goal is simple: to make you happy, every time.",
        "Nasz cel jest prosty: Twoje zadowolenie za każdym razem.",
      ),
    }),
  },

  "rich-text": {
    type: "rich-text",
    label: { sv: "Textavsnitt", en: "Text block" },
    whenToUse: {
      sv: "Brödtext med rubriker och punktlistor. Används för artiklar och längre innehåll – skriv stycke för stycke.",
      en: "Body text with headings and bullet lists. Use for articles and longer content – write paragraph by paragraph.",
    },
    category: "content",
    icon: "Text",
    variants: [
      { key: "prose", label: { sv: "Text", en: "Prose" } },
      { key: "narrow", label: { sv: "Smal", en: "Narrow" } },
      {
        key: "paper",
        label: { sv: "Dokumentark", en: "Paper" },
        description: {
          sv: "Texten ligger på ett avgränsat dokumentark för bättre fokus.",
          en: "The copy sits on a contained document sheet for better focus.",
        },
      },
    ],
    defaultVariant: "prose",
    defaultTone: "light",
    allowedTones: ["light", "clear"],
    defaultContent: (lang) => ({
      type: "rich-text",
      blocks: [
        { kind: "h", text: pick(lang, "Rubrik", "Heading", "Nagłówek") },
        {
          kind: "p",
          text: pick(lang, "Skriv din text här.", "Write your text here.", "Wpisz swój tekst tutaj."),
        },
      ],
    }),
  },

  image: {
    type: "image",
    label: { sv: "Bild", en: "Image" },
    whenToUse: {
      sv: "En enskild bild med valfri bildtext. Används för att bryta av text i en artikel eller visa ett foto.",
      en: "A single image with an optional caption. Use to break up text in an article or show one photo.",
    },
    category: "content",
    icon: "Image",
    variants: [
      { key: "wide", label: { sv: "Bred", en: "Wide" } },
      { key: "full", label: { sv: "Hel bredd", en: "Full width" } },
      { key: "inset", label: { sv: "Smal", en: "Inset" } },
    ],
    defaultVariant: "wide",
    defaultTone: "light",
    allowedTones: ["light", "clear"],
    defaultContent: () => ({
      type: "image",
      caption: "",
    }),
  },
  "featured-product": {
    type: "featured-product",
    label: { sv: "Utvald produkt", en: "Featured product" },
    whenToUse: {
      sv: "Visa en eller några produkter du säljer, med pris och köpknapp. Kräver att Sälj är aktiverat.",
      en: "Show one or a few products you sell, with price and a buy button. Requires Sälj to be on.",
    },
    category: "services",
    icon: "Store",
    requiresCapability: "sell",
    variants: [{ key: "default", label: { sv: "Standard", en: "Default" } }],
    defaultVariant: "default",
    defaultTone: "light",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "featured-product",
      heading: pick(lang, "Utvalda produkter", "Featured products", "Wyróżnione produkty"),
    }),
  },
  "product-grid": {
    type: "product-grid",
    label: { sv: "Alla produkter", en: "All products" },
    whenToUse: {
      sv: "Visa alla dina produkter i ett rutnät – en liten butik. Kräver att Sälj är aktiverat.",
      en: "Show all your products in a grid – a little shop. Requires Sälj to be on.",
    },
    category: "services",
    icon: "Store",
    requiresCapability: "sell",
    variants: [{ key: "default", label: { sv: "Standard", en: "Default" } }],
    defaultVariant: "default",
    defaultTone: "light",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "product-grid",
      heading: pick(lang, "Produkter", "Products", "Produkty"),
    }),
  },
};

export const SECTION_DEFS = Object.values(SECTION_REGISTRY);

/** Section types that carry a page's conversion path (get in touch / book /
 *  request a quote). Hiding one of these on mobile removes that path on the
 *  device most visitors use - the editor warns passively and the AI layout
 *  tool requires an explicit owner confirmation. Shared so the two surfaces
 *  can never drift. */
export const CONVERSION_SECTION_TYPES: ReadonlySet<string> = new Set([
  "contact",
  "lead-form",
  "booking",
  "quote-flow",
]);

// ---------------------------------------------------------------------------
// Default factories for array items, so the editor can add a service / FAQ /
// step etc. on the canvas without a settings dialog. Keyed by
// `"${sectionType}.${arrayField}"`. Only text-bearing arrays are listed -
// image arrays (gallery/instagram images, before-after pairs) are grown by
// uploading, not by inserting an empty item (an empty assetRef is invalid).
// New items are validated against the content union on write, like any edit.
// ---------------------------------------------------------------------------

export const ARRAY_ITEM_MAX = 24;

export const ARRAY_DEFAULTS: Record<string, (lang: Locale) => unknown> = {
  "services.items": (l) => ({
    title: pick(l, "Ny tjänst", "New service", "Nowa usługa"),
    description: pick(
      l,
      "Kort beskrivning av tjänsten.",
      "A short description of the service.",
      "Krótki opis usługi.",
    ),
  }),
  "faq.items": (l) => ({
    question: pick(l, "Ny fråga?", "New question?", "Nowe pytanie?"),
    answer: pick(l, "Skriv svaret här.", "Write the answer here.", "Wpisz odpowiedź tutaj."),
  }),
  "team.members": (l) => ({
    name: pick(l, "Namn", "Name", "Imię i nazwisko"),
    role: pick(l, "Roll", "Role", "Stanowisko"),
  }),
  "testimonials.quotes": (l) => ({
    text: pick(l, "Skriv en recension här.", "Write a review here.", "Wpisz recenzję tutaj."),
    author: pick(l, "Kund", "Customer", "Klient"),
    rating: 5,
  }),
  "pricing.tiers": (l) => ({
    name: pick(l, "Ny nivå", "New tier", "Nowy poziom"),
    price: pick(l, "0", "0", "0"),
    features: [pick(l, "Vad som ingår", "What’s included", "Co jest w cenie")],
  }),
  "process.steps": (l) => ({
    title: pick(l, "Nytt steg", "New step", "Nowy krok"),
    description: pick(l, "Beskriv steget.", "Describe the step.", "Opisz ten krok."),
  }),
  "service-areas.areas": (l) => pick(l, "Nytt område", "New area", "Nowy obszar"),
  "service-detail.bullets": (l) => pick(l, "Ny punkt", "New point", "Nowy punkt"),
  "certifications.items": (l) => ({
    label: pick(l, "Ny certifiering", "New certification", "Nowy certyfikat"),
  }),
  "contact.infoItems": (l) => ({
    title: pick(l, "Kontaktväg", "Contact method", "Sposób kontaktu"),
    description: pick(l, "T.ex. e-post eller telefon.", "E.g. email or phone.", "Np. e-mail lub telefon."),
    icon: "mail",
  }),
  "social-proof.stats": (l) => ({
    value: "0",
    label: pick(l, "Etikett", "Label", "Etykieta"),
  }),
  "legal.blocks": (l) => ({
    kind: "p",
    text: pick(l, "Ny text", "New paragraph", "Nowy akapit"),
  }),
  "rich-text.blocks": (l) => ({
    kind: "p",
    text: pick(l, "Ny text", "New paragraph", "Nowy akapit"),
  }),
  "rich-text.items": (l) => pick(l, "Ny punkt", "New point", "Nowy punkt"),
  "logos.items": (l) => ({ label: pick(l, "Logotyp", "Logo", "Logo") }),
  "highlights.items": (l) => ({
    title: pick(l, "Ny fördel", "New highlight", "Nowe wyróżnienie"),
    description: pick(l, "Beskriv fördelen.", "Describe the benefit.", "Opisz zaletę."),
    icon: "check",
  }),
  "bento.cells": (l) => ({
    title: pick(l, "Ny ruta", "New cell", "Nowa komórka"),
    description: pick(l, "Kort text.", "Short text.", "Krótki tekst."),
  }),
  "comparison.columns": (l) => ({ label: pick(l, "Ny kolumn", "New column", "Nowa kolumna") }),
  "comparison.rows": (l) => ({
    label: pick(l, "Ny rad", "New row", "Nowy wiersz"),
    cells: ["✓", "–"],
  }),
  // `key` is a placeholder - the quote-flow editor renames it to a unique key on
  // add (answers/pricing/showWhen are keyed by it, so duplicates must not stick).
  "quote-flow.steps": (l) => ({
    key: "field",
    title: pick(l, "Ny fråga?", "New question?", "Nowe pytanie?"),
    input: "single-select",
    options: [{ label: pick(l, "Alternativ 1", "Option 1", "Opcja 1") }],
    required: true,
  }),
};

/** Resolve the default new item for an array field, or undefined if the field
 *  isn't add-able (unknown key or an image array). */
export function arrayDefaultFor(
  type: SectionType,
  arrayField: string,
  lang: Locale,
): unknown | undefined {
  return ARRAY_DEFAULTS[`${type}.${arrayField}`]?.(lang);
}

/** Resolve the tone to render for a section (stored tone overrides default). */
export function resolveTone(
  type: SectionType,
  stored?: SectionTone,
): SectionTone {
  return stored ?? SECTION_REGISTRY[type].defaultTone;
}

/** Validate a variant against the allow-list for a section type. */
export function isValidVariant(type: SectionType, variant: string): boolean {
  return SECTION_REGISTRY[type].variants.some((v) => v.key === variant);
}

/** Validate a tone against the allow-list for a section type. The Convex arg
 *  validator already limits tone to the global literals; this guards the
 *  per-type constraint (e.g. a section that only allows light/clear). */
export function isValidTone(type: SectionType, tone: string): boolean {
  return SECTION_REGISTRY[type].allowedTones.some((t) => t === tone);
}
