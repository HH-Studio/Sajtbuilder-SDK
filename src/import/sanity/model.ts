// ---------------------------------------------------------------------------
// What a Sanity dataset export actually is, in types.
//
// Plan: the app's docs/plans/doing/P1-s08-2026-08-20-sanity-importer.md.
//
// Most of the difficulty in this lane is in the shape of the source rather
// than in the code, so the shape is written down first and once:
//
//  - **NDJSON plus an assets folder.** `sanity dataset export` produces a
//    tarball holding one JSON document per line, plus `images/` and `files/`.
//  - **The schema is NOT in the export.** It lives in the agency's repo as
//    `defineType` calls. The export says a document has a field called `body`;
//    only the schema says it is Portable Text with three custom block types in
//    it. That single fact is why this importer takes two inputs.
//  - **Drafts are separate documents**, `_id` prefixed `drafts.`, so the same
//    content appears twice and the published one is the one without the prefix.
//  - **References are `{_ref, _type: "reference"}`** and cycles are ordinary.
// ---------------------------------------------------------------------------

/** One line of the export's NDJSON, after parsing. Everything past the
 *  underscore-prefixed system fields is the agency's own shape. */
export type SanityDocument = {
  _id: string;
  _type: string;
  _rev?: string;
  _createdAt?: string;
  _updatedAt?: string;
  [field: string]: unknown;
};

/** One file out of the export tarball's `images/` or `files/` folder. */
export type SanityExportAsset = {
  /** The name inside the tarball, e.g.
   *  `images/8f2c…-1200x800.jpg`. */
  path: string;
  /** The Sanity asset id the documents reference, derived from the file name:
   *  `image-<sha>-<w>x<h>-<ext>`. */
  assetId: string;
  bytes: Uint8Array;
};

export type SanityExport = {
  /** Published documents, by `_id`. */
  documents: Map<string, SanityDocument>;
  /** Draft documents, keyed by the id they WOULD publish under (the `drafts.`
   *  prefix removed), so a draft with no published twin is findable. */
  drafts: Map<string, SanityDocument>;
  assets: Map<string, SanityExportAsset>;
  /** Document counts per `_type`, published only, for the mapping proposal and
   *  for the report. */
  typeCounts: Map<string, number>;
};

/** What the static schema reader could tell about one field. `unknown` is an
 *  honest answer and the mapping proposal turns it into an explicit `skip`
 *  rather than a guess. */
export type SanityFieldKind =
  | "string"
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "slug"
  | "url"
  | "image"
  | "file"
  | "reference"
  | "portableText"
  | "array"
  | "object"
  | "unknown";

export type SanitySchemaField = {
  name: string;
  kind: SanityFieldKind;
  title?: string;
  /** `reference` only: the `_type` names this field may point at. */
  to?: string[];
  /** `array` only: the member `_type` names. */
  of?: string[];
  /** A `string` declared with a `list` of options, which is our `choice`. */
  options?: string[];
  /** The `defineType` in the schema declared this as required. */
  required?: boolean;
};

export type SanitySchemaType = {
  name: string;
  /** `document` types become collections or pages. `object` types are shapes
   *  used inside other documents and are never a collection of their own. */
  type: "document" | "object" | "other";
  title?: string;
  fields: SanitySchemaField[];
  /** The file it was read out of, for the evidence item. */
  file: string;
};

/** Which localisation convention a dataset uses. There are three in the wild
 *  and no winner, and an importer that assumes one gets the other two wrong in
 *  silence, so this is DETECTED and an undetectable dataset is a hard stop. */
export type SanityI18nConvention =
  /** No localised content found at all. The common case for a single-language
   *  client, and the one that needs no decision. */
  | "none"
  /** Field-level: `title: { sv: "…", en: "…" }`, usually with an `_type` of
   *  `localeString` / `localeText` / `localeBlock`. */
  | "field"
  /** Document-level: one document per locale, told apart by an `_id` suffix
   *  such as `-sv`, or by a `language` / `__i18n_lang` field. */
  | "document"
  /** `@sanity/document-internationalization`: separate
   *  `translation.metadata` documents holding the per-locale references. */
  | "metadata"
  /** Two or more conventions look equally plausible. NOT a guess: the importer
   *  stops and names what it saw. */
  | "ambiguous";

export type SanityI18nDetection = {
  convention: SanityI18nConvention;
  /** The locales seen, in the order they were first met. */
  locales: string[];
  /** What the detector actually observed, so a hard stop can say why rather
   *  than only that. */
  evidence: string[];
};

/** Bounds on what this lane will read, so a hostile or simply enormous export
 *  cannot exhaust memory before the caps in `lib/portability/caps.ts` get a
 *  chance to speak. */
export const SANITY_EXPORT_LIMITS = {
  /** The tarball itself, compressed. */
  maxArchiveBytes: 512 * 1024 * 1024,
  /** One NDJSON line. A Sanity document past this is not content. */
  maxDocumentBytes: 4 * 1024 * 1024,
  maxDocuments: 20_000,
  /** One asset file inside the tarball. `PORTABLE_CAPS.maxAssetBytes` is the
   *  real ceiling; this only stops the reader. */
  maxAssetBytes: 64 * 1024 * 1024,
  maxAssets: 5_000,
  /** One `.ts` / `.js` schema file, read as TEXT and never executed. */
  maxSchemaFileBytes: 2 * 1024 * 1024,
  maxSchemaFiles: 500,
  /** How deep a reference chain is followed before the converter records a
   *  cycle instead of recursing. */
  maxReferenceDepth: 8,
} as const;
