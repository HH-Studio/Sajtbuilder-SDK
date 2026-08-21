// ---------------------------------------------------------------------------
// `defineCollection` — how an agency tells SnabbSajt what kind of LIST its
// client may fill in.
//
// Plan: the app's docs/plans/doing/P1-2026-08-19-content-collections.md, and
// slice 3.4 of P0-2026-08-19-agency-program-master.md. "The agency designs the
// card once, and the client adds rows forever."
//
// The app half shipped first: a collection is a named shape plus rows, the
// rows are checked field by field against that shape on every write, and a
// published snapshot freezes both. This file is the other end, the part a
// developer writes beside `defineBlock`, and it exists for the same reason:
// the REPO owns the shape, and the app edits rows only.
//
// It is the sibling of `defineBlock` in every way that matters, and the
// differences are all consequences of one thing, that a collection has rows:
//
//  - **`key`, not `type`.** The key is the identity a re-push matches on, so
//    renaming a collection in the app never detaches it from the repo.
//  - **Nine field types, not six.** A row holds a date and a price and a
//    picture; a block prop does not. The list is the app's
//    `COLLECTION_FIELD_TYPES` and a tenth here would be stored and then refused
//    on the client's first edit.
//  - **A `reference` names another collection BY KEY.** A Convex id does not
//    exist in a repository, and the id this hemsida happens to hold is a
//    different one on the next hemsida. `registerCollections` resolves the key.
//  - **A `template` names blocks, never markup.** `cardBlockType` draws one row
//    in a list, `detailBlockType` draws it on its own page, and `bindings` maps
//    that block's field keys to this collection's field keys.
//
// No runtime, exactly like `defineBlock`: this returns its own input, checked,
// so it is safe at module scope in a client component.
// ---------------------------------------------------------------------------

/** What one field in a collection may hold. Mirrors the app's
 *  `COLLECTION_FIELD_TYPES` (`lib/collections/schema.ts`), in the order the
 *  row editor offers them. */
export const COLLECTION_FIELD_TYPES = [
  "text",
  "longText",
  "number",
  "date",
  "image",
  "link",
  "boolean",
  "choice",
  "reference",
] as const;

export type CollectionFieldType = (typeof COLLECTION_FIELD_TYPES)[number];

export type CollectionFieldDefinition = {
  /** Stable key. A template binds to it and a row's `values` are keyed by it,
   *  so it may be renamed only by migrating the rows. */
  key: string;
  type: CollectionFieldType;
  /** What the client sees above the input. Your words, in your language. */
  label?: string;
  /** A field the client must fill in before the row can be saved. */
  required?: boolean;
  /** One line under the input. Say what a good answer looks like. */
  helpText?: string;
  /** `choice` only: the values you handle. */
  options?: readonly string[];
  /** `reference` only: the `key` of the collection a row may point at. It must
   *  be a collection this same repo declares, or one already on the hemsida. */
  referenceCollectionKey?: string;
};

/** Which registered block draws a row, and how its fields are filled.
 *
 *  `bindings` reads block-field-key -> collection-field-key, in that direction,
 *  because a block is reusable and a collection is not: the same card block
 *  draws `properties` and `staff` with two different bindings. */
export type CollectionTemplate = {
  cardBlockType?: string;
  detailBlockType?: string;
  bindings?: Readonly<Record<string, string>>;
};

export type CollectionDefinition = {
  /** Stable id, lowercase, e.g. `"properties"`. Changing it is a new list. */
  key: string;
  /** What the list is called in the client's sidebar. */
  name: string;
  /** The first segment of a row's address: `/<slugPrefix>/<row slug>`. Falls
   *  back to the key, which is what an agency means nine times out of ten. */
  slugPrefix?: string;
  fields: readonly CollectionFieldDefinition[];
  template?: CollectionTemplate;
};

const ID_RE = /^[a-z][a-z0-9_-]*$/;
/** The app's `COLLECTION_LIMITS.keyLength`. A longer key is refused there, so
 *  it is refused here, where the message lands next to the file. */
const KEY_MAX = 64;
/** The row editor spells "no answer" this way, so a `choice` option carrying it
 *  could never be picked. Refused at definition time, as the app does. */
const NONE_SENTINEL = "__none__";

export class CollectionDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CollectionDefinitionError";
  }
}

