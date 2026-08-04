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

type L = { sv: string; en: string; pl: string };

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
  /** Who can ADD this block (Sophic import plan phase 4). Absent/"core" =
   *  everyone. "restricted" = a client-specific / specialist block: it renders
   *  everywhere it already exists (published sites, preview, imported drafts)
   *  but only appears in the add-section picker + AI planning for users
   *  holding the advanced-editor capability, so one client's custom sections
   *  never clutter every owner's picker. Server-enforced in
   *  sections.addSection (assertSectionTypeAddable). */
  availability?: "core" | "restricted";
};

const pick = (lang: Locale, sv: string, en: string, pl: string) =>
  lang === "pl" ? pl : lang === "sv" ? sv : en;

export const SECTION_REGISTRY: Record<SectionType, SectionDef> = {
  hero: {
    type: "hero",
    label: { sv: "Introduktion", en: "Introduction", pl: "Wprowadzenie" },
    whenToUse: {
      sv: "Längst upp på sidan – det första besökaren ser. Använd en gång per sida för att säga vilka ni är och vad besökaren ska göra.",
      en: "Top of the page – the first thing visitors see. Use once per page to say who you are and the main action to take.",
      pl: "Na samej górze strony – pierwsza rzecz, którą widzi odwiedzający. Użyj raz na stronę, żeby powiedzieć, kim jesteście i co gość ma zrobić.",
    },
    category: "intro",
    icon: "PanelTop",
    variants: [
      {
        key: "image-right",
        label: { sv: "Bild höger", en: "Image right", pl: "Zdjęcie po prawej" },
      },
      {
        key: "image-left",
        label: { sv: "Bild vänster", en: "Image left", pl: "Zdjęcie po lewej" },
      },
      {
        key: "centered",
        label: { sv: "Centrerad", en: "Centered", pl: "Wyśrodkowane" },
      },
      { key: "split", label: { sv: "Delad", en: "Split", pl: "Podzielone" } },
      {
        key: "split-bleed",
        label: {
          sv: "Delad, bild ut i kanten",
          en: "Split, image to the edge",
          pl: "Podzielone, zdjęcie do krawędzi",
        },
        description: {
          sv: "Samma delade hjälte som \"Delad\", men bilden går ut i sidkanten och fyller hela höjden i stället för att sitta i en ruta.",
          en: "The same split hero as \"Split\", but the photo runs out to the page edge and fills the full height instead of sitting in a box.",
          pl: "Ten sam podzielony hero co \"Podzielone\", ale zdjęcie wychodzi do krawędzi strony i wypełnia całą wysokość zamiast siedzieć w ramce.",
        },
      },
      { key: "minimal", label: { sv: "Enkel", en: "Minimal", pl: "Proste" } },
      {
        key: "overlay",
        label: { sv: "Bild bakom", en: "Image behind", pl: "Zdjęcie w tle" },
      },
      {
        key: "overlay-left",
        label: {
          sv: "Bild bakom, vänster",
          en: "Image behind, left",
          pl: "Zdjęcie w tle, po lewej",
        },
      },
      {
        key: "gradient",
        label: { sv: "Färgtoning", en: "Gradient", pl: "Przejście kolorów" },
      },
      {
        key: "overlay-full",
        label: {
          sv: "Helskärm med bild",
          en: "Full-screen image",
          pl: "Zdjęcie na pełny ekran",
        },
        description: {
          sv: "Samma bild bakom texten som \"Bild bakom\", men den fyller hela första vyn i stället för en fast bandhöjd.",
          en: "The same photo-behind-text as \"Image behind\", but it fills the whole first view instead of a fixed band.",
          pl: "To samo zdjęcie za tekstem co \"Zdjęcie w tle\", ale wypełnia cały pierwszy widok zamiast pasa o stałej wysokości.",
        },
      },
      {
        key: "overlay-light",
        label: {
          sv: "Ljus bild bakom",
          en: "Light image behind",
          pl: "Jasne zdjęcie w tle",
        },
        description: {
          sv: "För ljusa, lugna bilder: ingen mörk toning, texten i sajtens egen färg i stället för vit.",
          en: "For bright, calm photos: no dark scrim, and the text in the site's own colour instead of white.",
          pl: "Do jasnych, spokojnych zdjęć: bez ciemnej przesłony, tekst w kolorze strony zamiast białego.",
        },
      },
    ],
    defaultVariant: "image-right",
    defaultTone: "light",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "hero",
      // The eyebrow is the line that says who this is for or how long you have
      // been at it. Every hero variant renders it and it was never shown.
      eyebrow: pick(
        lang,
        "Kort rad ovanför rubriken",
        "Short line above the headline",
        "Krótki wiersz nad nagłówkiem",
      ),
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
    label: { sv: "Tjänster", en: "Services", pl: "Usługi" },
    whenToUse: {
      sv: "Visa vad ni erbjuder som 2–6 kort. Använd på startsidan så besökaren direkt ser vad ni gör.",
      en: "List what you offer as 2–6 cards. Use on the home page so visitors instantly see what you do.",
      pl: "Pokaż, co oferujecie, jako 2–6 kart. Użyj na stronie głównej, żeby gość od razu widział, czym się zajmujecie.",
    },
    category: "services",
    icon: "LayoutGrid",
    variants: [
      {
        key: "grid-3",
        label: { sv: "Tre kort", en: "Three cards", pl: "Trzy karty" },
      },
      {
        key: "grid-2",
        label: { sv: "Två kort", en: "Two cards", pl: "Dwie karty" },
      },
      { key: "list", label: { sv: "Lista", en: "List", pl: "Lista" } },
      {
        key: "split",
        label: { sv: "Delad", en: "Split", pl: "Podzielone" },
        description: {
          sv: "Rubrik till vänster, tjänsterna som avdelad lista till höger.",
          en: "Heading on the left, services as a divided list on the right.",
          pl: "Nagłówek po lewej, usługi jako lista z liniami po prawej.",
        },
      },
      {
        key: "icon-grid",
        label: { sv: "Ikonrutnät", en: "Icon grid", pl: "Siatka z ikonami" },
      },
      {
        key: "numbered",
        label: { sv: "Numrerad", en: "Numbered", pl: "Numerowane" },
      },
      {
        key: "icon-grid-cta",
        label: {
          sv: "Ikonrutnät med knapp",
          en: "Icon grid with button",
          pl: "Siatka z ikonami i przyciskiem",
        },
        description: {
          sv: "Ikonrutnätet plus en rad med uppmaningsknappar under.",
          en: "The icon grid plus a call-to-action button row underneath.",
          pl: "Siatka z ikonami plus rząd przycisków zachęty pod spodem.",
        },
      },
      {
        key: "numbered-split",
        label: {
          sv: "Numrerad, delad",
          en: "Numbered split",
          pl: "Numerowane, podzielone",
        },
        description: {
          sv: "Rubriken står kvar till vänster medan tjänsterna rullar förbi till höger som numrerade rader med hårfina linjer emellan.",
          en: "The heading stays on the left while the services scroll past on the right as numbered rows divided by hairlines.",
          pl: "Nagłówek zostaje po lewej, a usługi przewijają się po prawej jako numerowane wiersze oddzielone cienkimi liniami.",
        },
      },
    ],
    defaultVariant: "grid-3",
    defaultTone: "light",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "services",
      heading: pick(lang, "Våra tjänster", "Our services", "Nasze usługi"),
      // One line under the heading is where an owner frames the whole offer
      // ("we tailor every engagement to where you are"). The field existed but
      // never appeared, so almost no generated site used it.
      intro: pick(
        lang,
        "En rad om hur ni arbetar eller vem ni arbetar med.",
        "One line about how you work, or who you work with.",
        "Jedno zdanie o tym, jak pracujecie lub z kim.",
      ),
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
    label: { sv: "Tjänst i detalj", en: "Service detail", pl: "Usługa w szczegółach" },
    whenToUse: {
      sv: "Förklara en enskild tjänst på djupet med punkter och bild. Använd på en egen tjänstesida.",
      en: "Explain one service in depth with bullet points and an image. Use on a dedicated service page.",
      pl: "Opisz jedną usługę dokładnie, w punktach i ze zdjęciem. Użyj na osobnej stronie usługi.",
    },
    category: "services",
    icon: "FileText",
    variants: [
      {
        key: "media-right",
        label: { sv: "Bild höger", en: "Image right", pl: "Zdjęcie po prawej" },
      },
      {
        key: "media-left",
        label: { sv: "Bild vänster", en: "Image left", pl: "Zdjęcie po lewej" },
      },
      {
        key: "stacked",
        label: { sv: "Staplad", en: "Stacked", pl: "Jedno pod drugim" },
      },
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
    label: { sv: "Om oss", en: "About", pl: "O nas" },
    whenToUse: {
      sv: "Berätta er historia och skapa förtroende. Använd när besökaren vill veta vilka som står bakom företaget.",
      en: "Tell your story and build trust. Use when visitors want to know who is behind the business.",
      pl: "Opowiedz swoją historię i zbuduj zaufanie. Użyj, gdy gość chce wiedzieć, kto stoi za firmą.",
    },
    category: "trust",
    icon: "Users",
    variants: [
      {
        key: "text-image",
        label: { sv: "Text och bild", en: "Text & image", pl: "Tekst i zdjęcie" },
      },
      {
        key: "text-only",
        label: { sv: "Bara text", en: "Text only", pl: "Tylko tekst" },
      },
      {
        key: "image-left",
        label: { sv: "Bild vänster", en: "Image left", pl: "Zdjęcie po lewej" },
      },
      {
        key: "wide",
        label: { sv: "Bred", en: "Wide", pl: "Szerokie" },
        description: {
          sv: "Ett bredare textblock utan bild vid sidan – redaktionell känsla.",
          en: "A wider, editorial-style text block – no side image.",
          pl: "Szerszy blok tekstu bez zdjęcia z boku – wygląd jak w gazecie.",
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
    label: { sv: "Medarbetare", en: "Team", pl: "Zespół" },
    whenToUse: {
      sv: "Visa personerna bakom företaget med foton. Använd när personligt förtroende är viktigt (kliniker, salonger, byråer).",
      en: "Show the people behind the business with photos. Use when personal trust matters (clinics, salons, agencies).",
      pl: "Pokaż ze zdjęciami ludzi, którzy tworzą firmę. Użyj, gdy liczy się osobiste zaufanie (przychodnie, salony, agencje).",
    },
    category: "trust",
    icon: "UserRound",
    variants: [
      { key: "grid", label: { sv: "Rutnät", en: "Grid", pl: "Siatka" } },
      { key: "list", label: { sv: "Lista", en: "List", pl: "Lista" } },
      { key: "cards", label: { sv: "Kort", en: "Cards", pl: "Karty" } },
      {
        key: "grid-cta",
        label: {
          sv: "Rutnät med rekrytering",
          en: "Grid with hiring CTA",
          pl: "Siatka z ogłoszeniem o pracy",
        },
        description: {
          sv: 'Teamrutnätet plus en "vi anställer"-banner längst ner.',
          en: 'The team grid plus a "We\'re hiring" banner at the end.',
          pl: 'Siatka zespołu plus pasek "Szukamy pracowników" na końcu.',
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
        // Team cards carry a bio, and on a site whose team page is the whole
        // proof (consultancies, clinics, agencies) it is the field that does
        // the work. Without a placeholder it went unnoticed.
        bio: pick(
          lang,
          "Några rader om personens bakgrund och vad kunderna får ut av att jobba med hen.",
          "A few lines about this person's background and what customers get from working with them.",
          "Kilka zdań o doświadczeniu tej osoby i o tym, co zyskują klienci ze współpracy.",
        ),
      })),
    }),
  },

  testimonials: {
    type: "testimonials",
    label: { sv: "Recensioner", en: "Reviews", pl: "Opinie" },
    whenToUse: {
      sv: "Visa vad kunder säger. Använd för att bygga förtroende innan du ber besökaren kontakta eller boka.",
      en: "Show customer reviews. Use to build trust before asking visitors to contact or book.",
      pl: "Pokaż, co mówią klienci. Użyj, żeby zbudować zaufanie, zanim poprosisz gościa o kontakt lub rezerwację.",
    },
    category: "trust",
    icon: "Quote",
    variants: [
      { key: "cards", label: { sv: "Kort", en: "Cards", pl: "Karty" } },
      {
        key: "single",
        label: { sv: "Ett citat", en: "Single quote", pl: "Jedna wypowiedź" },
      },
      {
        key: "marquee",
        label: { sv: "Löpande band", en: "Marquee", pl: "Przesuwający się pasek" },
      },
      {
        key: "logos-quote",
        label: {
          sv: "Citat med logotyp",
          en: "Quote with logo",
          pl: "Wypowiedź z logo",
        },
        description: {
          sv: "Varje citat visas ihop med kundens företagslogotyp istället för ett foto.",
          en: "Pairs each quote with the customer’s company logo instead of a headshot.",
          pl: "Przy każdej wypowiedzi widać logo firmy klienta zamiast zdjęcia osoby.",
        },
      },
      {
        key: "plain",
        label: { sv: "Utan kort", en: "No cards", pl: "Bez kart" },
        description: {
          sv: "Citaten står i spalter under var sin hårfin linje, utan ram och utan bakgrund.",
          en: "The quotes stand in columns, each under its own hairline, with no frame and no background.",
          pl: "Wypowiedzi w kolumnach, każda pod własną cienką linią, bez ramki i bez tła.",
        },
      },
    ],
    defaultVariant: "cards",
    defaultTone: "clear",
    allowedTones: ["light", "clear", "dark"],
    // Ships EMPTY on purpose (backlog 0478): the old default was two
    // fabricated 5-star reviews, which is a publishable lie once the author
    // is renamed. The editor renders a neutral "add a review" state instead,
    // and the public site renders nothing until a real review exists.
    defaultContent: (lang) => ({
      type: "testimonials",
      heading: pick(lang, "Vad kunderna säger", "What customers say", "Co mówią klienci"),
      quotes: [],
    }),
  },

  gallery: {
    type: "gallery",
    label: { sv: "Bildgalleri", en: "Gallery", pl: "Galeria zdjęć" },
    whenToUse: {
      sv: "Visa foton på ert arbete eller er lokal. Använd för visuella verksamheter (restauranger, salonger, hantverkare).",
      en: "Show photos of your work or space. Use for visual businesses (restaurants, salons, builders).",
      pl: "Pokaż zdjęcia swojej pracy albo lokalu. Użyj tam, gdzie liczy się wygląd (restauracje, salony, wykonawcy).",
    },
    category: "content",
    icon: "Images",
    variants: [
      {
        key: "grid-3",
        label: { sv: "Tre i bredd", en: "Three wide", pl: "Trzy w rzędzie" },
      },
      {
        key: "grid-4",
        label: { sv: "Fyra i bredd", en: "Four wide", pl: "Cztery w rzędzie" },
      },
      { key: "masonry", label: { sv: "Tegel", en: "Masonry", pl: "Mozaika" } },
      {
        key: "carousel",
        label: { sv: "Karusell", en: "Carousel", pl: "Karuzela" },
      },
      {
        key: "full-bleed",
        label: {
          sv: "Kant till kant",
          en: "Full bleed",
          pl: "Od krawędzi do krawędzi",
        },
        description: {
          sv: "Bilderna går kant till kant utan marginal – ett djärvt, galleriliknande utseende.",
          en: "Photos run edge-to-edge with no side padding – a bold, gallery-style look.",
          pl: "Zdjęcia sięgają od krawędzi do krawędzi, bez marginesów – odważny wygląd jak w galerii.",
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
    label: { sv: "Före och efter", en: "Before & after", pl: "Przed i po" },
    whenToUse: {
      sv: "Jämför resultat sida vid sida. Använd när arbetet har en tydlig visuell förändring (städ, renovering, tandvård).",
      en: "Compare results side by side. Use when your work has a clear visual transformation (cleaning, renovation, dental).",
      pl: "Porównaj efekty obok siebie. Użyj, gdy praca daje wyraźnie widoczną zmianę (sprzątanie, remonty, stomatologia).",
    },
    category: "content",
    icon: "GitCompareArrows",
    variants: [
      {
        key: "side-by-side",
        label: { sv: "Sida vid sida", en: "Side by side", pl: "Obok siebie" },
      },
      {
        key: "stacked",
        label: { sv: "Staplad", en: "Stacked", pl: "Jedno pod drugim" },
      },
      {
        key: "wide",
        label: { sv: "Bred", en: "Wide", pl: "Szerokie" },
        description: {
          sv: "Varje före- och efterpar får hela radens bredd för tydligare resultat.",
          en: "Each before-and-after pair uses the full row for a clearer result.",
          pl: "Każda para przed i po zajmuje cały rząd, żeby efekt był wyraźniejszy.",
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
    label: { sv: "Priser", en: "Pricing", pl: "Cennik" },
    whenToUse: {
      sv: "Visa priser eller paket. Använd när tydliga priser hjälper besökaren att bestämma sig (gym, salonger, tjänster).",
      en: "Show prices or packages. Use when clear pricing helps visitors decide (gyms, salons, service businesses).",
      pl: "Pokaż ceny albo pakiety. Użyj, gdy jasne ceny pomagają gościowi podjąć decyzję (siłownie, salony, usługi).",
    },
    category: "services",
    icon: "Tag",
    variants: [
      {
        key: "tiers-3",
        label: { sv: "Tre nivåer", en: "Three tiers", pl: "Trzy pakiety" },
      },
      {
        key: "simple-list",
        label: { sv: "Prislista", en: "Price list", pl: "Lista cen" },
      },
      {
        key: "two-col",
        label: { sv: "Två nivåer", en: "Two tiers", pl: "Dwa pakiety" },
      },
      {
        key: "single",
        label: { sv: "Ett paket", en: "Single plan", pl: "Jeden pakiet" },
        description: {
          sv: "Ett paket visas stort och centrerat – för företag med ett fast pris.",
          en: "One plan shown large and centered – for businesses with one flat price.",
          pl: "Jeden pakiet pokazany duży i wyśrodkowany – dla firm z jedną stałą ceną.",
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
    label: { sv: "Vanliga frågor", en: "FAQ", pl: "Częste pytania" },
    whenToUse: {
      sv: "Svara på vanliga frågor. Använd för att ta bort tveksamheter och minska upprepade samtal och mejl.",
      en: "Answer common questions. Use to remove doubts and cut down on repetitive calls and emails.",
      pl: "Odpowiedz na częste pytania. Użyj, żeby rozwiać wątpliwości i ograniczyć powtarzające się telefony i maile.",
    },
    category: "content",
    icon: "MessageCircleQuestion",
    variants: [
      {
        key: "accordion",
        label: { sv: "Hopfällbar", en: "Accordion", pl: "Rozwijane" },
      },
      {
        key: "two-column",
        label: { sv: "Två kolumner", en: "Two columns", pl: "Dwie kolumny" },
      },
      { key: "cards", label: { sv: "Kort", en: "Cards", pl: "Karty" } },
      {
        key: "accordion-cta",
        label: {
          sv: "Hopfällbar med fråga",
          en: "Accordion with CTA",
          pl: "Rozwijane z zachętą",
        },
        description: {
          sv: 'Hopfällbara frågor plus en uppmaning "Har du fler frågor?" med knapp längst ner.',
          en: 'The accordion plus a "Still have questions?" prompt with a button at the end.',
          pl: 'Rozwijane pytania plus zachęta "Masz więcej pytań?" z przyciskiem na końcu.',
        },
      },
      {
        key: "split",
        label: { sv: "Delad", en: "Split", pl: "Podzielone" },
        description: {
          sv: "Rubriken står kvar till vänster medan frågorna fälls ut till höger.",
          en: "The heading stays on the left while the questions expand on the right.",
          pl: "Nagłówek zostaje po lewej, a pytania rozwijają się po prawej.",
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
    label: { sv: "Så går det till", en: "How it works", pl: "Jak to działa" },
    whenToUse: {
      sv: "Visa hur det går till att jobba med er, steg för steg. Använd för att få nya kunder att känna sig trygga.",
      en: "Show how working with you works, step by step. Use to make first-time customers feel safe.",
      pl: "Pokaż krok po kroku, jak wygląda współpraca z wami. Użyj, żeby nowi klienci poczuli się pewnie.",
    },
    category: "content",
    icon: "ListOrdered",
    variants: [
      {
        key: "steps-horizontal",
        label: { sv: "Steg i rad", en: "Steps in a row", pl: "Kroki w rzędzie" },
      },
      {
        key: "steps-vertical",
        label: {
          sv: "Steg under varandra",
          en: "Vertical steps",
          pl: "Kroki jeden pod drugim",
        },
      },
      { key: "timeline", label: { sv: "Tidslinje", en: "Timeline", pl: "Oś czasu" } },
      {
        key: "numbered-cards",
        label: {
          sv: "Numrerade kort",
          en: "Numbered cards",
          pl: "Numerowane karty",
        },
        description: {
          sv: "Varje steg får ett eget kort med en stor stegsiffra.",
          en: "Each step gets its own card with a large step number.",
          pl: "Każdy krok dostaje własną kartę z dużym numerem.",
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
    label: { sv: "Områden", en: "Service areas", pl: "Obszar działania" },
    whenToUse: {
      sv: "Lista orterna ni jobbar i. Använd för lokala företag som åker ut till kunderna (städ, hantverkare).",
      en: "List the places you serve. Use for local businesses that travel to customers (cleaning, handyman).",
      pl: "Wypisz miejscowości, w których pracujecie. Użyj, jeśli dojeżdżacie do klientów (sprzątanie, złota rączka).",
    },
    category: "services",
    icon: "MapPinned",
    variants: [
      { key: "chips", label: { sv: "Etiketter", en: "Chips", pl: "Etykiety" } },
      { key: "list", label: { sv: "Lista", en: "List", pl: "Lista" } },
      {
        key: "cards",
        label: { sv: "Områdeskort", en: "Area cards", pl: "Karty obszarów" },
        description: {
          sv: "Varje område får ett eget tydligt kort med kartnål.",
          en: "Each service area gets its own clear card with a map pin.",
          pl: "Każdy obszar dostaje własną wyraźną kartę z pinezką na mapie.",
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
    label: { sv: "Kontakt", en: "Contact", pl: "Kontakt" },
    whenToUse: {
      sv: "Kontaktformulär plus era uppgifter. Använd så besökaren kan nå er – oftast långt ner eller på en egen kontaktsida.",
      en: "Contact form plus your details. Use so visitors can reach you – usually near the bottom or on a contact page.",
      pl: "Formularz kontaktowy plus wasze dane. Użyj, żeby gość mógł się z wami skontaktować – zwykle na dole strony albo na osobnej stronie kontaktu.",
    },
    category: "contact",
    icon: "Mail",
    variants: [
      {
        key: "form-info",
        label: {
          sv: "Formulär och info",
          en: "Form & info",
          pl: "Formularz i dane",
        },
      },
      {
        key: "info-only",
        label: { sv: "Bara info", en: "Info only", pl: "Tylko dane" },
      },
      {
        key: "info-cards",
        label: { sv: "Infokort", en: "Info cards", pl: "Karty z danymi" },
        description: {
          sv: "E-post, telefon och adress visas som tre ikonkort istället för ett formulär.",
          en: "Email, phone and address shown as three icon cards instead of a form.",
          pl: "E-mail, telefon i adres pokazane jako trzy karty z ikonami zamiast formularza.",
        },
      },
      {
        key: "links",
        label: { sv: "Centrerade länkar", en: "Centred links", pl: "Wyśrodkowane linki" },
        description: {
          sv: "Kontaktvägarna som centrerade länkar under varandra, utan ikoner eller formulär. Sist kan en rubrik visa besöksadressen.",
          en: "Contact methods as centred links stacked under each other, with no icons or form. A titled item at the end shows the visiting address.",
          pl: "Sposoby kontaktu jako wyśrodkowane linki jeden pod drugim, bez ikon i formularza. Ostatnia pozycja z tytułem pokazuje adres.",
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
    label: { sv: "Öppettider", en: "Opening hours", pl: "Godziny otwarcia" },
    whenToUse: {
      sv: "Visa veckans öppettider. Använd för platser folk besöker (butiker, kliniker, restauranger).",
      en: "Show your weekly opening hours. Use for places people visit (shops, clinics, restaurants).",
      pl: "Pokaż godziny otwarcia na cały tydzień. Użyj tam, gdzie ludzie przychodzą osobiście (sklepy, przychodnie, restauracje).",
    },
    category: "contact",
    icon: "Clock",
    variants: [
      { key: "table", label: { sv: "Tabell", en: "Table", pl: "Tabela" } },
      { key: "compact", label: { sv: "Kompakt", en: "Compact", pl: "Zwarte" } },
      {
        key: "cards",
        label: { sv: "Dagskort", en: "Day cards", pl: "Karty dni" },
        description: {
          sv: "Varje dag visas som ett eget kort i ett luftigt rutnät.",
          en: "Each day appears in its own card in an airy grid.",
          pl: "Każdy dzień to osobna karta w przestronnej siatce.",
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
    label: { sv: "Hitta hit", en: "Location", pl: "Jak dojechać" },
    // No map is embedded - the section shows the address plus a link that opens
    // it in the visitor's own map app. The labels used to promise a map and the
    // section drew an empty grey frame to match, which read as a map that
    // failed to load on the owner's live site (backlog 1012).
    whenToUse: {
      sv: "Adress och vägbeskrivning. Använd när besökaren behöver hitta er fysiska plats.",
      en: "Address and directions. Use when visitors need to find your physical place.",
      pl: "Adres i dojazd. Użyj, gdy gość musi trafić do waszego lokalu.",
    },
    category: "contact",
    icon: "MapPin",
    variants: [
      {
        key: "map-card",
        label: { sv: "Adress och länk", en: "Address & link", pl: "Adres i link" },
      },
      {
        key: "address-only",
        label: { sv: "Bara adress", en: "Address only", pl: "Tylko adres" },
      },
      {
        key: "map-first",
        label: { sv: "Centrerad", en: "Centered", pl: "Wyśrodkowany" },
        description: {
          sv: "Adressen ligger centrerad med länken till kartan under.",
          en: "The address is centered with the map link below it.",
          pl: "Adres jest wyśrodkowany, a link do mapy pod nim.",
        },
      },
    ],
    defaultVariant: "map-card",
    defaultTone: "light",
    allowedTones: ["light", "clear"],
    defaultContent: (lang) => ({
      type: "location",
      heading: pick(lang, "Hitta hit", "Find us", "Jak dojechać"),
      // EMPTY, not placeholder text. Generation returns this default verbatim
      // when the owner gave us no address (build.ts, `case "location"`), so a
      // sample street and postcode here is a complete, plausible-looking
      // address we invented, published on a real business's site, with a map
      // link sending their visitors to search for it. We do not invent facts on
      // a customer's live site.
      //
      // The KEYS still have to be here: the dock builds its inputs by walking
      // the keys present on the content (lib/editor/extractFields), so dropping
      // `address` to `{}` would leave the owner with no field to type into.
      // Present-but-empty gives the editor its three labelled inputs and gives
      // the public site nothing to render - Location's empty-section guard
      // returns null rather than drawing a frame around an address nobody set.
      address: { street: "", postalCode: "", city: "" },
    }),
  },

  certifications: {
    type: "certifications",
    label: { sv: "Certifieringar", en: "Certifications", pl: "Certyfikaty" },
    whenToUse: {
      sv: "Lista behörigheter, licenser eller utmärkelser. Använd för att bevisa trovärdighet (hantverk, vård, ekonomi).",
      en: "List qualifications, licences or awards. Use to prove credibility (trades, health, finance).",
      pl: "Wypisz uprawnienia, licencje albo wyróżnienia. Użyj, żeby potwierdzić wiarygodność (rzemiosło, zdrowie, finanse).",
    },
    category: "trust",
    icon: "BadgeCheck",
    variants: [
      { key: "list", label: { sv: "Lista", en: "List", pl: "Lista" } },
      { key: "grid", label: { sv: "Rutnät", en: "Grid", pl: "Siatka" } },
      {
        key: "badges",
        label: { sv: "Emblem", en: "Badges", pl: "Odznaki" },
        description: {
          sv: "Certifieringarna visas som en enkel rad med emblem.",
          en: "Certifications shown as a simple row of badges.",
          pl: "Certyfikaty pokazane jako prosty rząd odznak.",
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
    label: { sv: "Siffror", en: "Stats", pl: "Liczby" },
    whenToUse: {
      sv: "Lyft fram nyckeltal (kunder, år, projekt). Använd för att bygga omedelbar trovärdighet.",
      en: "Headline numbers (customers, years, projects). Use to build instant credibility.",
      pl: "Wyróżnij najważniejsze liczby (klienci, lata, realizacje). Użyj, żeby od razu zbudować wiarygodność.",
    },
    category: "trust",
    icon: "TrendingUp",
    variants: [
      { key: "stats", label: { sv: "Siffror", en: "Stats", pl: "Liczby" } },
      { key: "cards", label: { sv: "Kort", en: "Cards", pl: "Karty" } },
      {
        key: "inline",
        label: { sv: "Rad", en: "Inline", pl: "W jednym rzędzie" },
        description: {
          sv: "Siffrorna visas som en kompakt rad istället för rutor.",
          en: "Numbers shown as one compact line instead of boxed stat cards.",
          pl: "Liczby pokazane w jednym zwartym rzędzie zamiast w kartach.",
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
    label: { sv: "Instagram", en: "Instagram", pl: "Instagram" },
    whenToUse: {
      sv: "Visa ett rutnät av senaste Instagram-bilderna. Använd för att visa att ni är aktiva och visa riktigt arbete.",
      en: "Show a grid of recent Instagram photos. Use to prove you’re active and show real work.",
      pl: "Pokaż siatkę najnowszych zdjęć z Instagrama. Użyj, żeby pokazać, że jesteście aktywni i widać prawdziwą pracę.",
    },
    category: "content",
    icon: "Instagram",
    variants: [
      { key: "grid", label: { sv: "Rutnät", en: "Grid", pl: "Siatka" } },
      { key: "row", label: { sv: "Rad", en: "Row", pl: "Rząd" } },
      {
        key: "collage",
        label: { sv: "Kollage", en: "Collage", pl: "Kolaż" },
        description: {
          sv: "Ett större foto får sällskap av mindre bilder i ett redaktionellt rutnät.",
          en: "One larger photo is paired with smaller images in an editorial grid.",
          pl: "Jedno większe zdjęcie w towarzystwie mniejszych, w siatce jak w magazynie.",
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
    label: { sv: "Uppmaning", en: "Call to action", pl: "Zachęta do działania" },
    whenToUse: {
      sv: "En tydlig uppmaningsremsa. Använd mellan sektioner för att putta besökaren till handling.",
      en: "A bold call-to-action strip. Use between sections to nudge visitors to act.",
      pl: "Wyraźny pasek z zachętą. Użyj między sekcjami, żeby popchnąć gościa do działania.",
    },
    category: "intro",
    icon: "Megaphone",
    variants: [
      {
        key: "centered",
        label: { sv: "Centrerad", en: "Centered", pl: "Wyśrodkowane" },
      },
      { key: "split", label: { sv: "Delad", en: "Split", pl: "Podzielone" } },
      {
        key: "gradient",
        label: { sv: "Färgtoning", en: "Gradient", pl: "Przejście kolorów" },
      },
      {
        key: "boxed",
        label: { sv: "I ram", en: "Boxed", pl: "W ramce" },
        description: {
          sv: "Uppmaningen ligger i en inramad ruta istället för en bred remsa.",
          en: "The call to action sits inside a bordered card instead of a full-width band.",
          pl: "Zachęta znajduje się w karcie z obramowaniem zamiast na pasku przez całą szerokość.",
        },
      },
    ],
    defaultVariant: "centered",
    defaultTone: "dark",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "cta-band",
      headline: pick(lang, "Redo att börja?", "Ready to get started?", "Gotowy, aby zacząć?"),
      // A headline alone reads abrupt at the bottom of a page; the supporting
      // line is what makes the ask feel low-threshold.
      subtext: pick(
        lang,
        "Skriv en rad om vad som händer när någon hör av sig.",
        "Add a line about what happens when someone gets in touch.",
        "Dodaj zdanie o tym, co się dzieje, gdy ktoś się odezwie.",
      ),
      primaryCta: {
        label: pick(lang, "Kontakta oss", "Contact us", "Skontaktuj się z nami"),
        target: { kind: "anchor", anchorId: "kontakt" },
      },
    }),
  },

  booking: {
    type: "booking",
    label: { sv: "Boka tid", en: "Booking", pl: "Rezerwacja wizyt" },
    whenToUse: {
      sv: "Låt kunder boka tid. Klistra in din bokningslänk (Calendly, Cal.com, Bokadirekt …) eller bygg en enkel egen bokning. Använd när kunder bokar besök (kliniker, salonger).",
      en: "Let customers book a time. Paste your booking link (Calendly, Cal.com, Bokadirekt …) or build a simple native booking. Use when customers book appointments (clinics, salons).",
      pl: "Pozwól klientom rezerwować termin. Wklej swój link do rezerwacji (Calendly, Cal.com, Bokadirekt …) albo zbuduj prostą własną rezerwację. Użyj, gdy klienci umawiają się na wizyty (przychodnie, salony).",
    },
    category: "contact",
    icon: "CalendarCheck",
    variants: [
      { key: "button", label: { sv: "Knapp", en: "Button", pl: "Przycisk" } },
      {
        key: "inline",
        label: { sv: "Inbäddad", en: "Inline", pl: "Osadzone na stronie" },
      },
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
    label: { sv: "Offertförfrågan", en: "Lead form", pl: "Zapytanie o wycenę" },
    whenToUse: {
      sv: "Formulär för att begära offert. Använd när jobb prissätts individuellt (städ, hantverkare, B2B).",
      en: "Request-a-quote form. Use when jobs are custom-priced (cleaning, handyman, B2B).",
      pl: "Formularz do zapytania o wycenę. Użyj, gdy cenę ustalacie indywidualnie (sprzątanie, złota rączka, firmy).",
    },
    category: "contact",
    icon: "ClipboardList",
    variants: [
      {
        key: "stacked",
        label: { sv: "Staplad", en: "Stacked", pl: "Jedno pod drugim" },
      },
      {
        key: "two-column",
        label: { sv: "Två kolumner", en: "Two columns", pl: "Dwie kolumny" },
      },
      {
        key: "card",
        label: {
          sv: "Formulär i ruta",
          en: "Form card",
          pl: "Formularz w ramce",
        },
        description: {
          sv: "Rubriken ligger fritt medan formuläret får en tydlig inramad ruta.",
          en: "The heading stays open while the form sits in a clear bordered card.",
          pl: "Nagłówek zostaje swobodny, a formularz trafia do wyraźnej karty z obramowaniem.",
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
        // Optional, exactly like the quote wizard's contact step - but it has to
        // EXIST. Without it a lead arrives with no email, and the inbox's reply
        // composer is gated on one, so the only outbound action the owner is
        // offered is a phone call. A customer who wrote "hör gärna av er på
        // mejl" could not be answered from inside the product (production
        // journey C 2026-07-26, backlog 1011).
        {
          key: "email",
          label: pick(lang, "E-post", "Email", "E-mail"),
          type: "email",
          required: false,
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
    label: { sv: "Offertguide", en: "Smart quote flow", pl: "Kreator wyceny" },
    whenToUse: {
      sv: "Guidad fråga-för-fråga som ger besökaren ett prisförslag direkt och fångar en färdig förfrågan. Använd istället för ett långt formulär när jobb prissätts på storlek/typ (städ, hantverkare).",
      en: "A step-by-step wizard that gives the visitor an instant price estimate and captures a structured request. Use instead of a long form when jobs are priced by size/type (cleaning, handyman).",
      pl: "Krok po kroku, pytanie po pytaniu – gość od razu dostaje szacunkową cenę, a Ty gotowe zapytanie. Użyj zamiast długiego formularza, gdy cena zależy od wielkości lub rodzaju zlecenia (sprzątanie, złota rączka).",
    },
    category: "contact",
    icon: "Calculator",
    variants: [
      { key: "card", label: { sv: "Kort", en: "Card", pl: "Karta" } },
      {
        key: "inline",
        label: { sv: "Inbäddad", en: "Inline", pl: "Osadzone na stronie" },
      },
    ],
    defaultVariant: "card",
    defaultTone: "clear",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "quote-flow",
      // The default ships `pricing: "none"`, so heading + intro must not promise
      // an instant price - and no default may assert a response time the owner
      // never gave (prd.md §4.11/§9). Same rule as the generated templates in
      // convex/generation/quoteFlows.ts. The owner turns pricing on, and writes
      // their own SLA, in the editor.
      heading: pick(lang, "Begär en offert", "Request a quote", "Poproś o wycenę"),
      intro: pick(
        lang,
        "Svara på några snabba frågor så återkommer vi med en offert.",
        "Answer a few quick questions and we’ll get back to you with a quote.",
        "Odpowiedz na kilka szybkich pytań, a wrócimy z wyceną.",
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
        // No response-time promise: "svar inom 24 h" asserted an SLA on the
        // owner's behalf that they never agreed to (audit 2026-07-25, F2). The
        // same invented promise was removed from the generated templates in
        // convex/generation/quoteFlows.ts. An owner who genuinely answers within
        // a day can add that themselves; we may not say it for them.
        "Kostnadsfri offert",
        "Free quote",
        "Bezpłatna wycena",
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
    label: { sv: "Sidfot", en: "Footer", pl: "Stopka" },
    whenToUse: {
      sv: "Längst ner på varje sida – kontakt, länkar, juridik. Använd en gång, alltid allra längst ner.",
      en: "Bottom of every page – contact, links, legal. Use once, always at the very bottom.",
      pl: "Na dole każdej strony – kontakt, odnośniki, informacje prawne. Użyj raz, zawsze na samym dole.",
    },
    category: "structure",
    icon: "PanelBottom",
    variants: [
      { key: "simple", label: { sv: "Enkel", en: "Simple", pl: "Prosta" } },
      { key: "columns", label: { sv: "Kolumner", en: "Columns", pl: "Kolumny" } },
      {
        key: "centered",
        label: { sv: "Centrerad", en: "Centered", pl: "Wyśrodkowana" },
      },
      {
        key: "contact",
        label: { sv: "Kontakt", en: "Contact", pl: "Kontakt" },
        description: {
          sv: "Lägger till en rad med kontaktuppgifter (adress, telefon, e-post) ovanför länkarna.",
          en: "Adds one line of contact details (address, phone, email) above the links.",
          pl: "Dodaje wiersz z danymi kontaktowymi (adres, telefon, e-mail) nad odnośnikami.",
        },
      },
    ],
    defaultVariant: "simple",
    defaultTone: "dark",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "footer",
      businessName: pick(lang, "Ditt företag", "Your business", "Twoja firma"),
      // The footer supports a tagline, a contact line and a legal line, but
      // shipping only `businessName` meant an owner had to discover them by
      // hunting through the settings panel. Instructional placeholders (never
      // invented facts - see the testimonials note above) show the fields exist
      // and what belongs in them.
      tagline: pick(
        lang,
        "En rad om vad ni gör och för vem.",
        "One line about what you do and who you do it for.",
        "Jedno zdanie o tym, co robicie i dla kogo.",
      ),
      contactLine: pick(
        lang,
        "Adress · Telefon · E-post",
        "Address · Phone · Email",
        "Adres · Telefon · E-mail",
      ),
      legalText: pick(
        lang,
        "© Ditt företag. Alla rättigheter förbehållna.",
        "© Your business. All rights reserved.",
        "© Twoja firma. Wszelkie prawa zastrzeżone.",
      ),
    }),
  },

  legal: {
    type: "legal",
    label: { sv: "Juridisk text", en: "Legal text", pl: "Tekst prawny" },
    whenToUse: {
      sv: "Lång juridisk text (integritetspolicy, villkor). Använd på en egen sida – oftast genererad automatiskt. Går att redigera direkt på sidan, och att klistra in från Word.",
      en: "Long-form legal text (privacy policy, terms). Use on its own page – usually auto-generated. Editable directly on the page, and you can paste from Word.",
      pl: "Długi tekst prawny (polityka prywatności, regulamin). Użyj na osobnej stronie – zwykle tworzony automatycznie. Można go edytować bezpośrednio na stronie i wkleić z Worda.",
    },
    category: "structure",
    icon: "FileText",
    variants: [
      { key: "document", label: { sv: "Dokument", en: "Document", pl: "Dokument" } },
      {
        key: "centered",
        label: { sv: "Centrerad", en: "Centered", pl: "Wyśrodkowany" },
      },
      {
        key: "paper",
        label: { sv: "Dokumentark", en: "Paper", pl: "Kartka dokumentu" },
        description: {
          sv: "Texten samlas på ett avgränsat dokumentark för tydligare fokus.",
          en: "The copy sits on a contained document sheet for clearer focus.",
          pl: "Tekst leży na wydzielonej kartce dokumentu, żeby łatwiej się skupić.",
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
    label: { sv: "Logotyper", en: "Logos", pl: "Logotypy" },
    whenToUse: {
      sv: "Visa logotyper för kunder, partners eller varumärken ni säljer. Använd för att låna trovärdighet (”de litar på oss”).",
      en: "Show logos of clients, partners or brands you stock. Use to borrow credibility (“trusted by”).",
      pl: "Pokaż logotypy klientów, partnerów albo marek, które sprzedajecie. Użyj, żeby pożyczyć wiarygodność („zaufali nam”).",
    },
    category: "trust",
    icon: "Building2",
    variants: [
      { key: "row", label: { sv: "Rad", en: "Row", pl: "Rząd" } },
      { key: "grid", label: { sv: "Rutnät", en: "Grid", pl: "Siatka" } },
      {
        key: "marquee",
        label: { sv: "Löpande band", en: "Marquee", pl: "Przesuwający się pasek" },
        description: {
          sv: "Logotyperna rullar kontinuerligt i en rad – bra när det är fler logotyper än vad som får plats.",
          en: "Logos scroll continuously in a row – good for more logos than fit on one screen.",
          pl: "Logotypy przesuwają się bez przerwy w jednym rzędzie – dobre, gdy jest ich więcej, niż mieści się na ekranie.",
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
    label: { sv: "Fördelar", en: "Highlights", pl: "Zalety" },
    whenToUse: {
      sv: "Lyft fram skälen att välja er (snabbt, tryggt, personligt). Använd nära tjänsterna – fördelar, inte priser.",
      en: "Highlight the reasons to choose you (fast, safe, personal). Use near your services – benefits, not prices.",
      pl: "Wypunktuj powody, żeby wybrać właśnie was (szybko, bezpiecznie, osobiście). Użyj blisko usług – zalety, nie ceny.",
    },
    category: "trust",
    icon: "Sparkles",
    variants: [
      {
        key: "grid-3",
        label: { sv: "Tre kort", en: "Three cards", pl: "Trzy karty" },
      },
      {
        key: "grid-2",
        label: { sv: "Två kort", en: "Two cards", pl: "Dwie karty" },
      },
      {
        key: "alternating",
        label: { sv: "Varannan rad", en: "Alternating", pl: "Naprzemiennie" },
      },
      {
        key: "icon-list",
        label: { sv: "Ikonlista", en: "Icon list", pl: "Lista z ikonami" },
      },
      {
        key: "plain",
        label: { sv: "Ren", en: "Plain", pl: "Bez ozdób" },
        description: {
          sv: "Bara text i luftiga kolumner med tunn linje ovanför — inga kort eller ikoner.",
          en: "Text-only airy columns with a thin rule above — no cards or icons.",
          pl: "Sam tekst w przestronnych kolumnach z cienką linią nad nimi — bez kart i ikon.",
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
          // Data honesty: never pre-fill claims the owner hasn't made
          // ("många nöjda kunder") - the default must be editable framing,
          // not invented proof.
          title: pick(lang, "Noggrann", "Thorough", "Dokładność"),
          description: pick(
            lang,
            "Vi är inte klara förrän du är nöjd.",
            "We are not done until you are happy.",
            "Kończymy dopiero, gdy jesteś zadowolony.",
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
    label: { sv: "Bildmosaik", en: "Bento grid", pl: "Mozaika kart" },
    whenToUse: {
      sv: "Ett visuellt rutnät med olika stora kort. Använd för att visa flera höjdpunkter snyggt (studior, byråer, restauranger).",
      en: "A visual grid of mixed-size cards. Use to show several highlights with style (studios, agencies, restaurants).",
      pl: "Efektowna siatka kart o różnych rozmiarach. Użyj, żeby ładnie pokazać kilka najważniejszych rzeczy (studia, agencje, restauracje).",
    },
    category: "content",
    icon: "LayoutDashboard",
    variants: [
      { key: "bento", label: { sv: "Bento", en: "Bento", pl: "Mozaika" } },
      { key: "uniform", label: { sv: "Jämn", en: "Uniform", pl: "Równe karty" } },
      {
        key: "list",
        label: { sv: "Stora rader", en: "Large rows", pl: "Duże rzędy" },
        description: {
          sv: "Höjdpunkterna visas som en lugn vertikal följd av stora kort.",
          en: "Highlights appear as a calm vertical sequence of large cards.",
          pl: "Najważniejsze rzeczy pokazane jako spokojny pionowy ciąg dużych kart.",
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
    label: { sv: "Meddelande", en: "Banner", pl: "Komunikat" },
    whenToUse: {
      sv: "En smal remsa med ett meddelande (rea, helgöppet, ”bokar nu”). Använd för en tillfällig notis högt upp.",
      en: "A thin strip with one message (a sale, holiday hours, “now booking”). Use for a temporary notice near the top.",
      pl: "Wąski pasek z jedną wiadomością (wyprzedaż, godziny świąteczne, „przyjmujemy zapisy”). Użyj na tymczasowe ogłoszenie u góry strony.",
    },
    category: "intro",
    icon: "Flag",
    variants: [
      { key: "bar", label: { sv: "Remsa", en: "Bar", pl: "Pasek" } },
      { key: "card", label: { sv: "Ruta", en: "Card", pl: "Karta" } },
      {
        key: "split",
        label: { sv: "Delad", en: "Split", pl: "Podzielone" },
        description: {
          sv: "Meddelandet står till vänster och uppmaningen till höger på större skärmar.",
          en: "The message sits left and the action right on larger screens.",
          pl: "Na większych ekranach wiadomość jest po lewej, a przycisk po prawej.",
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
    label: { sv: "Video", en: "Video", pl: "Film" },
    whenToUse: {
      sv: "Bädda in en film från YouTube eller Vimeo. Använd för en presentation, rundtur eller videorecension.",
      en: "Embed a video from YouTube or Vimeo. Use for an intro, a tour, or a video testimonial.",
      pl: "Osadź film z YouTube albo Vimeo. Użyj na przedstawienie firmy, spacer po lokalu albo opinię klienta na wideo.",
    },
    category: "content",
    icon: "Video",
    variants: [
      {
        key: "full",
        label: { sv: "Hel bredd", en: "Full width", pl: "Cała szerokość" },
      },
      {
        key: "side",
        label: { sv: "Bredvid text", en: "Beside text", pl: "Obok tekstu" },
      },
      {
        key: "cinema",
        label: { sv: "Biobredd", en: "Cinema", pl: "Szerokość kinowa" },
        description: {
          sv: "Videon får en extra bred yta med rubrik och text som en redaktionell introduktion.",
          en: "Video gets an extra-wide stage with an editorial heading and caption.",
          pl: "Film dostaje wyjątkowo szerokie miejsce z nagłówkiem i podpisem jak w magazynie.",
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
    label: { sv: "Jämförelse", en: "Comparison", pl: "Porównanie" },
    whenToUse: {
      sv: "En jämförelsetabell (ni mot alternativet, eller paket). Använd för att visa varför ni är ett bättre val.",
      en: "A comparison table (you vs. the alternative, or packages). Use to show why you’re the better choice.",
      pl: "Tabela porównawcza (wy kontra inne rozwiązanie albo pakiety). Użyj, żeby pokazać, dlaczego jesteście lepszym wyborem.",
    },
    category: "services",
    icon: "Table2",
    variants: [
      { key: "table", label: { sv: "Tabell", en: "Table", pl: "Tabela" } },
      { key: "cards", label: { sv: "Kort", en: "Cards", pl: "Karty" } },
      {
        key: "features",
        label: { sv: "Fördelar", en: "Features", pl: "Cechy" },
        description: {
          sv: "Varje fördel får en egen rad med alternativen bredvid varandra.",
          en: "Each feature gets its own row with the options side by side.",
          pl: "Każda cecha dostaje własny wiersz, a opcje stoją obok siebie.",
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
    label: { sv: "Nyhetsbrev", en: "Newsletter", pl: "Newsletter" },
    whenToUse: {
      sv: "Ett fält för att samla e-postadresser. Använd om ni skickar nyheter eller erbjudanden då och då.",
      en: "A field to collect email addresses. Use if you send news or offers now and then.",
      pl: "Pole do zbierania adresów e-mail. Użyj, jeśli od czasu do czasu wysyłacie nowości albo oferty.",
    },
    category: "contact",
    icon: "Send",
    variants: [
      { key: "boxed", label: { sv: "Ruta", en: "Boxed", pl: "W ramce" } },
      {
        key: "inline",
        label: { sv: "Inbäddad", en: "Inline", pl: "Osadzone na stronie" },
      },
      {
        key: "centered",
        label: { sv: "Enkel", en: "Simple", pl: "Proste" },
        description: {
          sv: "En avskalad, centrerad prenumeration utan kort eller delad rad.",
          en: "A stripped-back centered signup without a card or split row.",
          pl: "Skromny, wyśrodkowany zapis bez karty i bez dzielonego rzędu.",
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
    label: { sv: "Citat", en: "Statement", pl: "Motto" },
    whenToUse: {
      sv: "Ett stort, kort uttalande eller löfte. Använd som en kraftfull paus mellan sektioner.",
      en: "One large, short statement or promise. Use as a powerful pause between sections.",
      pl: "Jedno duże, krótkie zdanie albo obietnica. Użyj jako mocnej przerwy między sekcjami.",
    },
    category: "content",
    icon: "Quote",
    variants: [
      {
        key: "centered",
        label: { sv: "Centrerad", en: "Centered", pl: "Wyśrodkowane" },
      },
      {
        key: "bordered",
        label: { sv: "Med kantlinje", en: "Bordered", pl: "Z linią przy krawędzi" },
      },
      {
        key: "framed",
        label: { sv: "Inramad", en: "Framed", pl: "W ramce" },
        description: {
          sv: "Uttalandet visas som ett lugnt, inramat citatkort.",
          en: "The statement appears as a calm framed quote card.",
          pl: "Zdanie pokazane jako spokojna karta z cytatem w ramce.",
        },
      },
      {
        key: "rule",
        label: { sv: "Linjerad rad", en: "Ruled row", pl: "Wiersz z linią" },
        description: {
          sv: "En smal rad under en hårfin linje: uttalandet till vänster, tillskrivningen till höger. Tar nästan ingen höjd.",
          en: "A slim row under a hairline: the statement on the left, the attribution on the right. Takes almost no height.",
          pl: "Wąski wiersz pod cienką linią: zdanie po lewej, przypisanie po prawej. Zajmuje prawie zero wysokości.",
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
    label: { sv: "Textavsnitt", en: "Text block", pl: "Blok tekstu" },
    whenToUse: {
      sv: "Brödtext med rubriker, citat och punktlistor. Markera text på sidan för att göra den fet, länka den eller byta rubriknivå – eller klistra in direkt från Word.",
      en: "Body text with headings, quotes and bullet lists. Select text on the page to make it bold, link it or change its level – or paste straight from Word.",
      pl: "Zwykły tekst z nagłówkami, cytatami i listami punktowanymi. Zaznacz tekst na stronie, żeby go pogrubić, dodać link albo zmienić poziom nagłówka – lub wklej prosto z Worda.",
    },
    category: "content",
    icon: "Text",
    variants: [
      { key: "prose", label: { sv: "Text", en: "Prose", pl: "Tekst" } },
      { key: "narrow", label: { sv: "Smal", en: "Narrow", pl: "Wąskie" } },
      {
        key: "paper",
        label: { sv: "Dokumentark", en: "Paper", pl: "Kartka dokumentu" },
        description: {
          sv: "Texten ligger på ett avgränsat dokumentark för bättre fokus.",
          en: "The copy sits on a contained document sheet for better focus.",
          pl: "Tekst leży na wydzielonej kartce dokumentu, żeby łatwiej się skupić.",
        },
      },
      {
        key: "columns",
        label: { sv: "Två spalter", en: "Two columns", pl: "Dwie kolumny" },
        description: {
          sv: "Varje rubrik med sin text blir ett eget block i ett tvåspaltigt rutnät. Bra för flera korta avsnitt, t.ex. metoder eller vanliga frågor.",
          en: "Each heading and the text under it becomes its own block in a two-column grid. Good for several short sections, like methods or common questions.",
          pl: "Każdy nagłówek wraz z tekstem pod nim staje się osobnym blokiem w dwukolumnowej siatce. Dobre do kilku krótkich sekcji, np. metod albo częstych pytań.",
        },
      },
    ],
    defaultVariant: "prose",
    defaultTone: "light",
    allowedTones: ["light", "clear"],
    defaultContent: (lang) => ({
      type: "rich-text",
      // A heading + one paragraph hid the fact that this block also does bullet
      // lists. Long-form pages (services, policies, articles) lean on that, and
      // an owner who cannot see the list exists writes bullets as paragraphs.
      blocks: [
        { kind: "h", text: pick(lang, "Rubrik", "Heading", "Nagłówek") },
        {
          kind: "p",
          text: pick(lang, "Skriv din text här.", "Write your text here.", "Wpisz swój tekst tutaj."),
        },
        {
          kind: "ul",
          items: [
            pick(lang, "Punkt i en lista", "A point in a list", "Punkt na liście"),
            pick(lang, "Ännu en punkt", "Another point", "Kolejny punkt"),
          ],
        },
      ],
    }),
  },

  image: {
    type: "image",
    label: { sv: "Bild", en: "Image", pl: "Zdjęcie" },
    whenToUse: {
      sv: "En enskild bild med valfri bildtext. Används för att bryta av text i en artikel eller visa ett foto.",
      en: "A single image with an optional caption. Use to break up text in an article or show one photo.",
      pl: "Jedno zdjęcie z podpisem, jeśli chcesz. Użyj, żeby przerwać tekst w artykule albo pokazać pojedynczą fotografię.",
    },
    category: "content",
    icon: "Image",
    variants: [
      { key: "wide", label: { sv: "Bred", en: "Wide", pl: "Szerokie" } },
      {
        key: "full",
        label: { sv: "Hel bredd", en: "Full width", pl: "Cała szerokość" },
        description: {
          sv: "Bilden fyller hela skärmen – kant till kant, utan marginaler.",
          en: "The photo fills the whole screen – edge to edge, with no margins.",
          pl: "Zdjęcie wypełnia cały ekran – od krawędzi do krawędzi, bez marginesów.",
        },
      },
      { key: "inset", label: { sv: "Smal", en: "Inset", pl: "Wąskie" } },
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
    label: { sv: "Utvald produkt", en: "Featured product", pl: "Wyróżniony produkt" },
    whenToUse: {
      sv: "Visa en eller några produkter du säljer, med pris och köpknapp. Kräver att Sälj är aktiverat.",
      en: "Show one or a few products you sell, with price and a buy button. Requires Sell to be on.",
      pl: "Pokaż jeden lub kilka produktów, które sprzedajesz, z ceną i przyciskiem kupna. Wymaga włączonej Sprzedaży.",
    },
    category: "services",
    icon: "Store",
    requiresCapability: "sell",
    variants: [
      {
        key: "default",
        label: { sv: "Standard", en: "Default", pl: "Standardowy" },
      },
    ],
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
    label: { sv: "Alla produkter", en: "All products", pl: "Wszystkie produkty" },
    whenToUse: {
      sv: "Visa alla dina produkter i ett rutnät – en liten butik. Kräver att Sälj är aktiverat.",
      en: "Show all your products in a grid – a little shop. Requires Sell to be on.",
      pl: "Pokaż wszystkie swoje produkty w siatce – mały sklep. Wymaga włączonej Sprzedaży.",
    },
    category: "services",
    icon: "Store",
    requiresCapability: "sell",
    variants: [
      {
        key: "default",
        label: { sv: "Standard", en: "Default", pl: "Standardowy" },
      },
    ],
    defaultVariant: "default",
    defaultTone: "light",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "product-grid",
      heading: pick(lang, "Produkter", "Products", "Produkty"),
    }),
  },

  "external-product-grid": {
    type: "external-product-grid",
    label: {
      sv: "Produkter från din butik",
      en: "Products from your store",
      pl: "Produkty z Twojego sklepu",
    },
    whenToUse: {
      sv: "Visa produkter från butiken du redan har (Shopify) – köpet sker i butiken. Kräver att butiken är kopplad.",
      en: "Show products from the store you already have (Shopify) – the purchase happens in your store. Requires a connected store.",
      pl: "Pokaż produkty ze sklepu, który już masz (Shopify) – zakup odbywa się w sklepie. Wymaga połączonego sklepu.",
    },
    category: "services",
    icon: "Store",
    variants: [
      {
        key: "default",
        label: { sv: "Standard", en: "Default", pl: "Standardowy" },
      },
    ],
    defaultVariant: "default",
    defaultTone: "light",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "external-product-grid",
      heading: pick(lang, "Ur butiken", "From the store", "Ze sklepu"),
    }),
  },

  "documents": {
    type: "documents",
    label: { sv: "Dokument", en: "Documents", pl: "Dokumenty" },
    whenToUse: {
      sv: "Nedladdningsbara filer (PDF): meny, prislista, villkor, blanketter eller policydokument.",
      en: "Downloadable files (PDF): a menu, price list, terms, forms, or policy documents.",
      pl: "Pliki do pobrania (PDF): menu, cennik, regulaminy, formularze albo dokumenty polityk.",
    },
    category: "content",
    icon: "FileText",
    variants: [
      {
        key: "list",
        label: { sv: "Lista", en: "List", pl: "Lista" },
        description: {
          sv: "Enkel lista med en rad per dokument.",
          en: "A simple list with one row per document.",
          pl: "Prosta lista, jeden wiersz na dokument.",
        },
      },
      {
        key: "grid",
        label: { sv: "Rutnät", en: "Grid", pl: "Siatka" },
        description: {
          sv: "Kort i rutnät – passar många dokument.",
          en: "Cards in a grid – suits many documents.",
          pl: "Karty w siatce – dla wielu dokumentów.",
        },
      },
    ],
    defaultVariant: "list",
    defaultTone: "light",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "documents",
      heading: pick(lang, "Dokument", "Documents", "Dokumenty"),
      items: [],
    }),
  },

  "scroll-tabs": {
    type: "scroll-tabs",
    label: { sv: "Stegvisning", en: "Tab showcase", pl: "Pokaz kart" },
    whenToUse: {
      sv: "Flera steg eller funktioner där bilden eller filmen byts när besökaren bläddrar eller klickar. Passar produktgenomgångar.",
      en: "Several steps or features where the image or clip swaps as the visitor scrolls or clicks. Suits product walkthroughs.",
      pl: "Kilka kroków lub funkcji, gdzie obraz albo film zmienia się podczas przewijania lub klikania. Pasuje do prezentacji produktu.",
    },
    category: "content",
    icon: "LayoutDashboard",
    variants: [
      {
        key: "pinned",
        label: { sv: "Fäst vid skroll", en: "Pinned scroll", pl: "Przypięte przy przewijaniu" },
        description: {
          sv: "Panelen står stilla medan stegen byts när du skrollar. På mobil visas stegen staplade.",
          en: "The panel stays put while steps advance as you scroll. Stacked on mobile.",
          pl: "Panel stoi w miejscu, a kroki zmieniają się podczas przewijania. Na telefonie ułożone jedno pod drugim.",
        },
      },
      {
        key: "tabs",
        label: { sv: "Klickbara flikar", en: "Clickable tabs", pl: "Klikane karty" },
        description: {
          sv: "Besökaren klickar på en flik för att byta innehåll.",
          en: "The visitor clicks a tab to switch content.",
          pl: "Odwiedzający klika kartę, aby zmienić treść.",
        },
      },
      {
        key: "stacked",
        label: { sv: "Staplad", en: "Stacked", pl: "Ułożone" },
        description: {
          sv: "Alla steg visas under varandra utan animation.",
          en: "All steps shown one after another, no animation.",
          pl: "Wszystkie kroki jeden pod drugim, bez animacji.",
        },
      },
    ],
    defaultVariant: "pinned",
    defaultTone: "light",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "scroll-tabs",
      heading: pick(lang, "Så fungerar det", "How it works", "Jak to działa"),
      tabs: [],
    }),
  },

  "comparison-slider": {
    type: "comparison-slider",
    label: { sv: "Jämförelse med reglage", en: "Comparison slider", pl: "Porównanie z suwakiem" },
    whenToUse: {
      sv: "Låt besökaren dra i ett reglage och se hur siffror jämförs, till exempel avkastning per belopp.",
      en: "Let the visitor drag a slider and compare figures, for example returns per amount.",
      pl: "Pozwól odwiedzającemu przeciągnąć suwak i porównać liczby, np. zwrot dla kwoty.",
    },
    category: "content",
    icon: "Table2",
    variants: [
      { key: "default", label: { sv: "Standard", en: "Default", pl: "Standard" } },
    ],
    defaultVariant: "default",
    defaultTone: "light",
    allowedTones: ["light", "clear", "dark"],
    availability: "restricted",
    defaultContent: (lang) => ({
      type: "comparison-slider",
      heading: pick(lang, "Jämför", "Compare", "Porównaj"),
      minValue: 0,
      maxValue: 100000,
      defaultValue: 10000,
      columns: [],
    }),
  },

  "illustration": {
    type: "illustration",
    label: { sv: "Teckning", en: "Line drawing", pl: "Rysunek" },
    // Restricted deliberately, and not because the block is niche: it has NO
    // authoring UI. The paths arrive from an import. An owner who added it out
    // of the ordinary picker would get the default circle and no way to make it
    // their own drawing, which is a worse answer than not offering it. It still
    // renders everywhere it already exists — imported drafts, preview, every
    // published site — so nothing an import produced is affected. Revisit when
    // there is a way to bring your own file in.
    availability: "restricted",
    whenToUse: {
      sv: "En enkel teckning som hör till er – ett märke, en pil, en skiss. Den följer sidans färger och blir aldrig suddig. För foton, använd Bild.",
      en: "A simple drawing of your own — a mark, an arrow, a sketch. It follows the site's colours and never goes blurry. For photographs, use Image.",
      pl: "Prosty rysunek — znak, strzałka, szkic. Podąża za kolorami strony i nigdy się nie rozmywa. Do zdjęć użyj bloku Obraz.",
    },
    category: "content",
    icon: "Sparkles",
    variants: [
      { key: "default", label: { sv: "Standard", en: "Default", pl: "Standard" } },
      {
        key: "inline",
        label: { sv: "Liten", en: "Small", pl: "Mały" },
        description: {
          sv: "Centrerad och smal – för ett märke eller en liten skiss mellan två textblock.",
          en: "Centered and narrow — for a mark or a small sketch between two blocks of text.",
          pl: "Wyśrodkowany i wąski — dla znaku lub małego szkicu między blokami tekstu.",
        },
      },
      { key: "wide", label: { sv: "Bred", en: "Wide", pl: "Szeroki" } },
    ],
    defaultVariant: "default",
    defaultTone: "light",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "illustration",
      heading: pick(lang, "Rubrik", "Heading", "Nagłówek"),
      // A single stroked circle: something visible the moment the block is
      // added, in the site's own ink, that an import replaces wholesale.
      viewBox: "0 0 100 100",
      paths: [{ d: "M 50 6 A 44 44 0 1 1 49.9 6 Z", stroke: "ink", strokeWidth: 2 }],
    }),
  },

  "imported": {
    type: "imported",
    label: { sv: "Från din gamla sida", en: "From your old site", pl: "Z Twojej starej strony" },
    // `restricted`, and for the same reason `illustration` is: there is no way
    // to author one. It only ever arrives from an import, which captured a real
    // page's own layout. An owner adding it from the picker would get an empty
    // block with nothing to fill it from.
    availability: "restricted",
    whenToUse: {
      sv: "En del av din gamla hemsida, precis som den såg ut. Texter, bilder och länkar går att ändra som vanligt – men själva formen kommer från originalet.",
      en: "A piece of your old website, exactly as it looked. Text, images and links edit as usual — the shape itself comes from the original.",
      pl: "Fragment Twojej starej strony, dokładnie taki, jaki był. Tekst, obrazy i linki edytujesz normalnie — sam układ pochodzi z oryginału.",
    },
    category: "content",
    icon: "FileText",
    variants: [
      { key: "default", label: { sv: "Standard", en: "Default", pl: "Standard" } },
    ],
    defaultVariant: "default",
    defaultTone: "light",
    // One tone only: the capture brings its OWN background. Painting a tone
    // surface behind it would either be invisible or fight it.
    allowedTones: ["light"],
    defaultContent: () => ({
      type: "imported",
      nodes: [],
      slots: {},
    }),
  },

  // section:new-registry-anchor — `bun run section:new <type>` inserts
  // registry entries above. Do not remove or rename this comment.
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

/** Ceiling on items an editor may ADD to one section array (convex/sections.ts
 *  `addItems`, convex/lib/sectionOps.ts). Not an import cap - the portable
 *  format has no per-array bound, so an imported array can legitimately arrive
 *  longer than this. It was 24, which left a real client or certification list
 *  carried in by Site Kit (42 client names on one live import) frozen: already
 *  over the cap, so the owner could never add row 43 to their own content. 64
 *  keeps the paste-bomb ceiling meaningful while leaving long lists editable. */
export const ARRAY_ITEM_MAX = 64;

export const ARRAY_DEFAULTS: Record<string, (lang: Locale) => unknown> = {
  "documents.items": (l) => ({
    title: pick(l, "Nytt dokument", "New document", "Nowy dokument"),
  }),
  "scroll-tabs.tabs": (l) => ({
    label: pick(l, "Nytt steg", "New step", "Nowy krok"),
    description: pick(l, "Beskriv steget här.", "Describe the step here.", "Opisz krok tutaj."),
  }),
  "comparison-slider.columns": (l) => ({
    label: pick(l, "Nytt alternativ", "New option", "Nowa opcja"),
    ratePct: 1,
  }),
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
