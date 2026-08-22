// ---------------------------------------------------------------------------
// `sanity-mapping.json`: the small, readable, committed artefact that decides
// what this dataset becomes.
//
// This file is the whole answer to "how is the mapping produced". The CLI
// generates a PROPOSAL deterministically from the schema plus what the
// documents actually contain, writes it beside the repo, and stops. A human
// reads it, corrects the handful of rows it got wrong, and commits it. From
// then on the conversion is deterministic, versioned and re-runnable, and no
// model is ever in the conversion path.
//
// Two rules make the proposal safe to trust:
//
//  1. **Every field appears.** A field the reader could not classify is
//     `"skip"`, never absent. Absence would be indistinguishable from a field
//     nobody noticed, which is how content goes missing quietly.
//  2. **Nothing is required by default.** The schema's `.required()` is carried
//     as a hint and not applied, because a required SnabbSajt field that the
//     imported rows cannot fill is a list the client cannot save.
// ---------------------------------------------------------------------------

import type {
  SanityDocument,
  SanityFieldKind,
  SanitySchemaType,
} from "./model";
import { isPortableText } from "./portableText";

export const SANITY_MAPPING_REVISION = "snabbsajt.sanity-mapping/v1" as const;

/** The nine SnabbSajt collection field types, plus `skip`. Kept as a literal
 *  list here rather than imported from `defineCollection` so that the mapping
 *  FILE FORMAT is stable even if the SDK's export surface moves. A mismatch is
 *  caught by `validateMapping`. */
export const MAPPING_FIELD_TYPES = [
  "text",
  "longText",
  "number",
  "date",
  "image",
  "link",
  "boolean",
  "choice",
  "reference",
  "skip",
] as const;

export type MappingFieldType = (typeof MAPPING_FIELD_TYPES)[number];

export type MappingField = {
  /** The Sanity field name, as it appears in the documents. */
  from: string;
  /** The SnabbSajt field key it becomes. Lowercase identifier. */
  to: string;
  type: MappingFieldType;
  label?: string;
  /** `choice` only. */
  options?: string[];
  /** `reference` only: the mapping `key` of the target collection. */
  referenceCollectionKey?: string;
  /** Why the proposal chose this, in one line, so the human reviewing it can
   *  disagree with a reason rather than with a shrug. */
  note?: string;
};

export type MappingType = {
  /** The Sanity `_type`. */
  from: string;
  /** What it becomes. `page` is for a type there is one of (a home page, an
   *  about page); `collection` is for a type there are many of. */
  becomes: "collection" | "page" | "skip";
  /** `collection` only: the collection key and its display name. */
  key?: string;
  name?: string;
  slugPrefix?: string;
  /** Which field names the row in the list. */
  titleField?: string;
  /** Which field supplies the row's address. */
  slugField?: string;
  fields: MappingField[];
  note?: string;
};

export type SanityMapping = {
  revision: typeof SANITY_MAPPING_REVISION;
  /** Which language to import when a field holds several. Written by the
   *  proposal from the detected locales, and edited by the agency. */
  locale?: string;
  types: MappingType[];
};

/** A lowercase identifier `defineCollection` and the app both accept. */
export function mappingKey(value: string, fallback: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return /^[a-z]/.test(slug) ? slug : fallback;
}

/** Same, but for a FIELD key, which may carry underscores and must not start
 *  with a digit. */
function fieldKey(value: string, fallback: string): string {
  const key = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return /^[a-z]/.test(key) ? key : fallback;
}

/** What one Sanity field kind becomes, before the documents get a vote. */
function typeFromKind(kind: SanityFieldKind): MappingFieldType {
  switch (kind) {
    case "string":
      return "text";
    case "text":
    case "portableText":
      return "longText";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "date":
    case "datetime":
      return "date";
    case "url":
      return "link";
    case "image":
      return "image";
    case "reference":
      return "reference";
    // `slug` is the row's address rather than a field of its own, `file` has no
    // home in the nine types, and an array / object / unknown is exactly what
    // the human is being asked about.
    default:
      return "skip";
  }
}