/**
 * Declare one collection.
 *
 * Throws on a declaration the app would refuse, and throws EARLY, in your
 * build, where the message lands in your terminal next to the file that caused
 * it. The alternative is `snabbsajt push` failing later with a key and a code.
 *
 * ```ts
 * export const properties = defineCollection({
 *   key: "properties",
 *   name: "Objekt",
 *   slugPrefix: "objekt",
 *   fields: [
 *     { key: "address", type: "text", label: "Adress", required: true },
 *     { key: "price", type: "number", label: "Pris" },
 *     { key: "photo", type: "image", label: "Bild" },
 *     { key: "agent", type: "reference", referenceCollectionKey: "staff" },
 *   ],
 *   template: {
 *     cardBlockType: "property-card",
 *     detailBlockType: "property-page",
 *     bindings: { title: "address", amount: "price", image: "photo" },
 *   },
 * });
 * ```
 */
export function defineCollection(
  definition: CollectionDefinition,
): CollectionDefinition {
  const key = definition.key?.trim() ?? "";
  if (!ID_RE.test(key) || key.length > KEY_MAX) {
    throw new CollectionDefinitionError(
      `Collection key "${definition.key}" must be lowercase letters, digits, dash or underscore, start with a letter, and be at most ${KEY_MAX} characters.`,
    );
  }
  if (!Array.isArray(definition.fields) || definition.fields.length === 0) {
    throw new CollectionDefinitionError(
      `Collection "${key}" declares no fields, so there would be nothing for the client to fill in.`,
    );
  }
  const slugPrefix = (definition.slugPrefix ?? key).trim();
  if (!ID_RE.test(slugPrefix)) {
    throw new CollectionDefinitionError(
      `Collection "${key}" has a slug prefix "${definition.slugPrefix}" that is not usable in an address.`,
    );
  }

  const seen = new Set<string>();
  for (const field of definition.fields) {
    const fieldKey = field?.key?.trim() ?? "";
    if (!ID_RE.test(fieldKey) || fieldKey.length > KEY_MAX) {
      throw new CollectionDefinitionError(
        `Collection "${key}" has a field key "${field?.key}" that is not a plain identifier.`,
      );
    }
    // Refused rather than collapsed, the same call `defineBlock` makes: a
    // template binds to a key, and two fields answering to one key means the
    // binding draws whichever the object iteration order hands over.
    if (seen.has(fieldKey)) {
      throw new CollectionDefinitionError(
        `Collection "${key}" declares "${fieldKey}" twice.`,
      );
    }
    seen.add(fieldKey);
    if (!COLLECTION_FIELD_TYPES.includes(field.type)) {
      throw new CollectionDefinitionError(
        `Collection "${key}" field "${fieldKey}" has type "${field.type}", which is not one of: ${COLLECTION_FIELD_TYPES.join(", ")}.`,
      );
    }
    if (field.type === "choice") {
      if (!field.options || field.options.length === 0) {
        throw new CollectionDefinitionError(
          `Collection "${key}" field "${fieldKey}" is a choice with no options.`,
        );
      }
      if (field.options.includes(NONE_SENTINEL)) {
        throw new CollectionDefinitionError(
          `Collection "${key}" field "${fieldKey}" uses "${NONE_SENTINEL}" as an option, which the row editor reserves for "no answer".`,
        );
      }
    }
    if (field.type === "reference" && !field.referenceCollectionKey?.trim()) {
      throw new CollectionDefinitionError(
        `Collection "${key}" field "${fieldKey}" is a reference with no referenceCollectionKey, so the client would have nothing to pick from.`,
      );
    }
    if (field.type !== "reference" && field.referenceCollectionKey) {
      throw new CollectionDefinitionError(
        `Collection "${key}" field "${fieldKey}" names a reference target but is a "${field.type}".`,
      );
    }
  }

  // A binding that names a field this collection does not have would draw an
  // empty slot on every card, forever, with nothing in any log to say why.
  const bindings = definition.template?.bindings;
  if (bindings) {
    for (const [slot, fieldKey] of Object.entries(bindings)) {
      if (!seen.has(fieldKey)) {
        throw new CollectionDefinitionError(
          `Collection "${key}" binds the block slot "${slot}" to "${fieldKey}", which is not one of its fields.`,
        );
      }
    }
  }

  return {
    ...definition,
    key,
    name: definition.name?.trim() || key,
    slugPrefix,
  };
}

/** Everything a repo declares, keyed by collection key. */
export type CollectionLibrary = Record<string, CollectionDefinition>;

