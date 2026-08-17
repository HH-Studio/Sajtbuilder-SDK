import type { Locale } from "../i18n";
import type { SectionTone } from "./theme";
import type {
  SectionContent,
  SectionType,
} from "../../convex/model/sections";
import { newsletterDefaults } from "./newsletterDefaults";

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
  /** Content this layout needs in order to render honestly.
   *
   *  Checked on swap by `missingForVariant` (lib/sections/variantRequirements.ts);
   *  anything already present is left alone, always. Keys are top-level content
   *  field names - the same vocabulary `hiddenContentPaths` addresses.
   *
   *  This is a DECLARATION on purpose. It used to be a hardcoded if/else chain
   *  inside `seededVariantContent`, in a file nobody adding a variant thinks to
   *  open, so the usual failure was silent: the new layout rendered with an
   *  empty band. Declaring it next to the variant means the guardrail test
   *  (`variantRequirements.test.ts`) can walk the registry and refuse a variant
   *  whose requirement nothing fills. */
  requires?: {
    /** Field names this layout renders and cannot fake, e.g. ["eyebrow"]. */
    fields?: readonly string[];
    /** Minimum length of the type's repeating `items` array, e.g. 3 for a
     *  three-card layout. */
    minItems?: number;
  };
  /** Bounded presentation axes this layout offers, beyond the layout choice
   *  itself. Closed enums only - the same constraint that keeps styleOverrides
   *  from becoming a CSS panel. Server-validated against this list in
   *  `setSectionOptions`, so a client cannot store an axis a layout does not
   *  render. The first entry of each list is the default (= what the layout
   *  does today when `options` is absent).
   *
   *  The test for axis-vs-variant: if the copy that fits one setting fits the
   *  other, it is an axis. Where a setting changes the SHAPE of the layout
   *  rather than its presentation, it stays a variant. */
  options?: {
    surface?: readonly ("plain" | "card")[];
    asset?: readonly ("image" | "video")[];
    assetStyle?: readonly ("default" | "expand")[];
    assetSide?: readonly ("start" | "end")[];
  };
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
        description: {
          sv: "Rubrik och knappar till vänster, ett foto till höger i en rundad ruta.",
          en: "Heading and buttons on the reading side, one photo beside them in a rounded box.",
          pl: "Nagłówek i przyciski z brzegu, zdjęcie obok w zaokrąglonym polu.",
        },
      },
      {
        key: "image-left",
        label: { sv: "Bild vänster", en: "Image left", pl: "Zdjęcie po lewej" },
        description: {
          sv: "Samma som \"Bild höger\" men spegelvänd: fotot först och texten efter.",
          en: "The same as \"Image right\" mirrored: the photo first and the text after it.",
          pl: "To samo co \"Zdjęcie po prawej\", odbite: najpierw zdjęcie, potem tekst.",
        },
      },
      {
        key: "centered",
        label: { sv: "Text i mitten", en: "Centred text", pl: "Tekst na środku" },
        description: {
          sv: "Rubrik, text och knappar mitt på sidan. Skriver du en faktarad står den under knapparna – annars syns ingenting där.",
          en: "Heading, text and buttons centred on the page. If you write a fact line it sits under the buttons – otherwise nothing shows there.",
          pl: "Nagłówek, tekst i przyciski na środku strony. Jeśli wpiszesz wiersz z faktem, stanie pod przyciskami – w przeciwnym razie nic tam nie ma.",
        },
      },
      {
        key: "split",
        label: { sv: "Text och sidobild", en: "Text and photo", pl: "Tekst i zdjęcie" },
        description: {
          sv: "Texten och fotot delar bredden lika, sida vid sida på större skärmar.",
          en: "The text and the photo share the width equally, side by side on larger screens.",
          pl: "Tekst i zdjęcie dzielą szerokość po równo, obok siebie na większych ekranach.",
        },
        // "end" first = the photo after the text in reading order, which is
        // what this hero has always drawn.
        options: { assetSide: ["end", "start"] },
      },
      {
        key: "split-bleed",
        options: { assetSide: ["end", "start"] },
        label: {
          sv: "Bild till kanten",
          en: "Photo to edge",
          pl: "Obraz do brzegu",
        },
        description: {
          sv: "Samma text och sidobild som i \"Text och sidobild\", men bilden går ut i sidkanten och fyller hela höjden i stället för att sitta i en ruta.",
          en: "The same text and photo as \"Text and photo\", but the photo runs out to the page edge and fills the full height instead of sitting in a box.",
          pl: "Ten sam tekst i zdjęcie co w \"Tekst i zdjęcie\", ale zdjęcie wychodzi do krawędzi strony i wypełnia całą wysokość zamiast siedzieć w ramce.",
        },
      },
      {
        key: "minimal",
        label: { sv: "Text utan bild", en: "Text, no photo", pl: "Tekst bez zdjęcia" },
        description: {
          sv: "Bara rubrik, en rad text och knapparna – inget foto alls. Den lugnaste starten.",
          en: "Just the heading, one line of text and the buttons – no photo at all. The quietest opening.",
          pl: "Tylko nagłówek, jeden wiersz tekstu i przyciski – bez zdjęcia. Najspokojniejszy początek.",
        },
      },
      {
        key: "overlay",
        label: { sv: "Bild bakom", en: "Image behind", pl: "Zdjęcie w tle" },
        description: {
          sv: "Fotot ligger bakom texten i en band-hög ruta, med en mörk ton över så texten syns.",
          en: "The photo sits behind the text in a band-height box, with a dark wash over it so the words read.",
          pl: "Zdjęcie leży za tekstem w pasie, przyciemnione, żeby słowa były czytelne.",
        },
      },
      {
        key: "overlay-left",
        label: {
          sv: "Bakgrund, vänster",
          en: "Background, left",
          pl: "Tło, po lewej",
        },
        description: {
          sv: "Samma foto bakom texten, men rubriken och knapparna står vänsterställda i stället för centrerat.",
          en: "The same photo behind the text, but the heading and buttons are ranged left instead of centred.",
          pl: "To samo zdjęcie za tekstem, ale nagłówek i przyciski są do lewej, nie wyśrodkowane.",
        },
      },
      {
        key: "gradient",
        label: { sv: "Tonad bakgrund", en: "Gradient backdrop", pl: "Tło z gradientem" },
        description: {
          sv: "Ingen bild – i stället en mjuk färgtoning i sidans egen färg bakom texten.",
          en: "No picture – a soft gradient in the site's own colour behind the text instead.",
          pl: "Bez zdjęcia – zamiast tego miękkie przejście w kolorze strony za tekstem.",
        },
      },
      {
        key: "overlay-full",
        label: {
          sv: "Helskärmsbild",
          en: "Full-screen photo",
          pl: "Pełny ekran",
        },
        description: {
          sv: "Samma bild bakom texten som \"Bild bakom\", men den fyller hela första vyn i stället för en fast bandhöjd.",
          en: "The same photo-behind-text as \"Image behind\", but it fills the whole first view instead of a fixed band.",
          pl: "To samo zdjęcie za tekstem co \"Zdjęcie w tle\", ale wypełnia cały pierwszy widok zamiast pasa o stałej wysokości.",
        },
      },
      {
        key: "overlay-full-left",
        label: {
          sv: "Text uppe vänster",
          en: "Top-left text",
          pl: "Lewy górny tekst",
        },
        description: {
          sv: "Bilden fyller hela första vyn medan rubrik, text och knapp står smalt och högt till vänster.",
          en: "The photo fills the whole first view while the heading, text and button sit in a narrow column high on the left.",
          pl: "Zdjęcie wypełnia cały pierwszy widok, a nagłówek, tekst i przycisk tworzą wąską kolumnę wysoko po lewej.",
        },
      },
      {
        key: "overlay-full-left-centered",
        label: {
          sv: "Vänster, mitt på",
          en: "Left, middle",
          pl: "Tekst po lewej",
        },
        description: {
          sv: "Bilden fyller hela första vyn medan en smal vänsterspalt med liten rad, rubrik, text och två knappar ligger mitt på höjden.",
          en: "The photo fills the whole first view while a narrow left column with a short label, heading, text and two buttons sits midway down the image.",
          pl: "Zdjęcie wypełnia cały pierwszy widok, a wąska lewa kolumna z krótką etykietą, nagłówkiem, tekstem i dwoma przyciskami znajduje się pośrodku wysokości.",
        },
      },
      {
        key: "overlay-proof",
        label: {
          sv: "Helskärm med fakta",
          en: "Fact line on photo",
          pl: "Fakt na zdjęciu",
        },
        description: {
          sv: "Samma helskärmsbild med centrerad rubrik, plus en separat kort faktarad längst ned. Raden visas bara när ni skriver den.",
          en: "The same full-screen photo with a centred heading, plus a separate short fact at the bottom. The line only appears when you write it.",
          pl: "To samo zdjęcie pełnoekranowe z wyśrodkowanym nagłówkiem oraz osobnym krótkim faktem na dole. Wiersz pojawia się tylko po jego wpisaniu.",
        },
      },
      {
        key: "overlay-light",
        label: {
          sv: "Ljus bakgrundsbild",
          en: "Bright background",
          pl: "Jasne tło",
        },
        description: {
          sv: "För ljusa, lugna bilder: en mjukare toning än helskärmsbilden, samlad bakom texten så att bilden behåller sitt ljus.",
          en: "For bright, calm photos: a softer shade than the full-screen photo, pooled behind the text so the picture keeps its light.",
          pl: "Do jasnych, spokojnych zdjęć: łagodniejsze przyciemnienie niż zdjęcie pełnoekranowe, skupione za tekstem, więc zdjęcie zachowuje swoje światło.",
        },
      },
      {
        key: "poster",
        label: {
          sv: "Stor bildrubrik",
          en: "Big photo heading",
          pl: "Tytuł na zdjęciu",
        },
        description: {
          sv: "Bilden fyller hela bandet och rubriken står stor längs bildens underkant. Bäst med en kort rubrik på ett eller två ord.",
          en: "The photo fills the whole band and the headline sits large along its bottom edge. Best with a short one- or two-word headline.",
          pl: "Zdjęcie wypełnia cały pas, a nagłówek stoi duży przy jego dolnej krawędzi. Najlepiej z krótkim nagłówkiem z jednego lub dwóch słów.",
        },
      },
      {
        key: "panel",
        label: {
          sv: "Bild i panel",
          en: "Image in a panel",
          pl: "Zdjęcie w panelu",
        },
        description: {
          sv: "Texten till vänster och bilden till höger i en rundad panel med luft runt om, i stället för att gå ut i kanten.",
          en: "Text on the left and the photo on the right inside a rounded panel with air around it, instead of running to the edge.",
          pl: "Tekst po lewej, a zdjęcie po prawej w zaokrąglonym panelu z przestrzenią wokół, zamiast wychodzić do krawędzi.",
        },
      },
      {
        key: "stage",
        label: { sv: "Bildrad under text", en: "Photo row below", pl: "Rząd zdjęć" },
        description: {
          sv: "Rubrik och knapp centrerat överst, och under dem en rad foton i olika höjd som visar arbetet.",
          en: "Heading and button centred at the top, and under them a row of photos at varying heights showing the work.",
          pl: "Nagłówek i przycisk wyśrodkowane na górze, a pod nimi rząd zdjęć o różnej wysokości pokazujących pracę.",
        },
      },
      {
        key: "duo",
        label: { sv: "Två bilder", en: "Two photos", pl: "Dwa zdjęcia" },
        description: {
          sv: "Ett stort foto går ut i vänsterkanten, texten står till höger och ett mindre foto ligger inskjutet nedtill.",
          en: "One large photo runs to the left edge, the text sits on the right and a smaller photo is inset below it.",
          pl: "Duże zdjęcie sięga lewej krawędzi, tekst stoi po prawej, a mniejsze zdjęcie jest wpuszczone poniżej.",
        },
      },
      {
        key: "scatter",
        label: {
          sv: "Utspridda foton",
          en: "Scattered photos",
          pl: "Rozrzucone zdjęcia",
        },
        description: {
          sv: "Rubriken står i mitten och små foton ligger utspridda runt omkring. När besökaren rullar växer de fram från mitten och krymper på plats.",
          en: "The headline sits in the middle with small photos spread around it. As the visitor scrolls they grow out from the centre and shrink into place.",
          pl: "Nagłówek stoi na środku, a wokół niego rozrzucone są małe zdjęcia. Gdy gość przewija, wyrastają ze środka i zmniejszają się na swoje miejsca.",
        },
      },
      {
        key: "spotlight",
        label: {
          sv: "Rubrik på foto",
          en: "Heading on photo",
          pl: "Tytuł na zdjęciu",
        },
        description: {
          sv: "Rubriken står stor mitt på bilden med knapparna under, och små etiketter för det ni gör svävar runt den.",
          en: "The headline sits large in the middle of the photo with the buttons below it, and small labels for what you do float around it.",
          pl: "Nagłówek stoi duży na środku zdjęcia, przyciski pod nim, a wokół unoszą się małe etykiety z tym, co robicie.",
        },
      },
      {
        key: "integration-masonry",
        label: {
          sv: "Logotypmosaik",
          en: "Logo mosaic",
          pl: "Mozaika logotypów",
        },
        description: {
          sv: "Rubrik och knapp till vänster med en förskjuten mosaik av kund- eller partnerlogotyper till höger.",
          en: "Heading and button on the left with a staggered mosaic of customer or partner logos on the right.",
          pl: "Nagłówek i przycisk po lewej oraz przesunięta mozaika logotypów klientów lub partnerów po prawej.",
        },
      },
      {
        key: "price-photo",
        label: {
          sv: "Pris och foto",
          en: "Price and photo",
          pl: "Cena i zdjęcie",
        },
        description: {
          sv: "Rubrik, knappar och en valfri prisruta till vänster med ett stort foto till höger.",
          en: "Heading, buttons and an optional price callout on the left with a large photo on the right.",
          pl: "Nagłówek, przyciski i opcjonalna informacja o cenie po lewej oraz duże zdjęcie po prawej.",
        },
      },
      {
        key: "lattice-collage",
        label: {
          sv: "Rutnätskollage",
          en: "Grid collage",
          pl: "Kolaż w siatce",
        },
        description: {
          sv: "Rubrik och knappar till vänster med tre överlappande foton på ett diskret rutnät till höger.",
          en: "Heading and buttons on the left with three overlapping photos on a subtle lattice to the right.",
          pl: "Nagłówek i przyciski po lewej oraz trzy nakładające się zdjęcia na subtelnej siatce po prawej.",
        },
      },
      {
        key: "fan-cards",
        label: {
          sv: "Kort i solfjäder",
          en: "Fanned cards",
          pl: "Karty w wachlarzu",
        },
        description: {
          sv: "Rubrik och knappar centrerat överst med upp till tre bildkort i en solfjäder under.",
          en: "Heading and buttons centred at the top with up to three image cards fanned underneath.",
          pl: "Nagłówek i przyciski wyśrodkowane u góry, a pod nimi do trzech kart ze zdjęciami ułożonych w wachlarz.",
        },
      },
      {
        key: "slideshow",
        label: {
          sv: "Växlande bilder",
          en: "Changing photos",
          pl: "Zmienne zdjęcia",
        },
        description: {
          sv: "Flera foton byter av varandra i helskärm medan rubriken står still nedtill. Besökaren kan dra i sidled eller välja bild med punkterna.",
          en: "Several photos take turns filling the screen while the heading stands still at the bottom. Visitors can drag sideways or pick a photo with the dots.",
          pl: "Kilka zdjęć zmienia się na pełnym ekranie, a nagłówek stoi nieruchomo u dołu. Można przesuwać w bok albo wybrać zdjęcie kropkami.",
        },
      },
      {
        key: "filmstrip",
        label: {
          sv: "Bildremsa",
          en: "Photo strip",
          pl: "Pas zdjęć",
        },
        description: {
          sv: "Rubrik och knappar centrerat överst, och under dem två rader foton som går ut i båda sidkanterna.",
          en: "Heading and buttons centred at the top, and under them two rows of photos that run out to both page edges.",
          pl: "Nagłówek i przyciski wyśrodkowane u góry, a pod nimi dwa rzędy zdjęć wychodzące do obu krawędzi strony.",
        },
      },
      {
        key: "photo-stack",
        label: {
          sv: "Foton på hög",
          en: "Stacked photos",
          pl: "Zdjęcia na stosie",
        },
        description: {
          sv: "Rubrik och knappar centrerat överst, och under dem tre stora foton som överlappar varandra i olika höjd.",
          en: "Heading and buttons centred at the top, and under them three large photos that overlap each other at different heights.",
          pl: "Nagłówek i przyciski wyśrodkowane u góry, a pod nimi trzy duże zdjęcia nachodzące na siebie na różnych wysokościach.",
        },
      },
      {
        key: "photo-stack-left",
        label: {
          sv: "Bildhög, vänster",
          en: "Photo stack, left",
          pl: "Stos z lewej",
        },
        description: {
          sv: "Samma tre överlappande foton som \"Foton på hög\", men rubrik, text och knappar står vänsterställda i stället för centrerat.",
          en: "The same three overlapping photos as \"Stacked photos\", but the heading, text and buttons are ranged left instead of centred.",
          pl: "Te same trzy nachodzące zdjęcia co \"Zdjęcia na stosie\", ale nagłówek, tekst i przyciski są wyrównane do lewej zamiast wyśrodkowane.",
        },
      },
      {
        key: "inline-photos",
        label: {
          sv: "Foton i rubrik",
          en: "Photos in heading",
          pl: "Zdjęcia w tytule",
        },
        description: {
          sv: "Centrerad rubrik där ett par små foton sitter inne i texten, mellan orden. Bäst med en lång rubrik på flera ord.",
          en: "A centred headline with a couple of small photos set inside the text, between the words. Best with a long headline of several words.",
          pl: "Wyśrodkowany nagłówek, w którym kilka małych zdjęć siedzi wewnątrz tekstu, między słowami. Najlepiej przy długim, wielowyrazowym nagłówku.",
        },
      },
      {
        key: "inline-photos-left",
        label: {
          sv: "Fotorubrik vänster",
          en: "Photo heading left",
          pl: "Zdjęcia z lewej",
        },
        description: {
          sv: "Samma foton inne i rubriken som \"Foton i rubrik\", men allt står vänsterställt i stället för centrerat.",
          en: "The same photos inside the heading as \"Photos in heading\", but everything is ranged left instead of centred.",
          pl: "Te same zdjęcia co w \"Zdjęcia w tytule\", ale wszystko jest wyrównane do lewej zamiast wyśrodkowane.",
        },
      },
      {
        key: "facts-panel",
        label: {
          sv: "Foto med faktaruta",
          en: "Photo and fact box",
          pl: "Ramka faktów",
        },
        description: {
          sv: "Fotot fyller hela första vyn med rubriken högt upp, och en ljus ruta i nedre hörnet visar några korta fakta bredvid varandra – till exempel öppettider, år i branschen eller pris från.",
          en: "The photo fills the whole first view with the heading high up, and a light panel in the bottom corner shows a few short facts side by side – opening hours, years in the trade, a from-price.",
          pl: "Zdjęcie wypełnia cały pierwszy widok, nagłówek stoi wysoko, a jasna ramka w dolnym rogu pokazuje kilka krótkich faktów obok siebie – godziny otwarcia, lata w branży, cena od.",
        },
      },
      {
        key: "baseline-cta",
        label: {
          sv: "Rubrik med knapp",
          en: "Button in heading",
          pl: "Przycisk w tytule",
        },
        description: {
          sv: "Fotot fyller hela första vyn och texten står längst ner: en kort inledning överst och därunder en mycket stor rubrik med knappen på samma rad, i slutet av rubriken.",
          en: "The photo fills the whole first view and the text sits at the bottom: a short intro above, and under it a very large heading with the button on the same line, at the end of the heading.",
          pl: "Zdjęcie wypełnia cały pierwszy widok, a tekst stoi na dole: krótkie wprowadzenie u góry, a pod nim bardzo duży nagłówek z przyciskiem w tej samej linii, na jego końcu.",
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
        description: {
          sv: "Tjänsterna som tre kort i bredd. Den vanligaste – bra vid tre till sex tjänster.",
          en: "The services as three cards across. The usual one – good for three to six services.",
          pl: "Usługi jako trzy karty w rzędzie. Najczęstszy – dobry przy trzech do sześciu usługach.",
        },
      },
      {
        key: "grid-2",
        label: { sv: "Två kort", en: "Two cards", pl: "Dwie karty" },
        description: {
          sv: "Två bredare kort i bredd, så varje tjänst får plats med mer text.",
          en: "Two wider cards across, so each service has room for more text.",
          pl: "Dwie szersze karty w rzędzie, więc każda usługa ma miejsce na więcej tekstu.",
        },
      },
      {
        key: "list",
        label: { sv: "Lista", en: "List", pl: "Lista" },
        description: {
          sv: "Tjänsterna under varandra som en lista, med linjer emellan i stället för kort.",
          en: "The services one under the other as a list, with rules between them instead of cards.",
          pl: "Usługi jedna pod drugą jako lista, z liniami między nimi zamiast kart.",
        },
      },
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
        description: {
          sv: "Ett rutnät där varje tjänst har en ikon över namnet – för tjänster utan foton.",
          en: "A grid where each service has an icon over its name – for services with no photos.",
          pl: "Siatka, gdzie każda usługa ma ikonę nad nazwą – dla usług bez zdjęć.",
        },
      },
      {
        key: "numbered",
        label: { sv: "Numrerad", en: "Numbered", pl: "Numerowane" },
        description: {
          sv: "Tjänsterna numrerade 1, 2, 3 – läses som en ordning eller ett upplägg.",
          en: "The services numbered 1, 2, 3 – it reads as an order or a plan.",
          pl: "Usługi ponumerowane 1, 2, 3 – czyta się jak kolejność albo plan.",
        },
      },
      {
        key: "icon-grid-cta",
        requires: { fields: ["footerCta"] },
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
        key: "photo-bento",
        label: {
          sv: "Foton och kort",
          en: "Photos & cards",
          pl: "Zdjęcia i karty",
        },
        description: {
          sv: "Rutnätet varvar foton med texkort som har ikonen i en färgad cirkel uppe till höger. En tjänst med bild blir en bildruta, en utan blir ett kort.",
          en: "The grid alternates photos with text cards that carry their icon in a coloured circle at the top right. A service with a photo becomes a picture tile, one without becomes a card.",
          pl: "Siatka przeplata zdjęcia z kartami tekstowymi, które mają ikonę w kolorowym kółku u góry po prawej. Usługa ze zdjęciem staje się kafelkiem, bez zdjęcia — kartą.",
        },
      },
      {
        key: "media-list",
        label: { sv: "Bild och lista", en: "Photo & list", pl: "Zdjęcie i lista" },
        description: {
          sv: "Ett stort foto tar halva bredden och tjänsterna står som namn med underrubrik i två spalter bredvid, delade av en lodrät linje.",
          en: "One large photo takes half the width and the services stand as names with a subheading in two columns beside it, split by a vertical rule.",
          pl: "Duże zdjęcie zajmuje połowę szerokości, a usługi stoją obok jako nazwy z podtytułem w dwóch kolumnach, rozdzielone pionową linią.",
        },
      },
      {
        key: "ruled-grid",
        label: { sv: "Linjerat rutnät", en: "Ruled grid", pl: "Siatka z liniami" },
        description: {
          sv: "Tjänsterna står två i bredd med hårfina linjer mellan raderna, ikonen till vänster om namnet och kategorin som underrubrik.",
          en: "The services stand two across with hairlines between the rows, the icon to the left of the name and the category as a subheading.",
          pl: "Usługi stoją dwie w rzędzie z cienkimi liniami między wierszami, ikona po lewej od nazwy, a kategoria jako podtytuł.",
        },
      },
      {
        key: "labelled-cards",
        label: {
          sv: "Kort med etikett",
          en: "Labelled cards",
          pl: "Karty z etykietą",
        },
        description: {
          sv: "Varje tjänst blir ett kort med sin kategori i en egen list överst, foto under och en knapp för hela listan bredvid rubriken.",
          en: "Each service becomes a card with its category in a bar across the top, the photo beneath it, and a button for the full list beside the heading.",
          pl: "Każda usługa to karta z kategorią w pasku na górze, zdjęciem pod nim i przyciskiem do pełnej listy obok nagłówka.",
        },
      },
      {
        key: "feature-cards",
        label: {
          sv: "Bild och kort",
          en: "Photo & cards",
          pl: "Zdjęcie i karty",
        },
        description: {
          sv: "Ett stort foto till vänster och tjänsterna som två utförliga kort till höger, med punktlista och knapp i varje.",
          en: "A large photo on the left and the services as two detailed cards on the right, each with a checklist and a button.",
          pl: "Duże zdjęcie po lewej i usługi jako dwie szczegółowe karty po prawej, każda z listą punktów i przyciskiem.",
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
      {
        key: "tiles",
        label: {
          sv: "Bildrutor",
          en: "Photo tiles",
          pl: "Kafle ze zdjęciami",
        },
        description: {
          sv: "Varje tjänst blir en stående bild med namnet skrivet nedtill i bilden. Kräver ett foto per tjänst.",
          en: "Each service becomes a standing photo with its name written across the bottom of the picture. Needs one photo per service.",
          pl: "Każda usługa staje się pionowym zdjęciem z nazwą wpisaną u dołu obrazu. Wymaga jednego zdjęcia na usługę.",
        },
      },
      {
        key: "menu-grid",
        label: {
          sv: "Prislista i rutnät",
          en: "Price grid",
          pl: "Cennik w siatce",
        },
        description: {
          sv: "Tjänsterna står i rutor med hårfina linjer och priset lika stort som namnet – läses som en meny eller prislista.",
          en: "The services sit in hairline-ruled boxes with the price set as large as the name – it reads as a menu or price list.",
          pl: "Usługi w polach obrysowanych cienką linią, z ceną tak dużą jak nazwa – czyta się jak menu lub cennik.",
        },
      },
      {
        key: "linked-cards",
        label: {
          sv: "Länkade kort",
          en: "Linked cards",
          pl: "Połączone karty",
        },
        description: {
          sv: "Tre inramade tjänstekort med en liten kvadratisk bild, där mittkortet står ett steg lägre.",
          en: "Three bordered service cards with a small square image, with the middle card set one step lower.",
          pl: "Trzy obramowane karty usług z małym kwadratowym zdjęciem, ze środkową kartą ustawioną nieco niżej.",
        },
      },
      {
        key: "numbered-cells",
        label: {
          sv: "Numrerade rutor",
          en: "Numbered cells",
          pl: "Numerowane pola",
        },
        description: {
          sv: "Tjänsterna står tre i bredd i rutor med hårfina linjer, var och en numrerad 01, 02, 03. Ingen bild och inget pris – bara namnet och en kort rad om vad det är.",
          en: "Services sit three across in hairline-ruled cells, each numbered 01, 02, 03. No photo and no price – just the name and a short line about it.",
          pl: "Usługi stoją po trzy w rzędzie w polach z cienkimi liniami, każda numerowana 01, 02, 03. Bez zdjęcia i bez ceny – tylko nazwa i krótki opis.",
        },
      },
      {
        key: "price-rows",
        label: {
          sv: "Prisrader",
          en: "Price rows",
          pl: "Wiersze cen",
        },
        description: {
          sv: "Tjänsterna under varandra med en hårfin linje emellan: namnet och en kort rad åt ena hållet, priset åt det andra. Ger du flera tjänster samma kategori får varje grupp sin egen rubrik – som prislistan på väggen i en salong eller klinik.",
          en: "Services under each other with a hairline between them: the name and a short line on one side, the price on the other. Give several services the same category and each group gets its own heading – like the price list on a salon or clinic wall.",
          pl: "Usługi jedna pod drugą z cienką linią pomiędzy: nazwa i krótki opis z jednej strony, cena z drugiej. Nadaj kilku usługom tę samą kategorię, a każda grupa dostanie własny nagłówek – jak cennik na ścianie salonu lub kliniki.",
        },
      },
      {
        key: "photo-pairs",
        label: {
          sv: "Fotopar",
          en: "Photo pairs",
          pl: "Pary ze zdjęciem",
        },
        description: {
          sv: "Två tjänster i bredd med ett högt foto överst, namnet och en pil på samma rad under fotot, och därunder en kort rad och priset. Ingen ram – fotot är kortet. Från fem tjänster blir samma rutor smalare och radas fyra i bredd. Kräver ett foto per tjänst.",
          en: "Two services across with a tall photo on top, the name and an arrow on one line under it, then a short line and the price. No frame – the photo is the card. From five services the same cells narrow and run four across. Needs a photo per service.",
          pl: "Dwie usługi obok siebie z wysokim zdjęciem u góry, nazwą i strzałką w jednym wierszu pod nim, a niżej krótki opis i cena. Bez ramki – zdjęcie jest kartą. Od pięciu usług te same pola zwężają się i układają po cztery w rzędzie. Wymaga zdjęcia przy każdej usłudze.",
        },
      },
    ],
    defaultVariant: "grid-3",
    defaultTone: "light",
    allowedTones: ["light", "clear", "dark", "brand"],
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

  "restaurant-menu": {
    type: "restaurant-menu",
    label: { sv: "Restaurangmeny", en: "Restaurant menu", pl: "Menu restauracji" },
    whenToUse: {
      sv: "Visa restaurangens bekräftade rätter och priser, ordnade i menyer och kategorier.",
      en: "Show the restaurant's confirmed dishes and prices, organized into menus and categories.",
      pl: "Pokaż potwierdzone dania i ceny restauracji, uporządkowane w menu i kategorie.",
    },
    category: "services",
    icon: "ClipboardList",
    variants: [
      {
        key: "columns",
        label: { sv: "Kategorier i spalter", en: "Category columns", pl: "Kategorie w kolumnach" },
        description: {
          sv: "Menyn delas i två spalter, en per kategori – för en meny med många rätter under några få rubriker.",
          en: "The menu splits into columns, one per category – for a menu with many dishes under a few headings.",
          pl: "Menu dzieli się na kolumny, po jednej na kategorię – dla menu z wieloma daniami pod kilkoma nagłówkami.",
        },
      },
      {
        key: "ruled-list",
        label: { sv: "Prislista", en: "Ruled price list", pl: "Cennik z liniami" },
        description: {
          sv: "Varje rätt på en egen rad med priset längst till höger och en tunn linje emellan – som en tryckt meny, och lättast att söka pris i.",
          en: "Every dish on its own row with the price at the end and a hairline between – like a printed menu, and the easiest to scan for a price.",
          pl: "Każde danie we własnym wierszu z ceną na końcu i cienką linią między nimi – jak drukowane menu, najłatwiej szukać ceny.",
        },
      },
      {
        key: "stacked",
        label: { sv: "En spalt", en: "Single column", pl: "Jedna kolumna" },
        description: {
          sv: "Hela menyn i en enda spalt, kategori efter kategori – lättast att läsa på mobil.",
          en: "The whole menu in a single column, category after category – easiest to read on a phone.",
          pl: "Całe menu w jednej kolumnie, kategoria po kategorii – najłatwiej czytać na telefonie.",
        },
      },
      {
        key: "broadsheet",
        label: {
          sv: "Menyblad",
          en: "Menu sheet",
          pl: "Karta menu",
        },
        description: {
          sv: "Hela menyn som ett tryckt blad: kategorierna packas fyra i bredd på stora skärmar, två på surfplatta och en på mobil. För menyn med många korta rubriker – hela utbudet ryms på en sida i stället för en lång rullning.",
          en: "The whole menu as a printed sheet: the categories pack four across on a large screen, two on a tablet and one on a phone. For a menu with many short headings – the entire offer fits on one page instead of one long scroll.",
          pl: "Całe menu jak drukowana karta: kategorie układają się po cztery na dużym ekranie, po dwie na tablecie i po jednej na telefonie. Dla menu z wieloma krótkimi nagłówkami – cała oferta mieści się na jednej stronie zamiast długiego przewijania.",
        },
      },
    ],
    defaultVariant: "columns",
    defaultTone: "light",
    allowedTones: ["light", "clear"],
    // Empty is intentional. Dishes, prices and allergen guidance are owner
    // facts; the add-section fallback must never invent publishable examples.
    defaultContent: (lang) => ({
      type: "restaurant-menu",
      heading: pick(lang, "Meny", "Menu", "Menu"),
      menus: [],
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
        description: {
          sv: "Beskrivningen till vänster och ett foto till höger.",
          en: "The description on the reading side and a photo beside it.",
          pl: "Opis z brzegu, zdjęcie obok.",
        },
      },
      {
        key: "media-left",
        label: { sv: "Bild vänster", en: "Image left", pl: "Zdjęcie po lewej" },
        description: {
          sv: "Samma som \"Bild höger\" men spegelvänd – fotot först.",
          en: "The same as \"Image right\" mirrored – the photo first.",
          pl: "To samo, odbite – najpierw zdjęcie.",
        },
      },
      {
        key: "stacked",
        label: { sv: "Staplad", en: "Stacked", pl: "Jedno pod drugim" },
        description: {
          sv: "Fotot överst och all text under, i en spalt.",
          en: "The photo on top and all the text under it, in one column.",
          pl: "Zdjęcie u góry, cały tekst pod spodem, w jednej kolumnie.",
        },
      },
      {
        key: "bullets-lead",
        label: { sv: "Punkterna först", en: "Checklist first", pl: "Najpierw lista" },
        description: {
          sv: "Det som ingår står först, i en ruta till vänster, med texten bredvid. För en tjänst som jämförs på pris är listan svaret och texten sammanhanget.",
          en: "What is included comes first, in a box on the reading side, with the prose beside it. For a service compared on price the list is the answer and the prose is the context.",
          pl: "To, co wchodzi w cenę, jest pierwsze – w polu z brzegu, z tekstem obok. Przy usłudze porównywanej ceną to lista jest odpowiedzią.",
        },
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
        description: {
          sv: "Er text till vänster och ett foto till höger.",
          en: "Your text on the reading side and a photo beside it.",
          pl: "Wasz tekst z brzegu i zdjęcie obok.",
        },
        // "end" and "plain" first: the photo after the text, on the section
        // background, which is what this cut has always drawn.
        options: {
          assetSide: ["end", "start"],
          surface: ["plain", "card"],
        },
      },
      {
        key: "text-only",
        label: { sv: "Bara text", en: "Text only", pl: "Tylko tekst" },
        description: {
          sv: "Bara texten, utan foto – när orden räcker.",
          en: "The text alone, no photo – for when the words are enough.",
          pl: "Sam tekst, bez zdjęcia – gdy słowa wystarczą.",
        },
      },
      {
        key: "image-left",
        label: { sv: "Bild vänster", en: "Image left", pl: "Zdjęcie po lewej" },
        description: {
          sv: "Samma som \"Text och bild\" men spegelvänd – fotot först.",
          en: "The same as \"Text & image\" mirrored – the photo first.",
          pl: "To samo, odbite – najpierw zdjęcie.",
        },
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
      {
        key: "collage",
        label: { sv: "Collage", en: "Collage", pl: "Kolaż" },
        description: {
          sv: "Rubriken står stor uppe till vänster och två foton ligger förskjutna på var sin sida om texten – ett redaktionellt uppslag.",
          en: "The heading stands large at the top left and two photos sit offset on either side of the text – an editorial spread.",
          pl: "Nagłówek stoi duży u góry po lewej, a dwa zdjęcia leżą przesunięte po obu stronach tekstu – rozkładówka jak w magazynie.",
        },
      },
      {
        key: "split-head",
        label: { sv: "Rubrik och text", en: "Heading & text", pl: "Nagłówek i tekst" },
        description: {
          sv: "Rubriken håller vänsterkanten och texten står till höger, med bilden centrerad under båda. Lång text delas i två spalter.",
          en: "The heading holds the left edge and the text sits on the right, with the photo centred under both. Long text splits into two columns.",
          pl: "Nagłówek trzyma lewą krawędź, tekst stoi po prawej, a zdjęcie jest wyśrodkowane pod nimi. Długi tekst dzieli się na dwie kolumny.",
        },
      },
      {
        key: "stat-chips",
        label: { sv: "Text med sifferbrickor", en: "Text with figure chips", pl: "Tekst z liczbami" },
        description: {
          sv: "Texten står centrerad och siffrorna under den sitter i rundade brickor som radas om efter bredden – lättare än den linjerade raden i \"Berättelse med siffror\".",
          en: "The text is centred and the figures under it sit in rounded chips that wrap – lighter than the ruled row in \"Story with figures\".",
          pl: "Tekst jest wyśrodkowany, a liczby pod nim siedzą w zaokrąglonych plakietkach, które się zawijają – lżej niż liniowany rząd w \"Historii z liczbami\".",
        },
      },
      {
        key: "story-stats",
        label: { sv: "Historia med siffror", en: "Story with figures", pl: "Historia z liczbami" },
        description: {
          sv: "Foto till vänster, historien till höger och ett par siffror under den – för ”så började det”-texten.",
          en: "Photo on the left, the story on the right and a pair of figures under it – for the \u201chow it started\u201d text.",
          pl: "Zdjęcie po lewej, historia po prawej i para liczb pod nią – dla tekstu „jak to się zaczęło”.",
        },
      },
      {
        key: "showcase",
        label: { sv: "Uttalande", en: "Showcase", pl: "Wyróżnione" },
        description: {
          sv: "Bild till vänster och en stor mening till höger, där början står i full färg och resten tonas ner. Plats för en knapp under.",
          en: "A photo on the left and one large sentence on the right, its opening in full colour and the rest faded back. Room for a button underneath.",
          pl: "Zdjęcie po lewej i jedno duże zdanie po prawej – początek w pełnym kolorze, reszta przygaszona. Pod spodem miejsce na przycisk.",
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
      {
        key: "grid",
        label: { sv: "Rutnät", en: "Grid", pl: "Siatka" },
        description: {
          sv: "Alla i ett rutnät med foto, namn och roll under varje.",
          en: "Everyone in a grid with a photo, name and role under each.",
          pl: "Wszyscy w siatce, pod każdym zdjęcie, imię i rola.",
        },
      },
      {
        key: "list",
        label: { sv: "Lista", en: "List", pl: "Lista" },
        description: {
          sv: "Personerna under varandra med ett litet foto vid varje – tar minst plats.",
          en: "The people one under the other with a small photo by each – takes the least room.",
          pl: "Osoby jedna pod drugą, przy każdej małe zdjęcie – zajmuje najmniej miejsca.",
        },
      },
      {
        key: "cards",
        label: { sv: "Kort", en: "Cards", pl: "Karty" },
        description: {
          sv: "Varje person i ett eget kort med kant runt om.",
          en: "Each person in their own card with a border around it.",
          pl: "Każda osoba we własnej karcie z ramką.",
        },
      },
      {
        key: "portrait-reveal",
        label: {
          sv: "Porträtt med presentation",
          en: "Portrait reveal",
          pl: "Portrety z opisem",
        },
        description: {
          sv: "Höga porträttkort visar namn och roll direkt. Presentationen visas på touch och vid fokus eller hovring på större skärmar.",
          en: "Tall portrait cards keep names and roles visible. Bios stay visible on touch and reveal on focus or hover on larger screens.",
          pl: "Wysokie karty portretowe zawsze pokazują imię i stanowisko. Opis jest widoczny na dotyku oraz pojawia się po fokusie lub najechaniu.",
        },
      },
      {
        key: "avatar-roster",
        label: {
          sv: "Luftiga porträtt",
          en: "Avatar roster",
          pl: "Portrety zespołu",
        },
        description: {
          sv: "Stora runda porträtt i en luftig, centrerad presentation.",
          en: "Large circular portraits in an airy, centered roster.",
          pl: "Duże okrągłe portrety w przestronnym, wyśrodkowanym układzie.",
        },
      },
      {
        key: "expanding-strips",
        label: {
          sv: "Expanderande porträtt",
          en: "Expanding portraits",
          pl: "Rozwijane portrety",
        },
        description: {
          sv: "Läsbara porträttkort på mobil och en expanderande porträttrad på större skärmar.",
          en: "Readable portrait cards on phones and an expanding portrait row on larger screens.",
          pl: "Czytelne karty portretowe na telefonie i rozwijany rząd portretów na większych ekranach.",
        },
      },
      {
        key: "portrait-grid",
        label: { sv: "Porträtt i rutnät", en: "Portrait grid", pl: "Siatka portretów" },
        description: {
          sv: "Fyra höga porträtt i bredd med namn och roll centrerat under varje. Alla bilder får samma höjd, så en person utan foto gör inte raden ojämn.",
          en: "Four tall portraits across with the name and role centred under each. Every picture takes the same height, so one person without a photo does not make the row ragged.",
          pl: "Cztery wysokie portrety w rzędzie, pod każdym wyśrodkowane imię i rola. Wszystkie zdjęcia mają tę samą wysokość, więc osoba bez zdjęcia nie psuje rzędu.",
        },
      },
      {
        key: "portrait-grid-start",
        label: {
          sv: "Porträtt i rutnät, vänsterställd",
          en: "Portrait grid, left aligned",
          pl: "Siatka portretów, do lewej",
        },
        description: {
          sv: "Samma fyra porträtt som \"Porträtt i rutnät\", men namn och roll står vänsterställda under bilderna i stället för centrerade.",
          en: "The same four portraits as \"Portrait grid\", but the name and role are ranged left under each picture instead of centred.",
          pl: "Te same cztery portrety co \"Siatka portretów\", ale imię i rola są wyrównane do lewej pod zdjęciami zamiast wyśrodkowane.",
        },
      },
      {
        key: "grid-cta",
        requires: { fields: ["footerCta"] },
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
      {
        key: "portrait-panels",
        label: {
          sv: "Helskärmsporträtt",
          en: "Full-bleed portraits",
          pl: "Portrety na całą szerokość",
        },
        description: {
          sv: "Ett foto per person i full bredd, nästan en skärm högt, med namnet stort mitt i bilden och rollen under. Personerna kommer en i taget när besökaren rullar. Kräver ett stående foto per person – utan foto står namnet på en tonad platta i stället.",
          en: "One full-width photo per person, nearly a screen tall, with the name set large in the middle of the picture and the role under it. The people arrive one at a time as the visitor scrolls. Needs a standing photo per person – without one the name sits on a tinted plate instead.",
          pl: "Jedno zdjęcie na osobę, na całą szerokość i prawie na wysokość ekranu, z imieniem dużą czcionką na środku zdjęcia i rolą pod spodem. Osoby pojawiają się pojedynczo, gdy gość przewija. Wymaga pionowego zdjęcia przy każdej osobie – bez niego imię stoi na przygaszonej płycie.",
        },
      },
      {
        key: "contact-cards",
        label: {
          sv: "Kort med kontaktuppgifter",
          en: "Cards with contact details",
          pl: "Karty z kontaktem",
        },
        description: {
          sv: "Varje person i ett kort med ett litet runt foto, namnet och rollen bredvid, och under en tunn linje personens egen telefon och e-post som klickbara länkar. För er där besökaren ska veta vem hen ska ringa. Utan foto står initialerna i stället.",
          en: "Each person in a card with a small round photo, the name and role beside it, and under a hairline their own phone and email as links to tap. For a team where the visitor needs to know who to call. Without a photo the initials stand there instead.",
          pl: "Każda osoba w karcie z małym okrągłym zdjęciem, imieniem i rolą obok, a pod cienką linią jej własny telefon i e-mail jako klikalne linki. Dla zespołu, w którym gość musi wiedzieć, do kogo zadzwonić. Bez zdjęcia stoją tam inicjały.",
        },
      },
      {
        key: "credential-cards",
        label: {
          sv: "Kort med behörigheter",
          en: "Cards with credentials",
          pl: "Karty z uprawnieniami",
        },
        description: {
          sv: "Varje person i ett kort: kvadratiskt foto överst, namnet, rollen i företagets färg, presentationen och sist behörigheterna som små etiketter. Utan foto står initialerna i stället. För mottagningar och byråer där utbildningen är själva argumentet.",
          en: "Each person in a card: a square photo on top, the name, the role in the brand colour, the bio, and last the qualifications as small chips. Without a photo the initials stand there instead. For practices and firms where the training is the argument.",
          pl: "Każda osoba w karcie: kwadratowe zdjęcie u góry, imię, rola w kolorze firmy, biogram, a na końcu uprawnienia jako małe etykiety. Bez zdjęcia stoją tam inicjały. Dla gabinetów i biur, w których wykształcenie jest argumentem.",
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
      {
        key: "cards",
        label: { sv: "Kort", en: "Cards", pl: "Karty" },
        description: {
          sv: "Omdömena som kort i bredd, ett citat i varje.",
          en: "The reviews as cards across, one quote in each.",
          pl: "Opinie jako karty w rzędzie, w każdej jeden cytat.",
        },
      },
      {
        key: "single",
        label: { sv: "Ett citat", en: "Single quote", pl: "Jedna wypowiedź" },
        description: {
          sv: "Ett enda omdöme, stort och centrerat – när ett räcker.",
          en: "One single review, large and centred – for when one is enough.",
          pl: "Jedna opinia, duża i wyśrodkowana – gdy jedna wystarczy.",
        },
      },
      {
        key: "marquee",
        label: { sv: "Löpande band", en: "Marquee", pl: "Przesuwający się pasek" },
        description: {
          sv: "Omdömena rullar långsamt i sidled – bra när ni har fler än som får plats.",
          en: "The reviews scroll slowly sideways – good when you have more than fit on one screen.",
          pl: "Opinie przesuwają się powoli w bok – dobre, gdy jest ich więcej, niż mieści się na ekranie.",
        },
      },
      {
        key: "portrait",
        label: { sv: "Porträtt", en: "Portrait", pl: "Portret" },
        // NO `assetSide` here on purpose, even though the published layout
        // honours one: this variant's editor-canvas branch is `!edit`, so the
        // canvas draws the card grid instead and the owner would move a control
        // and watch nothing happen. A control that only works on a screen the
        // owner is not looking at is worse than no control. Re-declare it the
        // day the canvas renders the pager.
        description: {
          sv: "Kundens foto står stort till vänster och omdömet stort till höger, ett i taget, med pilar för att bläddra.",
          en: "The customer's photo stands large on the left and the review large on the right, one at a time, with arrows to page through them.",
          pl: "Zdjęcie klienta stoi duże po lewej, a opinia duża po prawej, jedna naraz, ze strzałkami do przewijania.",
        },
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
      {
        key: "ragged",
        label: {
          sv: "Ojämna kort",
          en: "Ragged cards",
          pl: "Nierówne karty",
        },
        description: {
          sv: "Korten får olika bredd och sitter förskjutna i höjd, med ett stort citattecken i hörnet – ser handplacerat ut i stället för uppradat.",
          en: "The cards take different widths and sit at staggered heights, with a large quote mark in the corner – hand-placed rather than lined up.",
          pl: "Karty mają różną szerokość i są przesunięte w pionie, z dużym cudzysłowem w narożniku – wyglądają ułożone ręcznie, a nie w rzędzie.",
        },
      },
      {
        key: "feature-mosaic",
        label: { sv: "Ett omdöme större", en: "One review larger", pl: "Jedna opinia większa" },
        description: {
          sv: "Det första omdömet står stort – över personens foto om det finns ett – och de andra ligger som vanliga kort bredvid. Bra när ett omdöme är starkare än de övriga.",
          en: "The first review is set large – over its author's photo when there is one – and the others sit beside it as ordinary cards. Good when one review is stronger than the rest.",
          pl: "Pierwsza opinia jest duża – na zdjęciu autora, jeśli jest – a pozostałe stoją obok jako zwykłe karty. Dobre, gdy jedna opinia jest mocniejsza od reszty.",
        },
      },
      {
        key: "card-carousel",
        label: {
          sv: "Bläddringsbara kort",
          en: "Card carousel",
          pl: "Karuzela kart",
        },
        description: {
          sv: "Ett till tre omdömeskort i bredd med lugn, manuell bläddring.",
          en: "One to three review cards at a time with calm, manual paging.",
          pl: "Od jednej do trzech kart opinii naraz, ze spokojnym ręcznym przewijaniem.",
        },
      },
      {
        key: "vertical-stack",
        label: {
          sv: "Vertikal kortstapel",
          en: "Vertical card stack",
          pl: "Pionowy stos kart",
        },
        description: {
          sv: "Rubriken står till vänster och omdömena bläddras vertikalt till höger på större skärmar.",
          en: "The heading sits left while reviews scroll vertically on the right on larger screens.",
          pl: "Nagłówek znajduje się po lewej, a opinie przewijają się pionowo po prawej na większych ekranach.",
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
        description: {
          sv: "Bilderna i ett rutnät, tre i bredd.",
          en: "The pictures in a grid, three across.",
          pl: "Zdjęcia w siatce, trzy w rzędzie.",
        },
      },
      {
        key: "grid-4",
        label: { sv: "Fyra i bredd", en: "Four wide", pl: "Cztery w rzędzie" },
        description: {
          sv: "Samma rutnät men fyra i bredd, så varje bild blir mindre.",
          en: "The same grid but four across, so each picture is smaller.",
          pl: "Ta sama siatka, ale cztery w rzędzie, więc każde zdjęcie jest mniejsze.",
        },
      },
      {
        key: "masonry",
        label: { sv: "Tegel", en: "Masonry", pl: "Mozaika" },
        description: {
          sv: "Bilderna behåller sina egna höjder och packas ihop som tegel – bra när de har olika format.",
          en: "The pictures keep their own heights and pack together like brickwork – good when they are different shapes.",
          pl: "Zdjęcia zachowują własne wysokości i układają się jak cegły – dobre przy różnych formatach.",
        },
      },
      {
        key: "carousel",
        label: { sv: "Karusell", en: "Carousel", pl: "Karuzela" },
        description: {
          sv: "En bild i taget som besökaren bläddrar mellan – tar lite plats även med många bilder.",
          en: "One picture at a time that the visitor pages through – takes little room even with many pictures.",
          pl: "Jedno zdjęcie naraz, gość je przewija – zajmuje mało miejsca nawet przy wielu zdjęciach.",
        },
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
      {
        key: "mosaic",
        label: { sv: "Mosaik", en: "Mosaic", pl: "Mozaika kafelkowa" },
        description: {
          sv: "Bilderna varvas i olika storlekar – en bred i mitten på första raden, tre lika stora under.",
          en: "Photos in mixed sizes – one wide image in the middle of the first row, three equal ones below.",
          pl: "Zdjęcia w różnych rozmiarach – jedno szerokie na środku pierwszego rzędu, trzy równe poniżej.",
        },
      },
      {
        key: "lightbox",
        label: {
          sv: "Klicka för stor bild",
          en: "Click to enlarge",
          pl: "Klik, żeby powiększyć",
        },
        description: {
          sv: "Två stora bilder i bredd. Besökaren klickar på en bild för att se den i helskärm och kan sedan bläddra vidare med pilarna eller tangentbordet.",
          en: "Two large photos across. A visitor clicks one to see it full screen, then moves on with the arrows or the keyboard.",
          pl: "Dwa duże zdjęcia w rzędzie. Odwiedzający klika zdjęcie, żeby zobaczyć je na pełnym ekranie, a potem przechodzi dalej strzałkami lub klawiaturą.",
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
        description: {
          sv: "Före och efter bredvid varandra, så båda syns samtidigt.",
          en: "Before and after next to each other, so both are visible at once.",
          pl: "Przed i po obok siebie, oba widoczne naraz.",
        },
      },
      {
        key: "stacked",
        label: { sv: "Staplad", en: "Stacked", pl: "Jedno pod drugim" },
        description: {
          sv: "Före över efter, i en spalt – bra på mobil och för höga bilder.",
          en: "Before above after, in one column – good on a phone and for tall pictures.",
          pl: "Przed nad po, w jednej kolumnie – dobre na telefonie i przy wysokich zdjęciach.",
        },
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
      {
        key: "seam",
        label: { sv: "Skarv", en: "Seam", pl: "Szew" },
        description: {
          sv: "Före och efter ligger kant i kant med en tunn skarv emellan, utan ram och utan mellanrum – paret läses som en enda bild delad på mitten.",
          en: "Before and after butt together with a hairline seam and no gap or frame – the pair reads as one picture split down the middle.",
          pl: "Przed i po stykają się z cienkim szwem, bez ramki i odstępu – para czyta się jak jedno zdjęcie przecięte na pół.",
        },
      },
      {
        key: "slider",
        label: { sv: "Dragreglage", en: "Drag slider", pl: "Suwak" },
        description: {
          sv: "Bilderna ligger ovanpå varandra och besökaren drar en handtagslinje i sidled för att avslöja efterbilden.",
          en: "The two photos lie on top of each other and the visitor drags a handle sideways to reveal the after shot.",
          pl: "Zdjęcia leżą jedno na drugim, a gość przeciąga uchwyt w bok, żeby odsłonić zdjęcie „po”.",
        },
      },
      {
        key: "filtered",
        label: {
          sv: "Filtrerad",
          en: "Filtered",
          pl: "Z filtrem",
        },
        description: {
          sv: "Flera dragreglage i ett rutnät med besökarens egna filterknappar överst – en knapp per grupp du satt på paren. Alla par finns kvar på sidan; filtret döljer bara. Utan grupper blir det ett vanligt rutnät.",
          en: "Several drag sliders in a grid with filter buttons above them – one per group you gave the pairs. Every pair stays on the page; the filter only hides. With no groups it is an ordinary grid.",
          pl: "Kilka suwaków w siatce z przyciskami filtra na górze – po jednym na grupę nadaną parom. Wszystkie pary zostają na stronie; filtr tylko je ukrywa. Bez grup to zwykła siatka.",
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
        description: {
          sv: "Tre paket i bredd med pris och vad som ingår i varje.",
          en: "Three plans across with the price and what is included in each.",
          pl: "Trzy pakiety w rzędzie, w każdym cena i co zawiera.",
        },
      },
      {
        key: "simple-list",
        label: { sv: "Prislista", en: "Price list", pl: "Lista cen" },
        description: {
          sv: "Priserna som en lista, rad för rad – som en prislista på väggen.",
          en: "The prices as a list, row by row – like a price list on the wall.",
          pl: "Ceny jako lista, wiersz po wierszu – jak cennik na ścianie.",
        },
      },
      {
        key: "two-col",
        label: { sv: "Två nivåer", en: "Two tiers", pl: "Dwa pakiety" },
        description: {
          sv: "Två paket i bredd, så varje får mer plats än i tre.",
          en: "Two plans across, so each gets more room than in three.",
          pl: "Dwa pakiety w rzędzie, każdy ma więcej miejsca niż przy trzech.",
        },
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
      {
        key: "lifted-cards",
        label: { sv: "Lyfta kort", en: "Lifted cards", pl: "Uniesione karty" },
        description: {
          sv: "Paketets namn och din egen etikett står på samma rad, meningen om vad paketet är under den, priset stort och knappen längst ner. Det utvalda paketet lyfts med en färgad kant i stället för att bli mörkt.",
          en: "The plan name and your own label share a line, the sentence about what the plan is sits under them, the price is large and the button sits at the foot. The highlighted plan is lifted with a coloured edge instead of turning dark.",
          pl: "Nazwa pakietu i twoja etykieta stoją w jednym wierszu, zdanie o tym, czym pakiet jest, pod nimi, cena duża, a przycisk na dole. Wyróżniony pakiet jest uniesiony kolorową krawędzią, zamiast robić się ciemny.",
        },
      },
      {
        key: "packages",
        label: {
          sv: "Paket",
          en: "Packages",
          pl: "Pakiety",
        },
        description: {
          sv: "Tre paketkort med en ikon överst, priset stort, knappen mitt i kortet och innehållet som en bockad lista under. Det framhävda paketet blir mörkt.",
          en: "Three package cards with an icon on top, the price large, the button in the middle of the card and what is included as a ticked list underneath. The highlighted package turns dark.",
          pl: "Trzy karty pakietów z ikoną na górze, dużą ceną, przyciskiem na środku karty i zawartością jako lista z haczykami poniżej. Wyróżniony pakiet staje się ciemny.",
        },
      },
      {
        key: "rows",
        label: {
          sv: "Breda rader",
          en: "Wide rows",
          pl: "Szerokie wiersze",
        },
        description: {
          sv: "Varje paket får en egen bred rad: namn och pris till vänster, det som ingår till höger. Bra när paketen innehåller mycket.",
          en: "Each plan gets its own wide row: name and price on the left, what's included on the right. Good when the plans contain a lot.",
          pl: "Każdy pakiet ma własny szeroki wiersz: nazwa i cena po lewej, zawartość po prawej. Dobre, gdy pakiety zawierają dużo.",
        },
      },
      {
        key: "offer-cards",
        label: {
          sv: "Erbjudandekort",
          en: "Offer cards",
          pl: "Karty ofert",
        },
        description: {
          sv: "För kampanjer i stället för paket: din egen etikett överst (”Sommar”), namnet och en mening under, och nederst – under en tunn linje – priset stort med knappen bredvid. Ingen bockad lista, så korten håller samma höjd.",
          en: "For campaigns rather than plans: your own label on top (”Summer”), the name and a sentence under it, and at the foot – under a hairline – the price set large with the button beside it. No ticked list, so the cards keep one height.",
          pl: "Dla kampanii zamiast pakietów: własna etykieta u góry („Lato”), nazwa i zdanie pod nią, a na dole – pod cienką linią – duża cena z przyciskiem obok. Bez listy z haczykami, więc karty trzymają jedną wysokość.",
        },
      },
    ],
    defaultVariant: "tiers-3",
    defaultTone: "clear",
    allowedTones: ["light", "clear", "brand"],
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
        description: {
          sv: "Frågorna listade och svaret fälls ut när besökaren klickar – tar minst plats.",
          en: "The questions listed with the answer folding out when the visitor clicks – takes the least room.",
          pl: "Pytania na liście, odpowiedź rozwija się po kliknięciu – zajmuje najmniej miejsca.",
        },
      },
      {
        key: "two-column",
        label: { sv: "Två kolumner", en: "Two columns", pl: "Dwie kolumny" },
        description: {
          sv: "Frågorna i två spalter med svaren synliga direkt – bra vid korta svar.",
          en: "The questions in two columns with the answers showing straight away – good for short answers.",
          pl: "Pytania w dwóch kolumnach, odpowiedzi widoczne od razu – dobre przy krótkich odpowiedziach.",
        },
      },
      {
        key: "cards",
        label: { sv: "Kort", en: "Cards", pl: "Karty" },
        description: {
          sv: "Varje fråga i ett eget kort med kant runt om.",
          en: "Each question in its own card with a border around it.",
          pl: "Każde pytanie we własnej karcie z ramką.",
        },
      },
      {
        key: "accordion-cta",
        requires: { fields: ["footerCta"] },
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
      {
        key: "numbered",
        label: {
          sv: "Numrerade frågor",
          en: "Numbered questions",
          pl: "Numerowane pytania",
        },
        description: {
          sv: "Frågorna numreras och ställs upp i två spalter, så en lång lista syns utan att sidan blir lång.",
          en: "The questions are numbered and set in two columns, so a long list is visible without making the page long.",
          pl: "Pytania są numerowane i ustawione w dwóch kolumnach, więc długa lista jest widoczna bez wydłużania strony.",
        },
      },
      {
        key: "filled-rows",
        label: {
          sv: "Fyllda rader",
          en: "Filled rows",
          pl: "Wypełnione wiersze",
        },
        description: {
          sv: "Varje fråga ligger i en egen tonad ruta med ett plustecken till höger, med luft emellan i stället för linjer.",
          en: "Each question sits in a tinted block of its own with a plus sign on the right, spaced apart instead of ruled.",
          pl: "Każde pytanie leży we własnym przyciemnionym polu z plusem po prawej, oddzielone przestrzenią zamiast liniami.",
        },
      },
      {
        key: "outlined",
        label: { sv: "Ramade rutor", en: "Outlined boxes", pl: "Pola z ramką" },
        description: {
          sv: "Rubriken står centrerad och varje fråga ligger i en egen ruta med tunn ram.",
          en: "The heading is centred and each question sits in a box of its own with a thin outline.",
          pl: "Nagłówek jest wyśrodkowany, a każde pytanie leży we własnym polu z cienką ramką.",
        },
      },
      {
        key: "dashed",
        label: { sv: "Streckad ram", en: "Dashed frame", pl: "Przerywana ramka" },
        description: {
          sv: "Alla frågor ligger innanför en streckad ram och numreras Q1, Q2 – som ett ifyllt formulär.",
          en: "Every question sits inside one dashed frame, numbered Q1, Q2 – like a filled-in form.",
          pl: "Wszystkie pytania są w jednej przerywanej ramce, numerowane Q1, Q2 – jak wypełniony formularz.",
        },
      },
      {
        key: "header-cta",
        label: { sv: "Rubrik med knapp", en: "Heading with button", pl: "Nagłówek z przyciskiem" },
        description: {
          sv: "Rubriken håller vänsterkanten och en knapp står till höger, sedan löper frågorna i två spalter.",
          en: "The heading holds the left edge with a button at the right, then the questions run in two columns.",
          pl: "Nagłówek trzyma lewą krawędź, przycisk stoi po prawej, a pytania biegną w dwóch kolumnach.",
        },
      },
      {
        key: "grouped",
        label: { sv: "Grupperade", en: "Grouped", pl: "Pogrupowane" },
        description: {
          sv: "Frågorna delas i grupper – gruppens namn står till vänster och dess frågor till höger. Sätt en grupp på varje fråga.",
          en: "The questions are split into groups – the group name sits left and its questions right. Give each question a group.",
          pl: "Pytania są podzielone na grupy – nazwa grupy po lewej, pytania po prawej. Nadaj każdemu pytaniu grupę.",
        },
      },
      {
        key: "filtered",
        label: { sv: "Med filter", en: "With filter", pl: "Z filtrem" },
        description: {
          sv: "Besökaren kan filtrera frågorna på grupp. Alla frågor finns kvar på sidan – filtret döljer bara.",
          en: "The visitor can filter the questions by group. Every question stays on the page – the filter only hides.",
          pl: "Odwiedzający może filtrować pytania według grupy. Wszystkie pytania zostają na stronie – filtr tylko ukrywa.",
        },
      },
      {
        key: "beside-photo",
        label: { sv: "Bredvid foto", en: "Beside a photo", pl: "Obok zdjęcia" },
        description: {
          sv: "Frågorna står i en spalt med ett foto bredvid. Utan foto tar frågorna hela bredden.",
          en: "The questions sit in one column with a photo beside them. With no photo they take the full width.",
          pl: "Pytania stoją w jednej kolumnie, obok nich zdjęcie. Bez zdjęcia zajmują całą szerokość.",
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
        description: {
          sv: "Stegen i en rad från vänster till höger, numrerade.",
          en: "The steps in a row from the reading side, numbered.",
          pl: "Kroki w rzędzie, ponumerowane.",
        },
      },
      {
        key: "steps-vertical",
        label: {
          sv: "Steg under varandra",
          en: "Vertical steps",
          pl: "Kroki jeden pod drugim",
        },
        description: {
          sv: "Stegen under varandra – bra när varje steg behöver mer text.",
          en: "The steps one under the other – good when each step needs more text.",
          pl: "Kroki jeden pod drugim – dobre, gdy każdy potrzebuje więcej tekstu.",
        },
      },
      {
        key: "timeline",
        label: { sv: "Tidslinje", en: "Timeline", pl: "Oś czasu" },
        description: {
          sv: "Stegen längs en linje, som en tidslinje – visar att ett följer på ett annat.",
          en: "The steps along a line, as a timeline – it shows that one follows another.",
          pl: "Kroki wzdłuż linii, jak oś czasu – pokazuje, że jedno wynika z drugiego.",
        },
      },
      {
        key: "steps-cta",
        label: {
          sv: "Steg med avslut",
          en: "Steps with a closer",
          pl: "Kroki z zakończeniem",
        },
        description: {
          sv: "De numrerade stegen står i rad och sist i samma rad ligger en mörk ruta med en knapp, så sekvensen slutar i en handling.",
          en: "The numbered steps run in a row, and last in that same row sits a dark card with a button, so the sequence ends in an action.",
          pl: "Numerowane kroki stoją w rzędzie, a na końcu tego samego rzędu leży ciemne pole z przyciskiem, więc sekwencja kończy się działaniem.",
        },
      },
      {
        key: "ruled-rows",
        label: { sv: "Numrerade rader", en: "Numbered rows", pl: "Numerowane wiersze" },
        description: {
          sv: "Varje steg på en egen rad med ett stort nummer till vänster och en tunn linje emellan – läses som en lista att bocka av. Numren räknas om själva om du flyttar ett steg.",
          en: "Each step on its own row with a large number on the reading side and a hairline between – it reads as a list to tick off. The numbers renumber themselves if you move a step.",
          pl: "Każdy krok we własnym wierszu z dużym numerem z brzegu i cienką linią między nimi – czyta się jak listę do odhaczenia. Numery przeliczają się same.",
        },
      },
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
      {
        key: "chips",
        label: { sv: "Etiketter", en: "Chips", pl: "Etykiety" },
        description: {
          sv: "Orterna som små rundade etiketter som radas om efter bredden.",
          en: "The places as small rounded chips that wrap to fit the width.",
          pl: "Miejscowości jako małe zaokrąglone plakietki, które się zawijają.",
        },
      },
      {
        key: "list",
        label: { sv: "Lista", en: "List", pl: "Lista" },
        description: {
          sv: "Orterna under varandra som en lista.",
          en: "The places one under the other as a list.",
          pl: "Miejscowości jedna pod drugą jako lista.",
        },
      },
      {
        key: "columns",
        label: { sv: "Spalter", en: "Columns", pl: "Kolumny" },
        description: {
          sv: "Orterna som en tät lista i flera spalter, uppifrån och ner. För er som täcker många orter – fyrtio etiketter blir en vägg, fyrtio i spalter går att läsa.",
          en: "The places as a dense list in several columns, reading top to bottom. For a trade that covers many towns – forty chips is a wall, forty in columns can be scanned.",
          pl: "Miejscowości jako gęsta lista w kilku kolumnach, od góry do dołu. Dla firm obsługujących wiele miejscowości.",
        },
      },
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
        description: {
          sv: "Formuläret på ena sidan och era kontaktuppgifter på den andra.",
          en: "The form on one side and your contact details on the other.",
          pl: "Formularz z jednej strony, wasze dane kontaktowe z drugiej.",
        },
      },
      {
        key: "info-only",
        label: { sv: "Bara info", en: "Info only", pl: "Tylko dane" },
        description: {
          sv: "Bara kontaktuppgifterna, utan formulär – när ni hellre blir uppringda.",
          en: "The contact details alone, no form – for when you would rather be called.",
          pl: "Same dane kontaktowe, bez formularza – gdy wolicie telefon.",
        },
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
        key: "info-strip",
        label: { sv: "Remsa", en: "Strip", pl: "Pasek" },
        description: {
          sv: "Kontaktvägarna står i en enda rad med varannan ruta tonad, i stället för separata kort.",
          en: "The contact methods sit in one unbroken row with every other cell tinted, instead of separate cards.",
          pl: "Sposoby kontaktu w jednym rzędzie, co druga komórka przyciemniona, zamiast osobnych kart.",
        },
      },
      {
        key: "form-panel",
        label: { sv: "Formulär i ruta", en: "Form in a panel", pl: "Formularz w panelu" },
        description: {
          sv: "Hela formuläret ligger i en egen ruta under en centrerad rubrik. Bra när du frågar om mer än namn och meddelande.",
          en: "The whole form sits in a panel of its own under a centred heading. Good when you ask for more than a name and a message.",
          pl: "Cały formularz w osobnym panelu pod wyśrodkowanym nagłówkiem. Dobre, gdy pytasz o więcej niż imię i wiadomość.",
        },
      },
      {
        key: "form-methods",
        label: { sv: "Formulär och kontaktvägar", en: "Form and contact methods", pl: "Formularz i sposoby kontaktu" },
        description: {
          sv: "Formuläret till vänster och dina kontaktvägar listade till höger – den enda layouten som visar båda.",
          en: "The form on the left and your contact methods listed on the right – the only layout that shows both.",
          pl: "Formularz po lewej, sposoby kontaktu po prawej – jedyny układ pokazujący oba.",
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
      {
        key: "table",
        label: { sv: "Tabell", en: "Table", pl: "Tabela" },
        description: {
          sv: "Alla dagar i en tabell, en rad per dag.",
          en: "Every day in a table, one row per day.",
          pl: "Wszystkie dni w tabeli, jeden wiersz na dzień.",
        },
      },
      {
        key: "compact",
        label: { sv: "Kompakt", en: "Compact", pl: "Zwarte" },
        description: {
          sv: "Tiderna hopslagna så lika dagar står på samma rad – tar mindre plats.",
          en: "The hours grouped so days that match share a row – takes less room.",
          pl: "Godziny zgrupowane, dni takie same w jednym wierszu – zajmuje mniej miejsca.",
        },
      },
      {
        key: "week-strip",
        label: { sv: "Veckoband", en: "Week strip", pl: "Pasek tygodnia" },
        description: {
          sv: "Alla sju dagar bredvid varandra, var och en i en egen ruta med tiden under dagens namn – som skylten på dörren. Radas om till två rader på mobil.",
          en: "All seven days side by side, each in its own cell with the hours under the day name – like the sign on the door. Wraps to two rows on a phone.",
          pl: "Wszystkie siedem dni obok siebie, każdy we własnym polu z godzinami pod nazwą – jak tabliczka na drzwiach. Na telefonie zawija się do dwóch rzędów.",
        },
      },
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
    allowedTones: ["light", "clear", "dark", "brand"],
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
        description: {
          sv: "Adressen i ett kort med en länk som öppnar kartan i besökarens egen app.",
          en: "The address in a card with a link that opens the map in the visitor's own app.",
          pl: "Adres w karcie z linkiem, który otwiera mapę w aplikacji gościa.",
        },
      },
      {
        key: "inline-row",
        label: { sv: "Rad", en: "One line", pl: "Jeden wiersz" },
        description: {
          sv: "Adressen och kartlänken på en enda rad mellan två tunna linjer – för sidan som bara behöver säga var ni finns, till exempel ovanför sidfoten.",
          en: "The address and the map link on a single row between two hairlines – for the page that only needs to say where you are, above the footer say.",
          pl: "Adres i link do mapy w jednym wierszu między dwiema cienkimi liniami – dla strony, która ma tylko powiedzieć, gdzie jesteście.",
        },
      },
      {
        key: "address-only",
        label: { sv: "Bara adress", en: "Address only", pl: "Tylko adres" },
        description: {
          sv: "Bara adressen som text, utan karta eller kort.",
          en: "The address as plain text, with no map and no card.",
          pl: "Sam adres jako tekst, bez mapy i bez karty.",
        },
      },
      {
        // The KEY is historical and no longer describes the layout. It was
        // written when this cut was going to lead with an embedded map; that
        // map was dropped (there is no maps API key at runtime, and the grey
        // placeholder box read as a map that had failed to load), and what
        // remains is a centred address with the link under it.
        //
        // The key is deliberately NOT renamed: it is the stored value on every
        // live section using this layout, so changing it would rewrite customer
        // data to fix a word only developers ever read. The label and
        // description below are what an owner sees, and they are accurate.
        key: "map-first",
        label: { sv: "Centrerad", en: "Centered", pl: "Wyśrodkowany" },
        description: {
          sv: "Adressen ligger centrerad med länken till kartan under.",
          en: "The address is centered with the map link below it.",
          pl: "Adres jest wyśrodkowany, a link do mapy pod nim.",
        },
      },
      {
        key: "branches",
        label: {
          sv: "Flera adresser",
          en: "Several addresses",
          pl: "Kilka adresów",
        },
        description: {
          sv: "För er med mer än ett ställe: varje adress får en egen ruta med sitt namn, sin adress och en kartlänk – och om du vill ett foto, ett telefonnummer och en egen knapp. Två i bredd, tre om ni har fler. Fyller du inte i några ställen visas huvudadressen som vanligt.",
          en: "For a business with more than one place: each address gets its own box with its name, its address and a map link – plus a photo, a phone number and its own button if you want them. Two across, three if you have more. Fill in no places and the main address shows as usual.",
          pl: "Dla firm z więcej niż jednym miejscem: każdy adres dostaje własne pole z nazwą, adresem i linkiem do mapy – a jeśli chcesz, ze zdjęciem, numerem telefonu i własnym przyciskiem. Dwa w rzędzie, trzy przy większej liczbie. Bez wpisanych miejsc pokazuje się główny adres jak zwykle.",
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
      {
        key: "list",
        label: { sv: "Lista", en: "List", pl: "Lista" },
        description: {
          sv: "Behörigheter och medlemskap under varandra som en lista.",
          en: "Certifications and memberships one under the other as a list.",
          pl: "Certyfikaty i członkostwa jedno pod drugim jako lista.",
        },
      },
      {
        key: "grid",
        label: { sv: "Rutnät", en: "Grid", pl: "Siatka" },
        description: {
          sv: "Samma behörigheter i ett rutnät i stället för en lista.",
          en: "The same certifications in a grid instead of a list.",
          pl: "Te same certyfikaty w siatce zamiast listy.",
        },
      },
      {
        key: "badges",
        label: { sv: "Emblem", en: "Badges", pl: "Odznaki" },
        description: {
          sv: "Certifieringarna visas som en enkel rad med emblem.",
          en: "Certifications shown as a simple row of badges.",
          pl: "Certyfikaty pokazane jako prosty rząd odznak.",
        },
      },
      {
        key: "rows",
        label: { sv: "Rader", en: "Rows", pl: "Wiersze" },
        description: {
          sv: "En behörighet per rad med märket till vänster, namnet bredvid och en tunn linje emellan. För er där behörigheterna är själva argumentet.",
          en: "One qualification per row with the mark on the reading side, the name beside it and a hairline between. For a trade whose certifications are the argument.",
          pl: "Jeden certyfikat na wiersz: znak z brzegu, nazwa obok, cienka linia między nimi. Dla firm, dla których certyfikaty są argumentem.",
        },
      },
      {
        key: "ledger",
        label: {
          sv: "Finstilt rad",
          en: "Fine-print row",
          pl: "Drobny wiersz",
        },
        description: {
          sv: "En smal rad mellan två hårfina linjer där behörigheterna står i liten text, avdelade av punkter. Tar nästan ingen höjd – bra direkt under toppen av sidan.",
          en: "A slim row between two hairline rules where the qualifications stand in small type, separated by dots. Takes almost no height – good directly under the top of the page.",
          pl: "Wąski wiersz między dwiema cienkimi liniami, gdzie uprawnienia stoją małym tekstem, rozdzielone kropkami. Zajmuje prawie zero wysokości – dobry pod górą strony.",
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
      {
        key: "stats",
        label: { sv: "Siffror", en: "Stats", pl: "Liczby" },
        description: {
          sv: "Era siffror stort i en rad – år i branschen, antal kunder, det ni själva fyllt i.",
          en: "Your figures set large in a row – years in the trade, customers, whatever you filled in yourself.",
          pl: "Wasze liczby duże w rzędzie – lata w branży, klienci, cokolwiek sami wpiszecie.",
        },
      },
      {
        key: "cards",
        label: { sv: "Kort", en: "Cards", pl: "Karty" },
        description: {
          sv: "Samma siffror men var och en i ett eget kort.",
          en: "The same figures but each in its own card.",
          pl: "Te same liczby, każda we własnej karcie.",
        },
      },
      {
        key: "inline",
        label: { sv: "Rad", en: "Inline", pl: "W jednym rzędzie" },
        description: {
          sv: "Siffrorna visas som en kompakt rad istället för rutor.",
          en: "Numbers shown as one compact line instead of boxed stat cards.",
          pl: "Liczby pokazane w jednym zwartym rzędzie zamiast w kartach.",
        },
      },
      {
        key: "divided",
        label: {
          sv: "Avdelade siffror",
          en: "Divided figures",
          pl: "Liczby z liniami",
        },
        description: {
          sv: "Siffrorna står stora på en rad med hårfina lodräta linjer emellan, utan rutor och utan bakgrund.",
          en: "The figures stand large in one row with hairline vertical rules between them, no boxes and no background.",
          pl: "Liczby stoją duże w jednym rzędzie, rozdzielone cienkimi pionowymi liniami, bez pól i bez tła.",
        },
      },
      {
        key: "split-grid",
        label: {
          sv: "Rubrik och rutnät",
          en: "Heading & grid",
          pl: "Nagłówek i siatka",
        },
        description: {
          sv: "Rubriken håller vänsterkanten och siffrorna ligger som rutor bredvid, två i bredd. Ett avslutande plustecken får företagets färg.",
          en: "The heading holds the left edge and the figures sit beside it as tiles, two across. A trailing plus sign takes the brand colour.",
          pl: "Nagłówek trzyma lewą krawędź, a liczby leżą obok jako kafelki, dwa w rzędzie. Końcowy plus przyjmuje kolor firmy.",
        },
      },
    ],
    defaultVariant: "stats",
    defaultTone: "dark",
    allowedTones: ["light", "clear", "dark", "brand"],
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
      {
        key: "grid",
        label: { sv: "Rutnät", en: "Grid", pl: "Siatka" },
        description: {
          sv: "Era senaste bilder i ett rutnät.",
          en: "Your latest pictures in a grid.",
          pl: "Wasze najnowsze zdjęcia w siatce.",
        },
      },
      {
        key: "row",
        label: { sv: "Rad", en: "Row", pl: "Rząd" },
        description: {
          sv: "Bilderna i en enda rad – tar mindre plats än rutnätet.",
          en: "The pictures in a single row – takes less room than the grid.",
          pl: "Zdjęcia w jednym rzędzie – zajmuje mniej miejsca niż siatka.",
        },
      },
      {
        key: "strip",
        label: { sv: "Remsa", en: "Strip", pl: "Pasek" },
        description: {
          sv: "Bilderna i en enda rad kant i kant, utan mellanrum och utan marginal – blir en yta längst ner på sidan i stället för ett eget avsnitt.",
          en: "The pictures in one edge-to-edge row with no gaps and no margin – it becomes a texture at the foot of the page rather than a section of its own.",
          pl: "Zdjęcia w jednym rzędzie od krawędzi do krawędzi, bez odstępów – to raczej faktura na dole strony niż osobna sekcja.",
        },
      },
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
    // This is the STATIC name, and it only shows in the add-section catalogue
    // and on a band whose buttons say nothing recognisable. Everywhere an
    // owner meets a real one - the page tree, the panel header, the go-to
    // list - `sectionDisplayName` (lib/sections/sectionName.ts) names it after
    // the ask its button makes: "Boka tid", "Begär offert", "Ring oss".
    // "Uppmaning" was jargon and "Nästa steg" said even less (owner directives,
    // 2026-08-16); the catalogue entry now just describes the shape.
    label: { sv: "Rubrik och knapp", en: "Headline and button", pl: "Nagłówek i przycisk" },
    whenToUse: {
      sv: "En tydlig remsa med nästa steg. Använd mellan sektioner för att putta besökaren till handling.",
      en: "A bold call-to-action strip. Use between sections to nudge visitors to act.",
      pl: "Wyraźny pasek z zachętą. Użyj między sekcjami, żeby popchnąć gościa do działania.",
    },
    category: "intro",
    icon: "Megaphone",
    variants: [
      {
        key: "centered",
        label: { sv: "Centrerad", en: "Centered", pl: "Wyśrodkowane" },
        description: {
          sv: "Texten centrerad med knappen under – den enklaste.",
          en: "The ask centred with the button under it – the simplest one.",
          pl: "Zachęta wyśrodkowana z przyciskiem pod spodem – najprostsza.",
        },
      },
      {
        key: "split",
        label: { sv: "Delad", en: "Split", pl: "Podzielone" },
        description: {
          sv: "Texten till vänster och knappen till höger på samma rad.",
          en: "The text on the reading side and the button opposite on the same row.",
          pl: "Tekst z brzegu, przycisk naprzeciw w tym samym rzędzie.",
        },
      },
      {
        key: "gradient",
        label: { sv: "Färgtoning", en: "Gradient", pl: "Przejście kolorów" },
        description: {
          sv: "Ett band i sidans egen färg med en mjuk toning bakom uppmaningen.",
          en: "A band in the site's own colour with a soft gradient behind the ask.",
          pl: "Pas w kolorze strony z miękkim przejściem za zachętą.",
        },
      },
      {
        key: "boxed",
        label: { sv: "I ram", en: "Boxed", pl: "W ramce" },
        description: {
          sv: "Texten ligger i en inramad ruta istället för en bred remsa.",
          en: "The call to action sits inside a bordered card instead of a full-width band.",
          pl: "Zachęta znajduje się w karcie z obramowaniem zamiast na pasku przez całą szerokość.",
        },
      },
      {
        key: "glow-card",
        label: {
          sv: "Ruta med ljussken",
          en: "Card with glow",
          pl: "Karta z poświatą",
        },
        description: {
          sv: "Texten står i en rundad ruta med tunn kant och ett mjukt sken i sidans egen färg bakom sig – som \"I ram\", men upplyst i stället för bara uppritad.",
          en: "The ask sits in a rounded card with a hairline border and a soft wash of the site's own colour behind it – like \"Boxed\", but lit rather than only drawn.",
          pl: "Zachęta stoi w zaokrąglonej karcie z cienką ramką i miękką poświatą w kolorze strony za nią – jak \"W ramce\", ale rozświetlona, a nie tylko obrysowana.",
        },
      },
      {
        key: "ticker-band",
        label: {
          sv: "Foto med löpande rad",
          en: "Photo with running strip",
          pl: "Zdjęcie z przewijanym paskiem",
        },
        description: {
          sv: "Texten ligger över ett foto, och längst ner sitter en rad korta ord som rullar förbi – till exempel \"Fri offert\" eller \"Rutavdrag\". Utan foto visas den vanliga centrerade texten.",
          en: "The ask sits over a photo, with a strip of short phrases scrolling along the bottom edge – \"Free quote\", \"Fixed price\". Without a photo it falls back to the ordinary centred band.",
          pl: "Zachęta leży na zdjęciu, a przy dolnej krawędzi przewija się pasek krótkich haseł – \"Darmowa wycena\", \"Stała cena\". Bez zdjęcia pokazuje zwykły wyśrodkowany pas.",
        },
      },
      {
        key: "showpiece",
        label: { sv: "Mörk ruta", en: "Dark panel", pl: "Ciemne pole" },
        description: {
          sv: "En mörk rundad ruta med luft runt om: liten etikett överst, mycket stor rubrik och två knappar under.",
          en: "A dark rounded box with air around it: a small label on top, a very large heading and two buttons under it.",
          pl: "Ciemne zaokrąglone pole z przestrzenią wokół: mała etykieta na górze, bardzo duży nagłówek i dwa przyciski pod nim.",
        },
      },
      {
        key: "proof-row",
        label: { sv: "Med omdöme", en: "With reassurance", pl: "Z rekomendacją" },
        description: {
          sv: "Centrerad uppmaning med en rad under knapparna: kundbilder, ditt betyg och en egen mening. Allt fyller du i själv – inget räknas ut.",
          en: "A centred ask with one line under the buttons: customer photos, your score and a sentence of your own. You fill all of it in – nothing is worked out for you.",
          pl: "Wyśrodkowane wezwanie z linią pod przyciskami: zdjęcia klientów, twoja ocena i własne zdanie. Wszystko wpisujesz sam – nic nie jest wyliczane.",
        },
      },
      {
        key: "feature-tiles",
        label: { sv: "Med etiketter", en: "With tiles", pl: "Z kafelkami" },
        description: {
          sv: "Texten följs av små rutor som säger vad som ingår. Rutorna är etiketter, inte länkar.",
          en: "The ask is followed by small tiles saying what is included. The tiles are labels, not links.",
          pl: "Po wezwaniu małe kafelki mówiące, co jest w cenie. Kafelki to etykiety, nie linki.",
        },
      },
      {
        key: "slab",
        label: {
          sv: "Mörk platta",
          en: "Dark slab",
          pl: "Ciemna płyta",
        },
        description: {
          sv: "Texten ligger på en mörk, rundad platta med luft runt om, och rubriken, texten och knappen sitter förskjutna mot varandra.",
          en: "The call to action sits on a dark rounded slab with air around it, and the heading, text and button are offset against each other.",
          pl: "Zachęta leży na ciemnej, zaokrąglonej płycie z przestrzenią wokół, a nagłówek, tekst i przycisk są wobec siebie przesunięte.",
        },
      },
    ],
    defaultVariant: "centered",
    defaultTone: "dark",
    allowedTones: ["light", "clear", "dark", "brand"],
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
      {
        key: "button",
        label: { sv: "Knapp", en: "Button", pl: "Przycisk" },
        description: {
          sv: "Bara en knapp som öppnar bokningen – minst möjliga.",
          en: "Just one button that opens booking – the smallest possible.",
          pl: "Tylko przycisk, który otwiera rezerwację – najmniejsze możliwe.",
        },
      },
      {
        key: "banner",
        label: { sv: "Färgat band", en: "Colour band", pl: "Kolorowy pas" },
        description: {
          sv: "Bokningen som ett band i sidans egen färg, centrerat och stort. För sidan vars hela poäng är att man bokar.",
          en: "Booking as a band in the site's own colour, centred and large. For the page whose whole point is that you book.",
          pl: "Rezerwacja jako pas w kolorze strony, wyśrodkowany i duży. Dla strony, której celem jest rezerwacja.",
        },
      },
      {
        key: "inline",
        label: { sv: "Inbäddad", en: "Inline", pl: "Osadzone na stronie" },
        description: {
          sv: "Bokningen visas direkt på sidan i stället för bakom en knapp.",
          en: "Booking shows on the page itself instead of behind a button.",
          pl: "Rezerwacja pokazuje się na stronie zamiast za przyciskiem.",
        },
      },
    ],
    defaultVariant: "inline",
    defaultTone: "clear",
    allowedTones: ["light", "clear", "dark", "brand"],
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
        description: {
          sv: "Fälten under varandra i en spalt – enklast att fylla i på mobil.",
          en: "The fields one under the other in a column – easiest to fill in on a phone.",
          pl: "Pola jedno pod drugim w kolumnie – najłatwiej wypełnić na telefonie.",
        },
      },
      {
        key: "two-column",
        label: { sv: "Två kolumner", en: "Two columns", pl: "Dwie kolumny" },
        description: {
          sv: "Korta fält två och två i bredd, så formuläret blir kortare.",
          en: "Short fields paired two across, so the form is shorter.",
          pl: "Krótkie pola po dwa w rzędzie, więc formularz jest krótszy.",
        },
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
      {
        key: "underline",
        label: {
          sv: "Understrukna fält",
          en: "Underlined fields",
          pl: "Podkreślone pola",
        },
        description: {
          sv: "Fälten markeras bara med en linje under varje rad i stället för hela rutor – ett lugnare formulär som tar mindre plats.",
          en: "The fields are marked only by a line under each row instead of full boxes – a calmer form that takes less room.",
          pl: "Pola oznaczone tylko linią pod każdym wierszem zamiast pełnych ramek – spokojniejszy formularz zajmujący mniej miejsca.",
        },
      },
    ],
    defaultVariant: "stacked",
    defaultTone: "clear",
    allowedTones: ["light", "clear", "dark", "brand"],
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
      {
        key: "card",
        label: { sv: "Kort", en: "Card", pl: "Karta" },
        description: {
          sv: "Frågorna i ett kort med kant, ett steg i taget.",
          en: "The questions in a bordered card, one step at a time.",
          pl: "Pytania w karcie z ramką, krok po kroku.",
        },
      },
      {
        key: "stepper",
        label: { sv: "Med stegräknare", en: "With step index", pl: "Ze wskaźnikiem kroków" },
        description: {
          sv: "Samma frågor, men med en numrerad rad överst som visar hur många steg det är. Den vanligaste orsaken till att någon hoppar av är att de inte vet om det är tre frågor eller trettio.",
          en: "The same questions, with a numbered index on top showing how many steps there are. The commonest reason somebody abandons a quote form is not knowing whether it is three questions or thirty.",
          pl: "Te same pytania, ale z numerowanym paskiem u góry pokazującym liczbę kroków. Najczęstszy powód porzucenia formularza to niewiedza, czy pytań jest trzy czy trzydzieści.",
        },
      },
      {
        key: "inline",
        label: { sv: "Inbäddad", en: "Inline", pl: "Osadzone na stronie" },
        description: {
          sv: "Samma frågor men direkt på sidan, utan kort runt om.",
          en: "The same questions but on the page itself, with no card around them.",
          pl: "Te same pytania wprost na stronie, bez karty wokół.",
        },
      },
    ],
    defaultVariant: "card",
    defaultTone: "clear",
    allowedTones: ["light", "clear", "dark", "brand"],
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
      {
        key: "simple",
        label: { sv: "Enkel", en: "Simple", pl: "Prosta" },
        description: {
          sv: "Företagets namn, en rad om er och länkarna på en enda rad – den minsta sidfoten, för en sajt med få sidor.",
          en: "The business name, one line about you and the links on a single row – the smallest footer, for a site with few pages.",
          pl: "Nazwa firmy, jeden wiersz o was i linki w jednym rzędzie – najmniejsza stopka, dla witryny z kilkoma stronami.",
        },
      },
      {
        key: "columns",
        label: { sv: "Kolumner", en: "Columns", pl: "Kolumny" },
        description: {
          sv: "Länkarna delas upp i spalter med en rubrik över varje – för en sajt med tillräckligt många sidor för att behöva grupperas.",
          en: "The links are split into columns with a heading over each – for a site with enough pages to need grouping.",
          pl: "Linki podzielone na kolumny z nagłówkiem nad każdą – dla witryny z tyloma stronami, że trzeba je pogrupować.",
        },
      },
      {
        key: "centered",
        label: { sv: "Centrerad", en: "Centered", pl: "Wyśrodkowana" },
        description: {
          sv: "Allt centrerat i mitten – namn, länkar och juridisk text under varandra.",
          en: "Everything centred – name, links and legal text one under the other.",
          pl: "Wszystko wyśrodkowane – nazwa, linki i tekst prawny jedno pod drugim.",
        },
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
      {
        key: "ruled",
        label: { sv: "Linjerad", en: "Ruled", pl: "Z liniami" },
        description: {
          sv: "En tunn linje överst och underst, namnet och en stor avslutande mening till vänster, kontakt och länkar i spalter till höger.",
          en: "A thin rule top and bottom, the name and one large closing line on the left, contact details and links in columns on the right.",
          pl: "Cienka linia na górze i na dole, nazwa i jedno duże zdanie na zakończenie po lewej, kontakt i odnośniki w kolumnach po prawej.",
        },
      },
      {
        key: "inset",
        label: { sv: "Infälld ruta", en: "Inset box", pl: "Wpuszczone pole" },
        description: {
          sv: "Sidfoten ligger i en egen rundad ruta med luft runt om i stället för att gå ut i kanten. Namnet står stort till vänster och länkarna i spalter till höger.",
          en: "The footer sits in a rounded box of its own with air around it instead of running to the page edge. The name stands large on the left and the links in columns on the right.",
          pl: "Stopka leży we własnym zaokrąglonym polu z przestrzenią wokół, zamiast wychodzić do krawędzi. Nazwa stoi duża po lewej, a odnośniki w kolumnach po prawej.",
        },
      },
      {
        key: "newsletter-box",
        requires: { fields: ["newsletter"] },
        label: {
          sv: "Nyhetsbrev och länkar",
          en: "Newsletter and links",
          pl: "Newsletter i linki",
        },
        description: {
          sv: "Företagsnamn och ett e-postfält står till vänster, länkar i spalter till höger och den juridiska raden centrerad längst ner i en gemensam ruta.",
          en: "The business name and an email signup sit on the left, link columns on the right, and the legal line is centred at the bottom of one shared box.",
          pl: "Nazwa firmy i zapis e-mail są po lewej, kolumny linków po prawej, a wiersz prawny jest wyśrodkowany na dole wspólnej ramki.",
        },
      },
      {
        key: "promo-newsletter",
        requires: { fields: ["newsletter", "promo", "contactLabel"] },
        label: {
          sv: "Kontakt och nyhetsbrev",
          en: "Contact and newsletter",
          pl: "Kontakt i newsletter",
        },
        description: {
          sv: "En stor kontaktyta följs av e-post, nyhetsbrev, länkar och juridisk text i en sammanhållen sidfot.",
          en: "A large contact banner is followed by email, newsletter signup, links, and legal copy in one continuous footer.",
          pl: "Duży baner kontaktowy łączy się z e-mailem, newsletterem, linkami i informacją prawną w jednej stopce.",
        },
      },
      {
        key: "photo-newsletter",
        requires: { fields: ["newsletter"] },
        label: {
          sv: "Foto och nyhetsbrev",
          en: "Photo and newsletter",
          pl: "Zdjęcie i newsletter",
        },
        description: {
          sv: "Ett brett foto följs av företagets namn, fyra länkspalter, ett nyhetsbrevsfält och en juridisk rad i en sammanhållen sidfot.",
          en: "A wide photo is followed by the business name, four link columns, a newsletter signup, and a legal line in one continuous footer.",
          pl: "Szerokie zdjęcie łączy się z nazwą firmy, czterema kolumnami linków, zapisem do newslettera i wierszem prawnym w jednej stopce.",
        },
      },
      {
        key: "wordmark-newsletter",
        requires: { fields: ["newsletter"] },
        label: {
          sv: "Ordmärke och nyhetsbrev",
          en: "Wordmark and newsletter",
          pl: "Nazwa i newsletter",
        },
        description: {
          sv: "En rundad färgyta samlar företagets namn, tre länkspalter, nyhetsbrev och kontakt, med ett mycket stort beskuret ordmärke längst ner.",
          en: "A rounded colour panel holds the business name, three link columns, newsletter and contact details, ending in a huge cropped wordmark.",
          pl: "Zaokrąglony panel łączy nazwę firmy, trzy kolumny linków, newsletter i kontakt, a na dole kończy się ogromną przyciętą nazwą.",
        },
      },
      {
        key: "wordmark-cta",
        requires: { fields: ["promo"] },
        label: {
          sv: "Ordmärke och knapp",
          en: "Wordmark and button",
          pl: "Nazwa i przycisk",
        },
        description: {
          sv: "En sidfot med rundad ovankant, beskrivning och knapp till vänster, fyra länkspalter till höger och företagets namn mycket stort längst ner.",
          en: "A top-rounded footer with a description and button on the left, four link columns on the right, and the business name set very large along the bottom.",
          pl: "Stopka zaokrąglona u góry, z opisem i przyciskiem po lewej, czterema kolumnami linków po prawej i bardzo dużą nazwą firmy na dole.",
        },
      },
      {
        key: "wordmark-contact",
        label: {
          sv: "Ordmärke och kontakt",
          en: "Wordmark and contact",
          pl: "Nazwa i kontakt",
        },
        description: {
          sv: "Företagets namn, beskrivning och riktiga e-post står till vänster, tre länkspalter till höger och ett tonat stort ordmärke längst ner mellan streckade linjer.",
          en: "The business name, description, and real email sit on the left, three link columns on the right, and a tinted giant wordmark closes the dashed frame.",
          pl: "Nazwa firmy, opis i prawdziwy e-mail są po lewej, trzy kolumny linków po prawej, a cieniowana duża nazwa zamyka przerywaną ramę.",
        },
      },
      {
        key: "brand-directory",
        label: {
          sv: "Företagsspalt och länkar",
          en: "Brand column and links",
          pl: "Kolumna marki i linki",
        },
        description: {
          sv: "Företagets namn, en kort rad om er och kontaktuppgiften står i en egen spalt längst till vänster, med länkspalterna bredvid.",
          en: "The business name, one short line about you and the contact detail sit in their own column on the reading side, with the link columns beside them.",
          pl: "Nazwa firmy, jedno krótkie zdanie o was i dane kontaktowe stoją we własnej kolumnie z brzegu, a kolumny linków obok nich.",
        },
      },
      {
        key: "newsletter-lede",
        requires: { fields: ["newsletter"] },
        label: {
          sv: "Nyhetsbrev överst",
          en: "Newsletter first",
          pl: "Newsletter na górze",
        },
        description: {
          sv: "Anmälan till nyhetsbrevet ligger överst i sidfoten under en egen linje, och under den står den avslutande raden med sin knapp bredvid länkspalterna.",
          en: "The newsletter signup runs across the top of the footer under its own rule, and below it the closing line and its button sit beside the link columns.",
          pl: "Zapis do newslettera biegnie u góry stopki pod własną linią, a pod nim zdanie zamykające z przyciskiem stoi obok kolumn linków.",
        },
      },
      {
        key: "wordmark-directory",
        label: {
          sv: "Ordmärke och katalog",
          en: "Wordmark and directory",
          pl: "Nazwa i katalog",
        },
        description: {
          sv: "En separat namnrad följs av fyra tydliga länkspalter, ett mycket stort företagsnamn och juridisk text längst ner.",
          en: "A separate brand row is followed by four clear link columns, a very large business name, and legal copy at the bottom.",
          pl: "Oddzielny wiersz marki prowadzi do czterech kolumn linków, bardzo dużej nazwy firmy i tekstu prawnego na dole.",
        },
      },
      {
        key: "backdrop-newsletter",
        requires: { fields: ["newsletter"] },
        label: {
          sv: "Bakgrundsbild och nyhetsbrev",
          en: "Backdrop and newsletter",
          pl: "Tło i newsletter",
        },
        description: {
          sv: "En stor bakgrundsbild fyller hela sidfoten med tydliga sidlänkar, nyhetsbrev, ett mycket stort företagsnamn och juridisk text ovanpå.",
          en: "A large background image fills the footer with prominent page links, newsletter signup, a very large business name, and legal copy layered above it.",
          pl: "Duże zdjęcie wypełnia stopkę, a na nim znajdują się wyraźne linki, zapis do newslettera, bardzo duża nazwa firmy i tekst prawny.",
        },
      },
      {
        key: "photo-directory-cta",
        requires: { fields: ["promo"] },
        label: {
          sv: "Foto, katalog och knapp",
          en: "Photo, directory and CTA",
          pl: "Zdjęcie, katalog i przycisk",
        },
        description: {
          sv: "Ett brett foto följs av företagsbeskrivning och knapp, upp till fyra länkgrupper och juridisk text.",
          en: "A wide photo leads into a business description and CTA, up to four link groups, and legal copy.",
          pl: "Szerokie zdjęcie prowadzi do opisu firmy i przycisku, maksymalnie czterech grup linków oraz tekstu prawnego.",
        },
      },
      {
        key: "nested-card",
        label: { sv: "Kort i kort", en: "Nested card", pl: "Karta w karcie" },
        description: {
          sv: "Ett inramat kort med logotyp och beskrivning till vänster, tre länkgrupper till höger och juridisk text i en egen bottenrad.",
          en: "A framed card with logo and description on the left, three link groups on the right, and legal copy in its own bottom rail.",
          pl: "Obramowana karta z logo i opisem po lewej, trzema grupami linków po prawej i tekstem prawnym w osobnym dolnym pasku.",
        },
      },
      {
        key: "backdrop-contact",
        label: { sv: "Bakgrund och kontakt", en: "Backdrop and contact", pl: "Tło i kontakt" },
        description: {
          sv: "En stor bakgrundsbild med en mycket stor e-postlänk, företagsuppgifter, sidlänkar och juridisk text ovanpå.",
          en: "A large background image with an oversized email link, business details, page links, and legal copy layered above it.",
          pl: "Duże zdjęcie w tle z bardzo dużym adresem e-mail, danymi firmy, linkami i tekstem prawnym.",
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
      {
        key: "document",
        label: { sv: "Dokument", en: "Document", pl: "Dokument" },
        description: {
          sv: "Villkoren som ett vanligt dokument med rubriker och stycken.",
          en: "The terms as an ordinary document with headings and paragraphs.",
          pl: "Regulamin jako zwykły dokument z nagłówkami i akapitami.",
        },
      },
      {
        key: "centered",
        label: { sv: "Centrerad", en: "Centered", pl: "Wyśrodkowany" },
        description: {
          sv: "Samma text men centrerad och smalare – för korta villkor.",
          en: "The same text but centred and narrower – for short terms.",
          pl: "Ten sam tekst, wyśrodkowany i węższy – dla krótkich warunków.",
        },
      },
      {
        key: "columns",
        label: { sv: "Två spalter", en: "Two columns", pl: "Dwie kolumny" },
        description: {
          sv: "Samma text men i två spalter på breda skärmar, så halva rullningen försvinner. På mobil blir det en spalt.",
          en: "The same text in two columns on wide screens, which halves the scroll. One column on a phone.",
          pl: "Ten sam tekst w dwóch kolumnach na szerokich ekranach, co skraca przewijanie o połowę. Na telefonie jedna kolumna.",
        },
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
      {
        key: "row",
        label: { sv: "Rad", en: "Row", pl: "Rząd" },
        description: {
          sv: "Logotyperna på en enda rad, jämnt fördelade.",
          en: "The logos on a single row, evenly spread.",
          pl: "Logotypy w jednym rzędzie, równo rozłożone.",
        },
      },
      {
        key: "grid",
        label: { sv: "Rutnät", en: "Grid", pl: "Siatka" },
        description: {
          sv: "Logotyperna i ett rutnät – bra när de är fler än som får plats på en rad.",
          en: "The logos in a grid – good when there are more than fit on one row.",
          pl: "Logotypy w siatce – dobre, gdy jest ich więcej, niż mieści się w rzędzie.",
        },
      },
      {
        key: "marquee",
        label: { sv: "Löpande band", en: "Marquee", pl: "Przesuwający się pasek" },
        description: {
          sv: "Logotyperna rullar kontinuerligt i en rad – bra när det är fler logotyper än vad som får plats.",
          en: "Logos scroll continuously in a row – good for more logos than fit on one screen.",
          pl: "Logotypy przesuwają się bez przerwy w jednym rzędzie – dobre, gdy jest ich więcej, niż mieści się na ekranie.",
        },
      },
      {
        key: "ruled-row",
        label: { sv: "Rad med linjer", en: "Ruled row", pl: "Rząd z liniami" },
        description: {
          sv: "Logotyperna på en rad med tunna linjer emellan och linjer över och under – blir ett register i stället för logotyper som råkat hamna på rad.",
          en: "The logos on a row with hairlines between them and rules above and below – it becomes a register rather than logos that happened to land in a line.",
          pl: "Logotypy w rzędzie z cienkimi liniami między nimi oraz nad i pod – to rejestr, a nie logotypy, które przypadkiem trafiły w rząd.",
        },
      },
      {
        key: "numbered-grid",
        label: {
          sv: "Numrerat rutnät",
          en: "Numbered grid",
          pl: "Numerowana siatka",
        },
        description: {
          sv: "Rubriken står som en liten etikett i mitten och logotyperna ligger i numrerade rutor med tunna linjer emellan.",
          en: "The heading sits centred as a small pill and the logos fill numbered cells divided by hairlines.",
          pl: "Nagłówek stoi na środku jako mała etykieta, a logotypy wypełniają numerowane pola oddzielone cienkimi liniami.",
        },
      },
    ],
    defaultVariant: "row",
    defaultTone: "clear",
    allowedTones: ["light", "clear", "dark", "brand"],
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
        description: {
          sv: "Tre punkter i bredd, var och en med ikon, rubrik och en rad.",
          en: "Three points across, each with an icon, a heading and one line.",
          pl: "Trzy punkty w rzędzie, każdy z ikoną, nagłówkiem i jednym wierszem.",
        },
      },
      {
        key: "grid-2",
        label: { sv: "Två kort", en: "Two cards", pl: "Dwie karty" },
        description: {
          sv: "Två bredare punkter i bredd, med plats för mer text i varje.",
          en: "Two wider points across, with room for more text in each.",
          pl: "Dwa szersze punkty w rzędzie, z miejscem na więcej tekstu.",
        },
      },
      {
        key: "alternating",
        label: { sv: "Varannan rad", en: "Alternating", pl: "Naprzemiennie" },
        description: {
          sv: "Punkterna varannan gång åt vänster och åt höger, med bild i varje.",
          en: "The points alternate side to side down the page, each with a picture.",
          pl: "Punkty na przemian z jednej i drugiej strony, każdy ze zdjęciem.",
        },
        // Which side the FIRST row's photo takes; the alternation is unchanged.
        // "start" first = the first photo before its text, as today.
        options: { assetSide: ["start", "end"] },
      },
      {
        key: "icon-list",
        label: { sv: "Ikonlista", en: "Icon list", pl: "Lista z ikonami" },
        description: {
          sv: "Punkterna som en lista med en ikon framför varje rad.",
          en: "The points as a list with an icon in front of each row.",
          pl: "Punkty jako lista z ikoną przed każdym wierszem.",
        },
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
      {
        key: "header-action",
        label: { sv: "Rubrik med knapp", en: "Heading with button", pl: "Nagłówek z przyciskiem" },
        description: {
          sv: "Rubriken och raden under står till vänster med knappen längst till höger på samma linje, och därunder två breda kort. Skriver du en kort rad per kort hamnar den längst ner i kortet – till exempel \"Från 1 200 kr\".",
          en: "The heading and its line sit on the reading side with the button on the far side of the same line, and two wide cards underneath. A short line written on a card prints at its foot – \"From 1 200 kr\", say.",
          pl: "Nagłówek i wiersz pod nim stoją z brzegu, przycisk po drugiej stronie tej samej linii, a pod nimi dwie szerokie karty. Krótki wiersz wpisany na karcie ląduje na jej dole.",
        },
      },
      {
        key: "icon-circles",
        label: { sv: "Ikoner i cirklar", en: "Icons in circles", pl: "Ikony w kółkach" },
        description: {
          sv: "Tonade kort i tre spalter, var och en med sin ikon i en fylld cirkel överst.",
          en: "Tinted cards in three columns, each with its icon in a filled circle on top.",
          pl: "Przyciemnione karty w trzech kolumnach, każda z ikoną w wypełnionym kółku na górze.",
        },
      },
      {
        key: "split-icons",
        label: {
          sv: "Rubrik och ikoner",
          en: "Heading & icons",
          pl: "Nagłówek i ikony",
        },
        description: {
          sv: "Rubriken och en knapp håller vänsterkanten medan fördelarna står som ikonpar till höger, två i bredd.",
          en: "The heading and a button hold the left edge while the benefits stand as icon pairs on the right, two across.",
          pl: "Nagłówek i przycisk trzymają lewą krawędź, a zalety stoją po prawej jako pary z ikonami, dwie w rzędzie.",
        },
      },
      {
        key: "values",
        label: { sv: "Värderingar", en: "Values", pl: "Wartości" },
        description: {
          sv: "Två breda textkort under varandra till vänster och ett stort foto bredvid – för längre stycken som mission och vision.",
          en: "Two wide text cards stacked on the left with one large photo beside them – for longer passages like a mission and a vision.",
          pl: "Dwie szerokie karty tekstowe jedna pod drugą po lewej i duże zdjęcie obok – dla dłuższych tekstów, jak misja i wizja.",
        },
      },
      {
        key: "figures",
        label: { sv: "Siffror i färg", en: "Figures in colour", pl: "Liczby w kolorze" },
        description: {
          sv: "Ett foto bredvid två fyllda färgrutor med stora tal, och en större textrad under hela raden.",
          en: "A photo beside two colour-filled tiles with large numbers, and one larger line of text under the whole row.",
          pl: "Zdjęcie obok dwóch wypełnionych kolorem kafelków z dużymi liczbami i jedno większe zdanie pod całym rzędem.",
        },
      },
      {
        key: "stat-cards",
        label: { sv: "Sifferkort", en: "Stat cards", pl: "Karty z liczbami" },
        description: {
          sv: "För siffror: rubriken sätts stor som ett tal och texten under blir dess etikett. En fördel med foto blir en bildruta i samma rad.",
          en: "For numbers: the title is set large like a figure and the text below becomes its label. A highlight with a photo becomes an image tile in the same row.",
          pl: "Dla liczb: tytuł jest duży jak liczba, a tekst pod nim staje się podpisem. Zaleta ze zdjęciem zamienia się w kafelek w tym samym rzędzie.",
        },
      },
      {
        key: "chip-cards",
        label: { sv: "Kort med etikett", en: "Cards with a label", pl: "Karty z etykietą" },
        description: {
          sv: "Ramade kort med ikonen i en rundad ruta och en liten etikett längst ner (”Ingår alltid”). Etiketten visas bara om du skriver en.",
          en: "Outlined cards with the icon in a rounded square and a small label along the bottom (“Always included”). The label only shows if you write one.",
          pl: "Karty z ramką, ikona w zaokrąglonym kwadracie i mała etykieta na dole („Zawsze w cenie”). Etykieta pojawia się tylko wtedy, gdy ją wpiszesz.",
        },
      },
      {
        key: "checklist",
        label: { sv: "Checklista", en: "Checklist", pl: "Lista kontrolna" },
        description: {
          sv: "Rubrik, en prickad lista och en knapp till vänster, med sektionens foto bredvid. Håll punkterna korta.",
          en: "Heading, a marked list and a button on the left with the section photo beside them. Keep the points short.",
          pl: "Nagłówek, lista z punktorami i przycisk po lewej, obok zdjęcie sekcji. Punkty trzymaj krótkie.",
        },
      },
      {
        key: "panel-cards",
        label: { sv: "Kort med bild", en: "Cards with a photo", pl: "Karty ze zdjęciem" },
        description: {
          sv: "Två breda kort där varje fördel avslutas med sitt eget foto. En fördel utan foto blir ett rent textkort.",
          en: "Two wide cards where each highlight closes on its own photo. A highlight with no photo stays a plain text card.",
          pl: "Dwie szerokie karty, każda zaleta kończy się własnym zdjęciem. Zaleta bez zdjęcia zostaje kartą tekstową.",
        },
      },
      {
        key: "pillars",
        // Which side the FIRST pillar's photo takes; the alternation is
        // unchanged. "start" first = the first photo before its text, as today.
        options: { assetSide: ["start", "end"] },
        label: {
          sv: "Numrerade avsnitt",
          en: "Numbered sections",
          pl: "Numerowane sekcje",
        },
        description: {
          sv: "Varje fördel får ett stort eget foto och en numrerad rad ovanför texten, och bilden byter sida för varje fördel.",
          en: "Each highlight gets its own large photo and a numbered line above the text, and the photo swaps side for each one.",
          pl: "Każda zaleta ma własne duże zdjęcie i numerowany wiersz nad tekstem, a zdjęcie zmienia stronę przy każdej z nich.",
        },
      },
      {
        key: "accent",
        label: {
          sv: "En ruta i färg",
          en: "One cell in colour",
          pl: "Jedno pole w kolorze",
        },
        description: {
          sv: "Samma rutnät som \"Tre kort\", men den sista rutan fylls med sajtens huvudfärg så ögat landar där.",
          en: "The same grid as \"Three cards\", but the last cell is filled with the site's main colour so the eye lands there.",
          pl: "Ta sama siatka co \"Trzy karty\", ale ostatnie pole wypełnione głównym kolorem strony, żeby wzrok tam trafiał.",
        },
      },
      {
        key: "ruled-columns",
        label: {
          sv: "Numrerade spalter",
          en: "Numbered columns",
          pl: "Numerowane kolumny",
        },
        description: {
          sv: "Två eller tre spalter delade av hårfina lodräta linjer, var och en med sitt nummer, sin rubrik i stor grad och en kort text under. Inga kort och inga ikoner.",
          en: "Two or three columns split by hairline vertical rules, each with its number, its heading set large and a short line beneath. No cards and no icons.",
          pl: "Dwie lub trzy kolumny rozdzielone cienkimi pionowymi liniami, każda z numerem, dużym nagłówkiem i krótkim tekstem pod nim. Bez kart i bez ikon.",
        },
      },
      {
        key: "credo",
        label: {
          sv: "Ledord",
          en: "Guiding words",
          pl: "Motta",
        },
        description: {
          sv: "Spalter mellan två hårfina linjer där den lilla etiketten står i företagets färg och SJÄLVA MENINGEN sätts stor. För tre korta löften eller ledord, inte för längre text.",
          en: "Columns between two hairline rules where the small label takes the brand colour and THE SENTENCE ITSELF is set large. For three short promises or guiding words, not for longer text.",
          pl: "Kolumny między dwiema cienkimi liniami, gdzie mała etykieta ma kolor firmy, a SAMO ZDANIE jest duże. Dla trzech krótkich obietnic lub motta, nie dla dłuższego tekstu.",
        },
      },
      {
        key: "check-columns",
        label: {
          sv: "Bockade spalter",
          en: "Ticked columns",
          pl: "Kolumny z haczykami",
        },
        description: {
          sv: "Två eller tre spalter, var och en med sin rubrik, en rad text och en bockad lista under. För det som gäller före och efter – till exempel inför och efter en behandling.",
          en: "Two or three columns, each with its own heading, one line of text and a ticked list under it. For what applies before and after – ahead of a treatment and after it, for instance.",
          pl: "Dwie lub trzy kolumny, każda z własnym nagłówkiem, jednym wierszem tekstu i listą z haczykami pod spodem. Do tego, co obowiązuje przed i po – na przykład przed zabiegiem i po nim.",
        },
      },
      {
        key: "ruled-tiles",
        label: {
          sv: "Rutade fält",
          en: "Ruled tiles",
          pl: "Kafelki w siatce",
        },
        description: {
          sv: "Punkterna ligger i ett rutnät utan mellanrum, delade av hårfina linjer, var och en med sin ikon i en tonad ruta, rubriken och en rad under. Läses som en enda tabell i stället för som lösa kort – bra direkt under toppen av sidan.",
          en: "The points sit in a grid with no gutters, divided by hairlines, each with its icon in a tinted square, the heading and one line under it. Reads as one table rather than as loose cards – good directly under the top of the page.",
          pl: "Punkty leżą w siatce bez odstępów, rozdzielone cienkimi liniami, każdy z ikoną w przygaszonym kwadracie, nagłówkiem i jednym wierszem pod spodem. Czyta się jak jedna tabela, a nie luźne karty – dobre tuż pod górą strony.",
        },
      },
      {
        key: "icon-row",
        label: {
          sv: "Ikonrad",
          en: "Icon row",
          pl: "Rząd ikon" ,
        },
        description: {
          sv: "En tät rad små rutor: ikonen i en tonad kvadrat, rubriken under och en kort rad om du skriver en. Två i bredd på mobil, upp till fyra på stora skärmar – för fem korta trygghetslöften i rad, inte för längre text.",
          en: "A tight row of small cells: the icon in a tinted square, the heading under it and a short line if you write one. Two across on a phone, up to four on a large screen – for a handful of short reassurances in a row, not for longer text.",
          pl: "Ciasny rząd małych pól: ikona w przygaszonym kwadracie, nagłówek pod nią i krótki wiersz, jeśli go napiszesz. Dwa w rzędzie na telefonie, do czterech na dużym ekranie – dla kilku krótkich zapewnień, nie dla dłuższego tekstu.",
        },
      },
    ],
    defaultVariant: "grid-3",
    defaultTone: "light",
    allowedTones: ["light", "clear", "dark", "brand"],
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
      {
        key: "bento",
        label: { sv: "Bento", en: "Bento", pl: "Mozaika" },
        description: {
          sv: "Rutor i olika storlekar som fyller ytan – den stora först.",
          en: "Tiles of different sizes filling the area – the large one first.",
          pl: "Kafelki różnej wielkości wypełniające obszar – najpierw duży.",
        },
      },
      {
        key: "uniform",
        label: { sv: "Jämn", en: "Uniform", pl: "Równe karty" },
        description: {
          sv: "Samma rutnät men alla rutor lika stora.",
          en: "The same grid but every tile the same size.",
          pl: "Ta sama siatka, ale wszystkie kafelki równe.",
        },
      },
      {
        key: "list",
        label: { sv: "Stora rader", en: "Large rows", pl: "Duże rzędy" },
        description: {
          sv: "Höjdpunkterna visas som en lugn vertikal följd av stora kort.",
          en: "Highlights appear as a calm vertical sequence of large cards.",
          pl: "Najważniejsze rzeczy pokazane jako spokojny pionowy ciąg dużych kart.",
        },
      },
      {
        key: "portfolio",
        label: { sv: "Portfölj", en: "Portfolio", pl: "Portfolio" },
        description: {
          sv: "Arbeten i två spalter med kategori och titel under varje bild, och knappar överst för att filtrera på kategori.",
          en: "Work in two columns with the category and title under each picture, and buttons on top to filter by category.",
          pl: "Prace w dwóch kolumnach z kategorią i tytułem pod każdym zdjęciem oraz przyciskami na górze do filtrowania.",
        },
      },
      {
        key: "rail",
        label: {
          sv: "Rullande spår",
          en: "Sliding track",
          pl: "Przesuwany tor",
        },
        description: {
          sv: "Rubriken står kvar i en smal spalt till vänster medan rutorna rullas i sidled och fortsätter ut i kanten.",
          en: "The heading stays in a narrow column on the left while the cells scroll sideways and continue out past the edge.",
          pl: "Nagłówek zostaje w wąskiej kolumnie po lewej, a kafelki przesuwają się w bok i wychodzą za krawędź.",
        },
      },
      {
        key: "overlay-mosaic",
        label: { sv: "Bildrutor med namn", en: "Named picture tiles", pl: "Kafelki z nazwą" },
        description: {
          sv: "Bilden fyller hela rutan och namnet står på den, nere till vänster. Första rutan är hög, resten breda. Bra för rum, områden eller kategorier – bilder som ändå behöver heta något.",
          en: "The picture fills each tile and the name sits on it, bottom start. The first tile is tall and the rest are wide. Good for rooms, areas or categories – pictures that still need naming.",
          pl: "Zdjęcie wypełnia kafelek, a nazwa stoi na nim, w dolnym rogu. Pierwszy kafelek jest wysoki, reszta szeroka. Dobre dla pomieszczeń, obszarów albo kategorii.",
        },
      },
      {
        key: "picture-panel",
        label: { sv: "Kort med bildpanel", en: "Cards with picture panel", pl: "Karty z panelem" },
        description: {
          sv: "Varje ruta är ett kort där bilden ligger i en tonad panel överst och texten under en linje. Till skillnad från \"Mosaik\", där bilden är rutan, är det här texten som bär och bilden som illustrerar.",
          en: "Each cell is a card with the picture in a tinted panel on top and the text under a rule. Unlike \"Mosaic\", where the picture IS the tile, here the words carry and the picture illustrates.",
          pl: "Każde pole to karta ze zdjęciem w stonowanym panelu u góry i tekstem pod linią. W przeciwieństwie do \"Mozaiki\", gdzie zdjęcie JEST kafelkiem, tu niosą słowa, a zdjęcie ilustruje.",
        },
      },
      {
        key: "mosaic",
        label: {
          sv: "Mosaik",
          en: "Mosaic",
          pl: "Mozaika nieregularna",
        },
        description: {
          sv: "Rutorna får olika storlek och förskjuts uppåt och nedåt så bandet ser komponerat ut i stället för som ett rutnät.",
          en: "The cells take different sizes and shift up and down so the band looks composed rather than like a grid.",
          pl: "Kafelki mają różne rozmiary i są przesunięte w górę i w dół, więc pas wygląda skomponowany, a nie jak siatka.",
        },
      },
      {
        key: "featured-work",
        label: {
          sv: "Utvalda arbeten",
          en: "Selected work",
          pl: "Wybrane prace",
        },
        description: {
          sv: "Ett urval i två breda spalter: stort foto, sedan titeln och kategorin på samma rad under bilden. Rubriken står till vänster och en valfri länk (”Se alla”) hamnar mitt emot den.",
          en: "A selection in two wide columns: a large photo, then the title and the category on one line beneath it. The heading holds the left and an optional link (\"See all\") sits opposite it.",
          pl: "Wybór w dwóch szerokich kolumnach: duże zdjęcie, a pod nim tytuł i kategoria w jednym wierszu. Nagłówek trzyma lewą stronę, a opcjonalny link (\"Zobacz wszystkie\") stoi naprzeciw.",
        },
      },
      {
        key: "work-index",
        label: {
          sv: "Alla arbeten",
          en: "Work index",
          pl: "Indeks prac",
        },
        description: {
          sv: "Hela listan tre i bredd, med kategorierna som flikar med understrykning överst. Rutnätet flyttar sig mjukt när besökaren byter flik. För sidan som visar ALLT – använd ”Utvalda arbeten” för ett urval.",
          en: "The whole list three across, with the categories as underlined tabs on top. The grid reflows gently when the visitor switches tab. For the page that shows EVERYTHING – use \"Selected work\" for a selection.",
          pl: "Cała lista po trzy w rzędzie, z kategoriami jako podkreślone zakładki u góry. Siatka przestawia się łagodnie przy zmianie zakładki. Dla strony, która pokazuje WSZYSTKO – dla wyboru użyj \"Wybrane prace\".",
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
      {
        key: "bar",
        label: { sv: "Remsa", en: "Bar", pl: "Pasek" },
        description: {
          sv: "En tunn färgad remsa tvärs över sidan med ett meddelande och en länk. Den minst påträngande – bra högst upp.",
          en: "A thin coloured strip across the page with one message and a link. The least intrusive one – good at the very top.",
          pl: "Cienki kolorowy pasek przez stronę z jednym komunikatem i linkiem. Najmniej natrętny – dobry na samej górze.",
        },
      },
      {
        key: "card",
        label: { sv: "Ruta", en: "Card", pl: "Karta" },
        description: {
          sv: "Meddelandet står i en rundad ruta med luft runt om i stället för en remsa i kanten – syns mer, tar mer plats.",
          en: "The message sits in a rounded box with air around it instead of a strip at the edge – more visible, more room.",
          pl: "Komunikat w zaokrąglonym polu z przestrzenią wokół zamiast paska przy krawędzi – bardziej widoczny, zajmuje więcej miejsca.",
        },
      },
      {
        key: "split",
        label: { sv: "Delad", en: "Split", pl: "Podzielone" },
        description: {
          sv: "Meddelandet står till vänster och uppmaningen till höger på större skärmar.",
          en: "The message sits left and the action right on larger screens.",
          pl: "Na większych ekranach wiadomość jest po lewej, a przycisk po prawej.",
        },
      },
      {
        key: "notice",
        label: { sv: "Notis", en: "Notice", pl: "Notka" },
        description: {
          sv: "En liten etikett (”NYHET”) inleder raden, sedan meddelandet och en länk. Tunn linje under i stället för färgad platta.",
          en: "A small label (“NEW”) opens the line, then the message and a link. A thin rule underneath instead of a coloured band.",
          pl: "Wiersz zaczyna mała etykieta („NOWOŚĆ”), potem wiadomość i link. Pod spodem cienka linia zamiast kolorowego pasa.",
        },
      },
    ],
    defaultVariant: "bar",
    defaultTone: "dark",
    allowedTones: ["light", "clear", "dark", "brand"],
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
        description: {
          sv: "Filmen i hela sidans bredd.",
          en: "The film at the full width of the page.",
          pl: "Film na całą szerokość strony.",
        },
      },
      {
        key: "side",
        label: { sv: "Bredvid text", en: "Beside text", pl: "Obok tekstu" },
        description: {
          sv: "Filmen bredvid en text som förklarar vad man ser.",
          en: "The film beside a text that says what you are looking at.",
          pl: "Film obok tekstu, który mówi, co widać.",
        },
        // "end" first = the player after the heading and caption in reading
        // order, which is what this cut has always drawn.
        options: { assetSide: ["end", "start"] },
      },
      {
        key: "framed",
        label: { sv: "I ram", en: "Framed", pl: "W ramce" },
        description: {
          sv: "Filmen ligger i en tonad ruta med rubriken över och texten inuti ramen, så hela blocket läses som en sak. Lugnare än biobredd.",
          en: "The film sits in a tinted panel with the heading above and the caption inside the frame, so the block reads as one object. Quieter than cinema width.",
          pl: "Film w stonowanym panelu, nagłówek nad nim, podpis w ramce – blok czyta się jako jedna rzecz. Spokojniejszy niż szerokość kinowa.",
        },
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
      {
        key: "table",
        label: { sv: "Tabell", en: "Table", pl: "Tabela" },
        description: {
          sv: "En tabell med bockar – rad för rad, vad som ingår var.",
          en: "A table with ticks – row by row, what is included where.",
          pl: "Tabela z ptaszkami – wiersz po wierszu, co gdzie wchodzi.",
        },
      },
      {
        key: "cards",
        label: { sv: "Kort", en: "Cards", pl: "Karty" },
        description: {
          sv: "Samma jämförelse som kort i stället för tabell – lättare på mobil.",
          en: "The same comparison as cards instead of a table – easier on a phone.",
          pl: "To samo porównanie jako karty zamiast tabeli – łatwiej na telefonie.",
        },
      },
      {
        key: "plans",
        label: { sv: "Priser och tabell", en: "Prices & table", pl: "Ceny i tabela" },
        description: {
          sv: "Samma jämförelsetabell, men varje kolumn inleds med sitt pris så besökaren ser vad raderna kostar.",
          en: "The same comparison table, but each column opens with its price so the visitor sees what the rows cost.",
          pl: "Ta sama tabela porównawcza, ale każda kolumna zaczyna się od ceny, więc gość widzi, ile kosztują wiersze.",
        },
      },
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
      {
        key: "boxed",
        label: { sv: "Ruta", en: "Boxed", pl: "W ramce" },
        description: {
          sv: "Anmälan står i ett kort med kant och rubriken centrerad över fältet – den vanliga, lugna varianten.",
          en: "The signup sits in a bordered card with the heading centred over the field – the ordinary, quiet one.",
          pl: "Zapis w karcie z ramką i nagłówkiem wyśrodkowanym nad polem – zwykły, spokojny wariant.",
        },
      },
      {
        key: "inline",
        label: { sv: "Inbäddad", en: "Inline", pl: "Osadzone na stronie" },
        description: {
          sv: "Rubriken och fältet på samma rad – den minsta anmälan.",
          en: "The heading and the field on one row – the smallest signup.",
          pl: "Nagłówek i pole w jednym wierszu – najmniejszy zapis.",
        },
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
      {
        key: "orbits",
        label: { sv: "Cirklar", en: "Orbits", pl: "Kręgi" },
        description: {
          sv: "En stor rundad färgyta med centrerad rubrik, prenumeration och tunna cirklar i hörnen.",
          en: "A large rounded colour panel with a centred heading, signup, and fine circles in the corners.",
          pl: "Duży zaokrąglony panel kolorystyczny z wyśrodkowanym nagłówkiem, zapisem i delikatnymi kręgami w rogach.",
        },
      },
      {
        key: "panel-pill",
        label: {
          sv: "Tonad ruta",
          en: "Tinted panel",
          pl: "Stonowany panel",
        },
        description: {
          sv: "En lugn tonad ruta med rubriken centrerad och e-postfältet som en enda avrundad rad – knappen sitter inuti fältet i stället för under det.",
          en: "A quiet tinted panel with the heading centred and the email field drawn as one rounded row – the button sits inside the field instead of under it.",
          pl: "Spokojny, stonowany panel z wyśrodkowanym nagłówkiem i polem e-mail jako jednym zaokrąglonym wierszem – przycisk siedzi w polu, a nie pod nim.",
        },
      },
      {
        key: "photo-hero",
        label: {
          sv: "Nyhetsbrev över bild",
          en: "Photo hero",
          pl: "Newsletter na zdjęciu",
        },
        description: {
          sv: "Ett högt bakgrundsfoto med en kort rad som bygger förtroende, rubrik och prenumeration centrerade ovanpå.",
          en: "A tall background photo with a proof row, heading, and signup centred on top.",
          pl: "Wysokie zdjęcie w tle z rzędem rekomendacji, nagłówkiem i zapisem pośrodku.",
        },
      },
    ],
    defaultVariant: "boxed",
    defaultTone: "clear",
    allowedTones: ["light", "clear", "dark", "brand"],
    defaultContent: (lang) => {
      const signup = newsletterDefaults(lang);
      return {
        type: "newsletter",
        heading: signup.heading,
        intro: signup.description,
        placeholder: signup.placeholder,
        submitLabel: signup.submitLabel,
        successMessage: signup.successMessage,
        consentText: signup.consentText,
      };
    },
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
        description: {
          sv: "En enda mening stor och centrerad på sidan.",
          en: "One single sentence, large and centred on the page.",
          pl: "Jedno zdanie, duże i wyśrodkowane.",
        },
      },
      {
        key: "bordered",
        label: { sv: "Med kantlinje", en: "Bordered", pl: "Z linią przy krawędzi" },
        description: {
          sv: "Samma mening men med en kantlinje runt om.",
          en: "The same sentence but with a border drawn around it.",
          pl: "To samo zdanie, ale z ramką wokół.",
        },
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
      {
        key: "lede",
        label: {
          sv: "Rubrik med linje",
          en: "Headline with a rule",
          pl: "Nagłówek z linią",
        },
        description: {
          sv: "Uttalandet står centrerat och stort, med en hårfin linje under och tillskrivningen vänsterställd därunder.",
          en: "The statement sits centred and large, with a hairline under it and the attribution left-aligned below that.",
          pl: "Zdanie stoi wyśrodkowane i duże, pod nim cienka linia, a niżej przypisanie wyrównane do lewej.",
        },
      },
      {
        key: "on-photo",
        label: {
          sv: "På foto",
          en: "Over a photo",
          pl: "Na zdjęciu",
        },
        description: {
          sv: "Meningen står stor över ett foto som fyller hela bredden, med en mjuk mörk ton bara i den kant texten står i – så syns bilden fortfarande. En andningspaus mitt på sidan. Lägger du inget foto blir det samma lugna centrerade uttalande som vanligt.",
          en: "The sentence stands large over a photo that fills the width, with a soft dark wash only along the edge the text sits in – so the picture is still visible. A breathing pause mid-page. Add no photo and it renders as the ordinary calm centred statement.",
          pl: "Zdanie stoi duże na zdjęciu wypełniającym całą szerokość, z delikatnym ciemnym przyciemnieniem tylko przy krawędzi, gdzie stoi tekst – więc zdjęcie nadal widać. Oddech w środku strony. Bez zdjęcia renderuje się jak zwykłe spokojne, wyśrodkowane zdanie.",
        },
      },
    ],
    defaultVariant: "centered",
    defaultTone: "clear",
    allowedTones: ["light", "clear", "dark", "brand"],
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
      {
        key: "prose",
        label: { sv: "Text", en: "Prose", pl: "Tekst" },
        description: {
          sv: "Löpande text i sidans normala bredd – rubriker, stycken och listor som du skriver dem.",
          en: "Running text at the page's normal width – headings, paragraphs and lists as you write them.",
          pl: "Tekst ciągły w normalnej szerokości strony – nagłówki, akapity i listy tak, jak je napiszesz.",
        },
      },
      {
        key: "narrow",
        label: { sv: "Smal", en: "Narrow", pl: "Wąskie" },
        description: {
          sv: "Samma text men i en smalare spalt, så raderna blir kortare och lättare att läsa. Bra för långa texter.",
          en: "The same text in a narrower column, so the lines are shorter and easier to read. Good for long pieces.",
          pl: "Ten sam tekst w węższej kolumnie, więc wiersze są krótsze i łatwiejsze do czytania. Dobre do długich tekstów.",
        },
      },
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
      {
        key: "wide",
        label: { sv: "Bred", en: "Wide", pl: "Szerokie" },
        description: {
          sv: "Bilden i hela sidans bredd.",
          en: "The picture at the full width of the page.",
          pl: "Zdjęcie na całą szerokość strony.",
        },
      },
      {
        key: "full",
        label: { sv: "Hel bredd", en: "Full width", pl: "Cała szerokość" },
        description: {
          sv: "Bilden fyller hela skärmen – kant till kant, utan marginaler.",
          en: "The photo fills the whole screen – edge to edge, with no margins.",
          pl: "Zdjęcie wypełnia cały ekran – od krawędzi do krawędzi, bez marginesów.",
        },
      },
      {
        key: "caption-beside",
        label: { sv: "Text bredvid", en: "Caption beside", pl: "Podpis obok" },
        description: {
          sv: "Bilden behåller sidans bredd och bildtexten står i marginalen bredvid i stället för under. På mobil hamnar texten under bilden.",
          en: "The picture keeps the page width and the caption sits in the margin beside it rather than under it. On a phone the caption drops below.",
          pl: "Zdjęcie zachowuje szerokość strony, a podpis stoi na marginesie obok, nie pod spodem. Na telefonie podpis schodzi pod zdjęcie.",
        },
      },
      {
        key: "inset",
        label: { sv: "Smal", en: "Inset", pl: "Wąskie" },
        description: {
          sv: "Bilden smalare, med luft på båda sidor.",
          en: "The picture narrower, with air on both sides.",
          pl: "Zdjęcie węższe, z przestrzenią po obu stronach.",
        },
      },
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
        description: {
          sv: "En vara visas stor med bild, pris och köpknapp – för det du helst vill sälja.",
          en: "One product shown large with its picture, price and buy button – for the thing you most want to sell.",
          pl: "Jeden produkt pokazany duży ze zdjęciem, ceną i przyciskiem kupna – dla tego, co chcesz sprzedać najbardziej.",
        },
      },
      {
        key: "spotlight-split",
        label: { sv: "Stor favorit", en: "Large favourite", pl: "Duży wybór" },
        description: {
          sv: "Den första produkten får en stor plats, med övriga produkter bredvid.",
          en: "The first product gets a large space, with the remaining products beside it.",
          pl: "Pierwszy produkt zajmuje dużo miejsca, a pozostałe są pokazane obok.",
        },
      },
      {
        key: "spotlight-strip",
        label: { sv: "Produktband", en: "Product strip", pl: "Pas produktów" },
        description: {
          sv: "Produkterna ligger i en luftig rad som är enkel att bläddra på mobilen.",
          en: "Products sit in an airy row that is easy to browse on a phone.",
          pl: "Produkty są ułożone w lekkim rzędzie, który łatwo przeglądać na telefonie.",
        },
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
        description: {
          sv: "Dina varor i ett rutnät med bild och pris på varje – butikens vanliga vy.",
          en: "Your products in a grid with a picture and price on each – the ordinary shop view.",
          pl: "Twoje produkty w siatce ze zdjęciem i ceną przy każdym – zwykły widok sklepu.",
        },
      },
      {
        key: "catalog-list",
        label: { sv: "Produktlista", en: "Product list", pl: "Lista produktów" },
        description: {
          sv: "En tydlig rad per produkt med bild, namn och pris samlat.",
          en: "One clear row per product, keeping the photo, name and price together.",
          pl: "Jeden czytelny wiersz na produkt ze zdjęciem, nazwą i ceną razem.",
        },
      },
      {
        key: "catalog-compact",
        label: { sv: "Kompakt butik", en: "Compact shop", pl: "Kompaktowy sklep" },
        description: {
          sv: "Mindre produktkort visar fler varor på samma yta.",
          en: "Smaller product cards show more items in the same space.",
          pl: "Mniejsze karty pokazują więcej produktów na tej samej powierzchni.",
        },
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
        description: {
          sv: "Varor från din anslutna butik i ett rutnät. Innehållet hämtas därifrån, så du redigerar det inte här.",
          en: "Products from your connected store in a grid. The content comes from there, so you do not edit it here.",
          pl: "Produkty z podłączonego sklepu w siatce. Treść pochodzi stamtąd, więc nie edytujesz jej tutaj.",
        },
      },
      {
        key: "store-list",
        label: { sv: "Butikslista", en: "Store list", pl: "Lista sklepowa" },
        description: {
          sv: "Varje produkt får en bred rad med köpknappen nära priset.",
          en: "Each product gets a wide row with the buy button close to the price.",
          pl: "Każdy produkt ma szeroki wiersz z przyciskiem zakupu blisko ceny.",
        },
      },
      {
        key: "store-showcase",
        label: { sv: "Butiksskyltfönster", en: "Store showcase", pl: "Witryna sklepu" },
        description: {
          sv: "Stora, luftiga produktkort ger bilderna mer plats.",
          en: "Large, airy product cards give the photos more room.",
          pl: "Duże, lekkie karty dają zdjęciom więcej miejsca.",
        },
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
        key: "ruled",
        label: { sv: "Rader", en: "Ruled rows", pl: "Wiersze z liniami" },
        description: {
          sv: "Filerna som rader mellan tunna linjer i stället för kort. Hela raden går att klicka, så det är lätt att träffa på mobil.",
          en: "The files as rows between hairlines rather than cards. The whole row is clickable, so it is easy to hit on a phone.",
          pl: "Pliki jako wiersze między cienkimi liniami, nie karty. Cały wiersz jest klikalny, więc łatwo trafić na telefonie.",
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
        // "end" first = the picture after the step's words, as today.
        options: { assetSide: ["end", "start"] },
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
      {
        key: "overlay",
        label: { sv: "Flikar på bilden", en: "Tabs on the photo", pl: "Karty na zdjęciu" },
        description: {
          sv: "En stor bild med flikarna liggande överst på den och stegets namn och text infällda nedtill i bilden.",
          en: "One large picture with the tabs sitting on top of it and the step's name and text set into the bottom of the picture.",
          pl: "Jedno duże zdjęcie z kartami na górze i nazwą kroku oraz tekstem wpuszczonymi na dole zdjęcia.",
        },
      },
      {
        key: "pinned-text",
        // "end" first = the scrolling pictures after the pinned panel, as today.
        options: { assetSide: ["end", "start"] },
        label: {
          sv: "Fäst textruta",
          en: "Pinned text panel",
          pl: "Przypięty panel z tekstem",
        },
        description: {
          sv: "Textrutan står stilla medan bilderna rullar förbi bredvid. Stegen räknas upp i en rad under texten och det aktiva steget är svart.",
          en: "The text panel stays put while the photos scroll past beside it. The steps are numbered in a row under the text, with the active one in black.",
          pl: "Panel z tekstem stoi w miejscu, a zdjęcia przewijają się obok. Kroki są ponumerowane w rzędzie pod tekstem, aktywny jest czarny.",
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
      {
        key: "default",
        label: { sv: "Standard", en: "Default", pl: "Standard" },
        description: {
          sv: "Två bilder ovanpå varandra med ett handtag att dra i – besökaren jämför före och efter själv.",
          en: "Two pictures stacked with a handle to drag – the visitor compares before and after themselves.",
          pl: "Dwa zdjęcia jedno na drugim z uchwytem do przeciągania – gość sam porównuje przed i po.",
        },
      },
      {
        key: "comparison-cards",
        label: { sv: "Jämförelsekort", en: "Comparison cards", pl: "Karty porównania" },
        description: {
          sv: "Varje resultat får ett eget kort under reglaget.",
          en: "Each result gets its own card below the slider.",
          pl: "Każdy wynik ma własną kartę pod suwakiem.",
        },
      },
      {
        key: "comparison-bars",
        label: { sv: "Jämförelsestaplar", en: "Comparison bars", pl: "Słupki porównania" },
        description: {
          sv: "Resultaten visas som tydliga staplar som växer med värdet.",
          en: "Results appear as clear bars that grow with the value.",
          pl: "Wyniki są pokazane jako czytelne paski rosnące wraz z wartością.",
        },
      },
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
      {
        key: "default",
        label: { sv: "Standard", en: "Default", pl: "Standard" },
        description: {
          sv: "En ritad bild i sidans normala bredd, med text under om du skriver någon.",
          en: "A drawn illustration at the page's normal width, with text under it if you write any.",
          pl: "Rysunek w normalnej szerokości strony, z tekstem pod spodem, jeśli go napiszesz.",
        },
      },
      {
        key: "inline",
        label: { sv: "Liten", en: "Small", pl: "Mały" },
        description: {
          sv: "Centrerad och smal – för ett märke eller en liten skiss mellan två textblock.",
          en: "Centered and narrow — for a mark or a small sketch between two blocks of text.",
          pl: "Wyśrodkowany i wąski — dla znaku lub małego szkicu między blokami tekstu.",
        },
      },
      {
        key: "wide",
        label: { sv: "Bred", en: "Wide", pl: "Szeroki" },
        description: {
          sv: "Samma illustration men bredare, ut mot sidans kanter – för en bild som tål att vara stor.",
          en: "The same illustration but wider, out towards the page edges – for a picture that carries at size.",
          pl: "Ta sama ilustracja, ale szersza, ku krawędziom strony – dla obrazu, który znosi duży format.",
        },
      },
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
      {
        key: "default",
        label: { sv: "Standard", en: "Default", pl: "Standard" },
        // Was a copy-paste of `featured-product`'s description, so the one
        // sentence describing a captured block talked about prices and buy
        // buttons.
        description: {
          sv: "Delen från din gamla sida, med sin egen form. Du ändrar texter, bilder och länkar direkt på sidan.",
          en: "The piece from your old site, in its own shape. Text, images and links are changed straight on the page.",
          pl: "Fragment Twojej starej strony, w swojej własnej formie. Tekst, obrazy i linki zmieniasz wprost na stronie.",
        },
      },
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

  "events": {
    type: "events",
    label: { sv: "Kalender", en: "What's on", pl: "Kalendarz" },
    whenToUse: {
      sv: "Lista det som är på gång: kurser, klasser, prova-på-kvällar, öppet hus. Använd när besökaren behöver veta VAD som händer och NÄR. Inte för att boka en tid hos er, det gör Bokning.",
      en: "List what is coming up: courses, classes, taster evenings, open days. Use when a visitor needs to know WHAT is happening and WHEN. Not for booking a slot with you, which is what Booking does.",
      pl: "Pokaż, co się dzieje: kursy, zajęcia, wieczory próbne, dni otwarte. Użyj, gdy odwiedzający musi wiedzieć CO i KIEDY. Nie do rezerwacji terminu, od tego jest Rezerwacja.",
    },
    category: "content",
    icon: "CalendarDays",
    variants: [
      {
        key: "list",
        label: { sv: "Lista", en: "List", pl: "Lista" },
        description: {
          sv: "Ett tillfälle per rad med datumet till vänster och en tunn linje emellan. Lättast att läsa när ni har många datum.",
          en: "One occasion per row with the date on the reading side and a hairline between. The easiest to read when you have many dates.",
          pl: "Jedno wydarzenie na wiersz, data z brzegu i cienka linia między nimi. Najłatwiej czytać przy wielu terminach.",
        },
      },
      {
        key: "cards",
        label: { sv: "Kort", en: "Cards", pl: "Karty" },
        description: {
          sv: "Varje tillfälle i ett eget kort med plats för foto och en knapp. Bra när ni har några få och vill visa dem ordentligt.",
          en: "Each occasion in its own card with room for a photo and a button. Good when you have a few and want to show them properly.",
          pl: "Każde wydarzenie we własnej karcie ze zdjęciem i przyciskiem. Dobre, gdy masz kilka i chcesz je pokazać porządnie.",
        },
      },
      {
        key: "agenda",
        label: { sv: "Datumspalt", en: "Date column", pl: "Kolumna dat" },
        description: {
          sv: "Datumet står stort i en egen spalt till vänster med tillfället bredvid. Läses som ett program eller en anslagstavla.",
          en: "The date stands large in its own column with the occasion beside it. It reads as a programme or a noticeboard.",
          pl: "Data stoi duża we własnej kolumnie, wydarzenie obok. Czyta się jak program albo tablica ogłoszeń.",
        },
      },
    ],
    defaultVariant: "list",
    defaultTone: "light",
    allowedTones: ["light", "clear", "dark"],
    defaultContent: (lang) => ({
      type: "events",
      heading: pick(lang, "På gång", "What's on", "Co się dzieje"),
      // No invented dates. A programme is the one thing a default cannot guess
      // without publishing a course that does not exist, so this ships empty
      // and the section says so until the owner fills it in.
      items: [],
      emptyNote: pick(
        lang,
        "Inget inbokat just nu. Hör av dig så berättar vi när nästa tillfälle kommer.",
        "Nothing booked in right now. Get in touch and we will tell you when the next one is.",
        "Nic nie jest teraz zaplanowane. Napisz do nas, a powiemy, kiedy będzie następne.",
      ),
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

/** Field-scoped repeatable-content ceiling for owner writes. Imports remain
 *  lossless, but the ordinary editor and AI append paths cannot prefill a logo
 *  wall beyond its deliberate three-row silhouette before switching variants. */
export function arrayItemMaxFor(
  type: SectionType,
  arrayField: string,
  variant?: string,
): number {
  if (type === "hero" && arrayField === "logoTiles") return 14;
  if (type === "hero" && arrayField === "showcaseCards") return 3;
  if (type === "newsletter" && arrayField === "proof.faces") return 3;
  // `scatterImages` is shared with the larger stage and scatter layouts. Only
  // the fixed three-plane lattice (primary media + two supports) owns this cap.
  if (
    type === "hero" &&
    arrayField === "scatterImages" &&
    variant === "lattice-collage"
  ) {
    return 2;
  }
  return ARRAY_ITEM_MAX;
}

export const ARRAY_DEFAULTS: Record<string, (lang: Locale) => unknown> = {
  "hero.logoTiles": (l) => ({
    label: pick(l, "Ny logotyp", "New logo", "Nowe logo"),
  }),
  "hero.showcaseCards": (l) => ({
    title: pick(l, "Nytt kort", "New card", "Nowa karta"),
    description: pick(
      l,
      "Beskriv kortet här.",
      "Describe the card here.",
      "Opisz kartę tutaj.",
    ),
  }),
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
  "events.items": (l) => ({
    title: pick(l, "Nytt tillfälle", "New occasion", "Nowe wydarzenie"),
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
