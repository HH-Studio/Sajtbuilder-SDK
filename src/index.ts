import type { PortableSiteV1 } from "./convex/model/portable";
import type { SectionContent } from "./convex/model/sections";
import type { GenericId } from "convex/values";

export {
  PORTABLE_FORMAT,
  PORTABLE_VERSION,
  portableSiteV1,
} from "./convex/model/portable";
export type {
  PortableAsset,
  PortableFont,
  PortableSiteV1,
} from "./convex/model/portable";
export type {
  SectionContent,
  SectionType,
  ContentOf,
} from "./convex/model/sections";
export { sectionContent, SECTION_TYPES } from "./convex/model/sections";
export { DEFAULT_THEME } from "./convex/model/theme";
export type { ThemeTokens } from "./convex/model/theme";
export { SECTION_REGISTRY, isValidVariant } from "./lib/sections/registry";
export { PORTABLE_CAPS, checkCaps } from "./lib/portability/caps";
export type { SiteKitIssue, SiteKitReport } from "./lib/site-kit/validate";
export { validateSitePackage } from "./lib/site-kit/validate";
export type { PackInput, PackResult, ReviewArtifactName } from "./lib/site-kit/pack";
export { packSitePackage, REVIEW_ARTIFACT_NAMES } from "./lib/site-kit/pack";
export { createStarterSite } from "./starter";
export type { StarterTemplate } from "./starter";
export {
  IMPORT_DISPOSITIONS,
  IMPORT_REPORT_FORMAT,
  IMPORT_REPORT_FORMAT_VERSION,
  IMPORT_REPORT_REVISION,
  IMPORT_REPORT_STATUSES,
  PORTABLE_SITE_FORMAT_VERSION,
  normalizeImportReportJson,
  renderImportReportMarkdown,
  validateImportReport,
} from "./import/report";
export type {
  ImportDisposition,
  ImportReportItemV1,
  ImportReportStatus,
  ImportReportV1,
  ImportReportValidation,
  ImportSourceInputV1,
} from "./import/report";
export { EVIDENCE_KINDS, IMPORT_REPORT_LIMITS } from "./import/evidence";
export type {
  EvidenceItemV1,
  EvidenceKind,
  ImportReportIssue,
} from "./import/evidence";
export { ingestHtmlInput, DEFAULT_HTML_INPUT_LIMITS } from "./import/html/input";
export type { HtmlIngestionOptions, HtmlIngestionResult, HtmlInputLimits } from "./import/html/input";
export { detectHtmlBehavior } from "./import/html/behavior";
export type { BehaviorSignal, HtmlBehaviorInventory } from "./import/html/behavior";
export { mapHtmlIngestion } from "./import/html/map";
export type { HtmlMappedAssetFile, HtmlMappingOptions, HtmlMappingResult } from "./import/html/map";
export { BOOKING_PROVIDER_HOSTS, detectSupportedBookingProvider, nativeFormReplacement } from "./import/native-replacements";

type SectionBase = Omit<PortableSiteV1["sections"][number], "type" | "content">;

/** Convert deployment-specific Convex IDs into portable package references. */
export type PortableValue<T> = T extends GenericId<string>
  ? string
  : T extends readonly (infer Item)[]
    ? PortableValue<Item>[]
    : T extends object
      ? { [K in keyof T]: PortableValue<T[K]> }
      : T;

/** Section content accepted by portable packages, keyed by section type. */
type PortableizedSectionContent = PortableValue<SectionContent>;
type PortableHeroContent = Extract<PortableizedSectionContent, { type: "hero" }>;
type PortableVideoContent = Extract<PortableizedSectionContent, { type: "video" }>;

export type PortableSectionContent =
  | (Omit<PortableHeroContent, "bgVideo"> & { bgVideo?: never })
  | (Omit<PortableVideoContent, "provider" | "video" | "poster"> & {
      provider: "youtube" | "vimeo";
      video?: never;
      poster?: never;
    })
  | Exclude<PortableizedSectionContent, { type: "hero" | "video" }>;

export type SiteKitSection = {
  [K in PortableSectionContent["type"]]: SectionBase & {
    type: K;
    content: Extract<PortableSectionContent, { type: K }>;
  };
}[PortableSectionContent["type"]];

export type TypedSiteKitSection = SiteKitSection;

export type SiteDefinition = Omit<PortableSiteV1, "sections"> & {
  sections: TypedSiteKitSection[];
};

/** Typed identity helper. It adds autocomplete and compile-time section checks. */
export function defineSite(site: SiteDefinition): SiteDefinition {
  return site;
}

/** Typed identity helper for reusable sections. */
export function defineSection(section: TypedSiteKitSection): TypedSiteKitSection {
  return section;
}