/**
 * Collect the collections a repo declares into the library the CLI sends.
 *
 * Takes the definitions rather than a directory, for the reason `blockLibrary`
 * states: a glob would make the library depend on file placement, and moving a
 * file would silently withdraw a list the client's live page is built from.
 */
export function collectionLibrary(
  ...collections: CollectionDefinition[]
): CollectionLibrary {
  const library: CollectionLibrary = {};
  for (const collection of collections) {
    if (library[collection.key]) {
      throw new CollectionDefinitionError(
        `Two collections are both called "${collection.key}".`,
      );
    }
    library[collection.key] = collection;
  }
  // A reference pointing at a key nobody declares is the one error that cannot
  // be seen from a single definition, so it is checked here, where the whole
  // library is in hand. A target already on the hemsida is legal, so this only
  // refuses a key that matches nothing here AND looks like a typo of one that
  // does; anything else is left for the server, which knows what is stored.
  for (const collection of Object.values(library)) {
    for (const field of collection.fields) {
      const target = field.referenceCollectionKey?.trim();
      if (!target || library[target]) continue;
      const near = Object.keys(library).find(
        (candidate) => candidate.replace(/[-_]/g, "") === target.replace(/[-_]/g, ""),
      );
      if (near) {
        throw new CollectionDefinitionError(
          `Collection "${collection.key}" field "${field.key}" points at "${target}", and this repo declares "${near}".`,
        );
      }
    }
  }
  return library;
}

/** The shape a site package carries, and therefore what `snabbsajt push`
 *  sends. Same field names as the app's `contentCollections` entries in
 *  `PortableSiteV1`, because it is the same data. */
export type PortableCollection = {
  tmpId: string;
  kind: "custom";
  name: string;
  slugPrefix: string;
  order: number;
  /** The repo owns the shape. The app edits rows and never the fields. */
  source: "repo";
  /** The stable key a re-push matches on. */
  externalKey: string;
  fields: {
    key: string;
    label: string;
    type: CollectionFieldType;
    required?: boolean;
    helpText?: string;
    options?: string[];
    /** Carried as the target collection's KEY. `registerCollections` and the
     *  bundle import both resolve it to an id on the receiving hemsida. */
    referenceCollectionId?: string;
  }[];
  template?: {
    cardBlockType?: string;
    detailBlockType?: string;
    bindings?: Record<string, string>;
  };
};

/**
 * Turn the library your repo declares into the `contentCollections` field of a
 * site package.
 *
 * ```ts
 * import { collectionLibrary, collectionsForPackage } from "@snabbsajt/site-kit";
 * import { properties, staff } from "./snabbsajt/collections";
 *
 * site.contentCollections = collectionsForPackage(collectionLibrary(properties, staff));
 * ```
 *
 * A push carrying this registers the shapes on that one hemsida. A push that
 * omits it leaves them exactly as they were, the same promise `blockSchemas`
 * makes: a deploy from a repo mid-refactor must not empty a list the client
 * has spent a month filling in.
 *
 * Rows are deliberately NOT here. They are the client's, they are edited in
 * the app, and a repo that shipped them would overwrite a month of work on
 * every deploy. A row that came from the repo once, as seed content, rides in
 * `collectionRows` beside this, and is a different decision made once.
 */
export function collectionsForPackage(
  library: CollectionLibrary,
): PortableCollection[] {
  return Object.values(library)
    .slice()
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((collection, index) => ({
      tmpId: `collection-${collection.key}`,
      kind: "custom" as const,
      name: collection.name,
      slugPrefix: collection.slugPrefix ?? collection.key,
      order: index,
      source: "repo" as const,
      externalKey: collection.key,
      fields: collection.fields.map((field) => ({
        key: field.key,
        label: field.label?.trim() || field.key,
        type: field.type,
        ...(field.required ? { required: true } : {}),
        ...(field.helpText ? { helpText: field.helpText } : {}),
        ...(field.options ? { options: [...field.options] } : {}),
        ...(field.referenceCollectionKey
          ? { referenceCollectionId: field.referenceCollectionKey }
          : {}),
      })),
      ...(collection.template
        ? {
            template: {
              ...(collection.template.cardBlockType
                ? { cardBlockType: collection.template.cardBlockType }
                : {}),
              ...(collection.template.detailBlockType
                ? { detailBlockType: collection.template.detailBlockType }
                : {}),
              ...(collection.template.bindings
                ? { bindings: { ...collection.template.bindings } }
                : {}),
            },
          }
        : {}),
    }));
}