/** What the DOCUMENTS say a field holds, when the schema said nothing useful.
 *  Only ever consulted for a field the schema could not classify: the schema is
 *  the authority, and this is the fallback that keeps an unreadable schema file
 *  from turning every field into a `skip`. */
function typeFromValues(values: unknown[]): {
  type: MappingFieldType;
  note: string;
} {
  const present = values.filter((value) => value !== undefined && value !== null);
  if (present.length === 0) {
    return { type: "skip", note: "no document in the export fills this in" };
  }
  if (present.some(isPortableText)) {
    return { type: "longText", note: "the documents hold rich text here" };
  }
  if (present.every((value) => typeof value === "boolean")) {
    return { type: "boolean", note: "every value is a yes or a no" };
  }
  if (present.every((value) => typeof value === "number")) {
    return { type: "number", note: "every value is a number" };
  }
  if (
    present.every(
      (value) =>
        !!value &&
        typeof value === "object" &&
        (value as { _type?: string })._type === "reference",
    )
  ) {
    return { type: "reference", note: "every value points at another document" };
  }
  if (
    present.every(
      (value) =>
        !!value &&
        typeof value === "object" &&
        (value as { _type?: string })._type === "image",
    )
  ) {
    return { type: "image", note: "every value is a picture" };
  }
  if (present.every((value) => typeof value === "string")) {
    const strings = present as string[];
    if (strings.every((value) => /^\d{4}-\d{2}-\d{2}/.test(value))) {
      return { type: "date", note: "every value reads as a date" };
    }
    if (strings.every((value) => /^https?:\/\//.test(value))) {
      return { type: "link", note: "every value is a web address" };
    }
    const longest = strings.reduce((max, value) => Math.max(max, value.length), 0);
    return longest > 200
      ? { type: "longText", note: "the values are long" }
      : { type: "text", note: "the values are short text" };
  }
  return {
    type: "skip",
    note: "the values are a shape we have no field for. Choose one, or leave it skipped.",
  };
}

/** How many documents of a type make it a LIST rather than a page. One or two
 *  "about" documents are pages; twenty properties are a collection. Three is
 *  the smallest number that is unambiguously a list, and a human overrides it
 *  in the file either way. */
const COLLECTION_THRESHOLD = 3;

export type ProposeOptions = {
  /** The language to keep where a field holds several. */
  locale?: string;
};

/** Build the proposal. Deterministic: same export plus same schema gives the
 *  same file, byte for byte, which is what makes the artefact worth
 *  committing. */
export function proposeMapping(
  documentsByType: Map<string, SanityDocument[]>,
  schema: readonly SanitySchemaType[],
  options: ProposeOptions = {},
): SanityMapping {
  const schemaByName = new Map(schema.map((type) => [type.name, type]));
  const typeNames = [...documentsByType.keys()].sort();
  // Which Sanity `_type` each collection key belongs to, so a `reference`
  // field can name the target by KEY rather than by Sanity type.
  const keyByType = new Map<string, string>();
  for (const name of typeNames) {
    const count = documentsByType.get(name)?.length ?? 0;
    if (count >= COLLECTION_THRESHOLD) {
      keyByType.set(name, mappingKey(name, "lista"));
    }
  }

  const types: MappingType[] = [];
  for (const name of typeNames) {
    const docs = documentsByType.get(name) ?? [];
    const declared = schemaByName.get(name);
    const becomes: MappingType["becomes"] =
      docs.length >= COLLECTION_THRESHOLD ? "collection" : "page";

    // Every field name the schema declares, plus every field name the
    // documents actually carry. The union, because a schema can be out of date
    // and a document can carry a field the schema dropped, and either way the
    // human should see it.
    const names = new Set<string>();
    for (const field of declared?.fields ?? []) names.add(field.name);
    for (const doc of docs) {
      for (const key of Object.keys(doc)) {
        if (!key.startsWith("_")) names.add(key);
      }
    }

    const usedKeys = new Set<string>();
    const fields: MappingField[] = [];
    let titleField: string | undefined;
    let slugField: string | undefined;
    for (const field of [...names].sort()) {
      const declaredField = declared?.fields.find((f) => f.name === field);
      const values = docs.map((doc) => doc[field]);
      let type: MappingFieldType;
      let note: string | undefined;
      if (declaredField && declaredField.kind !== "unknown") {
        type = typeFromKind(declaredField.kind);
        if (type === "skip") {
          note = `the schema calls this "${declaredField.kind}", which has no SnabbSajt field. Pick one, or leave it skipped.`;
        }
        // The schema said `array`/`object`/`unknown` and the documents may
        // still be readable, so ask them before giving up.
        if (type === "skip") {
          const guessed = typeFromValues(values);
          if (guessed.type !== "skip") {
            type = guessed.type;
            note = `the schema calls this "${declaredField.kind}"; ${guessed.note}`;
          }
        }
      } else {
        const guessed = typeFromValues(values);
        type = guessed.type;
        note = declared
          ? `the schema does not declare this field; ${guessed.note}`
          : guessed.note;
      }

      if (declaredField?.kind === "slug" && !slugField) {
        slugField = field;
        note = "used as the row's web address";
      }
      if (
        !titleField &&
        type === "text" &&
        /^(title|name|heading|namn|rubrik)$/i.test(field)
      ) {
        titleField = field;
      }

      let key = fieldKey(field, `falt_${fields.length + 1}`);
      let n = 2;
      while (usedKeys.has(key)) {
        key = `${fieldKey(field, "falt")}_${n}`;
        n += 1;
      }
      usedKeys.add(key);

      const entry: MappingField = { from: field, to: key, type };
      if (declaredField?.title) entry.label = declaredField.title;
      if (type === "choice" || declaredField?.options) {
        entry.options = declaredField?.options ?? [];
        if (entry.options.length > 0) entry.type = "choice";
      }
      if (type === "reference") {
        const target = declaredField?.to?.find((to) => keyByType.has(to));
        if (target) entry.referenceCollectionKey = keyByType.get(target);
        else {
          note =
            "this points at another document, and no list in this mapping holds that type. Point it at one, or leave it skipped.";
          entry.type = "skip";
        }
      }
      if (note) entry.note = note;
      fields.push(entry);
    }

    // A list with nothing to call its rows is a list of blanks. Fall back to
    // the first text field before giving up on the type entirely.
    if (!titleField) {
      titleField = fields.find((field) => field.type === "text")?.from;
    }

    const key = keyByType.get(name);
    types.push({
      from: name,
      becomes:
        becomes === "collection" && (!key || !titleField) ? "skip" : becomes,
      ...(becomes === "collection" && key
        ? { key, name: declared?.title ?? name, slugPrefix: mappingKey(name, "lista") }
        : {}),
      ...(titleField ? { titleField } : {}),
      ...(slugField ? { slugField } : {}),
      fields,
      ...(becomes === "collection" && !titleField
        ? {
            note: "skipped because no field looked like a name for each row. Set titleField and change becomes to \"collection\".",
          }
        : {}),
    });
  }

  return {
    revision: SANITY_MAPPING_REVISION,
    ...(options.locale ? { locale: options.locale } : {}),
    types,
  };
}

export type MappingIssue = { path: string; message: string };

/** Check a mapping file a human has edited. Strict, because the whole point of
 *  the artefact is that the run after it is deterministic: a typo here would
 *  otherwise become a silently-skipped field. */
export function validateMapping(value: unknown): {
  ok: boolean;
  issues: MappingIssue[];
  mapping?: SanityMapping;
} {
  const issues: MappingIssue[] = [];
  if (!value || typeof value !== "object") {
    return { ok: false, issues: [{ path: "$", message: "must be an object" }] };
  }
  const rec = value as Record<string, unknown>;
  if (rec.revision !== SANITY_MAPPING_REVISION) {
    issues.push({
      path: "revision",
      message: `must equal "${SANITY_MAPPING_REVISION}"`,
    });
  }
  if (!Array.isArray(rec.types)) {
    issues.push({ path: "types", message: "must be an array" });
    return { ok: false, issues };
  }
  const keys = new Set<string>();
  rec.types.forEach((entry, index) => {
    const path = `types[${index}]`;
    if (!entry || typeof entry !== "object") {
      issues.push({ path, message: "must be an object" });
      return;
    }
    const type = entry as Record<string, unknown>;
    if (typeof type.from !== "string" || !type.from) {
      issues.push({ path: `${path}.from`, message: "must name a Sanity type" });
    }
    if (!["collection", "page", "skip"].includes(String(type.becomes))) {
      issues.push({
        path: `${path}.becomes`,
        message: 'must be "collection", "page" or "skip"',
      });
    }
    if (type.becomes === "collection") {
      if (typeof type.key !== "string" || !/^[a-z][a-z0-9_-]*$/.test(type.key)) {
        issues.push({
          path: `${path}.key`,
          message: "a collection needs a lowercase key starting with a letter",
        });
      } else if (keys.has(type.key)) {
        issues.push({ path: `${path}.key`, message: `"${type.key}" is used twice` });
      } else {
        keys.add(type.key);
      }
      if (typeof type.titleField !== "string" || !type.titleField) {
        issues.push({
          path: `${path}.titleField`,
          message: "a collection needs a field to name each row",
        });
      }
    }
    if (!Array.isArray(type.fields)) {
      issues.push({ path: `${path}.fields`, message: "must be an array" });
      return;
    }
    const seen = new Set<string>();
    type.fields.forEach((raw, at) => {
      const fieldPath = `${path}.fields[${at}]`;
      if (!raw || typeof raw !== "object") {
        issues.push({ path: fieldPath, message: "must be an object" });
        return;
      }
      const field = raw as Record<string, unknown>;
      if (typeof field.from !== "string" || !field.from) {
        issues.push({ path: `${fieldPath}.from`, message: "must name a Sanity field" });
      }
      if (!MAPPING_FIELD_TYPES.includes(field.type as MappingFieldType)) {
        issues.push({
          path: `${fieldPath}.type`,
          message: `must be one of ${MAPPING_FIELD_TYPES.join(", ")}`,
        });
      }
      if (field.type === "skip") return;
      if (typeof field.to !== "string" || !/^[a-z][a-z0-9_-]*$/.test(field.to)) {
        issues.push({
          path: `${fieldPath}.to`,
          message: "a kept field needs a lowercase key starting with a letter",
        });
        return;
      }
      if (seen.has(field.to)) {
        issues.push({ path: `${fieldPath}.to`, message: `"${field.to}" is used twice` });
      }
      seen.add(field.to);
    });
  });
  // A reference has to name a list this same file declares, and that can only
  // be checked once every key is known.
  rec.types.forEach((entry, index) => {
    const type = entry as Record<string, unknown>;
    if (!Array.isArray(type.fields)) return;
    type.fields.forEach((raw, at) => {
      const field = raw as Record<string, unknown>;
      if (field?.type !== "reference") return;
      const target = field.referenceCollectionKey;
      if (typeof target !== "string" || !keys.has(target)) {
        issues.push({
          path: `types[${index}].fields[${at}].referenceCollectionKey`,
          message: "must name a collection this same mapping declares",
        });
      }
    });
  });
  return issues.length === 0
    ? { ok: true, issues, mapping: value as SanityMapping }
    : { ok: false, issues };
}
