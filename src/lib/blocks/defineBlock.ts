// ---------------------------------------------------------------------------
// `defineBlock` — how an agency tells SnabbSajt what its own component accepts.
//
// Plan: the app's docs/plans/doing/P0-2026-08-19-agency-program-master.md,
// slice 1.3. The app half of this shipped first: `blockSchemas` stores a
// library per hemsida, `lib/blocks/schema.ts` is the one checker that decides
// whether a block's content may be stored, and a `block` section carries
// `{blockType, version, props}`. This file is the other end of that contract,
// the part a developer actually writes.
//
// What a block IS: their React component, rendered by their own Next.js app.
// SnabbSajt never sees it, never runs it and never draws it. What we hold is
// the CONTENT — the words, the pictures, the links their client edits — and the
// shape of it, which is what this declaration describes.
//
// Deliberately tiny, and deliberately not clever:
//
//  - **No runtime.** `defineBlock` returns its own input, checked. It does not
//    register anything with a server, does not read the filesystem and has no
//    side effects, so it is safe to call at module scope in a client component.
//  - **No inference from the component.** A prop type cannot say "this is a
//    picture the client may swap" or "this text is one line". The declaration
//    is the source of truth precisely because the type system cannot be.
//  - **The same six field kinds as the app**, no more: `text`, `richtext`,
//    `image`, `link`, `select`, `boolean`. A seventh here that the app does not
//    know would be stored and then refused on the first edit.
// ---------------------------------------------------------------------------

/** What one field in a block may hold. Mirrors the app's `BlockFieldKind`. */
export const BLOCK_FIELD_KINDS = [
  "text",
  "richtext",
  "image",
  "link",
  "select",
  "boolean",
] as const;

export type BlockFieldKind = (typeof BLOCK_FIELD_KINDS)[number];

export type BlockField = {
  /** The prop name your component reads. */
  key: string;
  kind: BlockFieldKind;
  /** What the client sees above the input. Your words, in your language. */
  label?: string;
  /** A field the client may leave empty. Absent means required, because your
   *  component is written against props that exist. */
  optional?: boolean;
  /** `select` only: the values you handle. */
  options?: readonly string[];
  /** `text` and `richtext` only. The app clamps this to its own ceiling. */
  maxLength?: number;
};

export type BlockDefinition = {
  /** Stable id, lowercase, e.g. `"pricing-table"`. Changing it is a new block. */
  type: string;
  /** What the block is called in the client's "lägg till sektion" list. */
  label: string;
  /** Bump when the props change shape. A section keeps the version it was
   *  written against, so an older page stays valid until you migrate it. */
  version?: number;
  fields: readonly BlockField[];
  /** Layout choices your component understands. Same idea as a section
   *  variant: it changes layout, never the shape of the content. */
  variants?: readonly string[];
};

const ID_RE = /^[a-z][a-z0-9_-]*$/;

export class BlockDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockDefinitionError";
  }
}

/**
 * Declare one block.
 *
 * Throws on a declaration the app would refuse, and throws EARLY: this runs in
 * your build, where the message lands in your terminal next to the file that
 * caused it. The alternative is `snabbsajt push` failing hours later with a
 * block type and a code, which is the same information at the worst moment.
 *
 * ```ts
 * export const pricingTable = defineBlock({
 *   type: "pricing-table",
 *   label: "Prislista",
 *   fields: [
 *     { key: "title", kind: "text", label: "Rubrik" },
 *     { key: "note", kind: "richtext", optional: true },
 *     { key: "cta", kind: "link", label: "Knapp" },
 *   ],
 *   variants: ["light", "dark"],
 * });
 * ```
 */
export function defineBlock(definition: BlockDefinition): BlockDefinition {
  const type = definition.type?.trim() ?? "";
  if (!ID_RE.test(type)) {
    throw new BlockDefinitionError(
      `Block type "${definition.type}" must be lowercase letters, digits, dash or underscore, starting with a letter.`,
    );
  }
  if (!Array.isArray(definition.fields)) {
    throw new BlockDefinitionError(`Block "${type}" has no fields array.`);
  }
  const seen = new Set<string>();
  for (const field of definition.fields) {
    const key = field?.key?.trim() ?? "";
    if (!ID_RE.test(key)) {
      throw new BlockDefinitionError(
        `Block "${type}" has a field key "${field?.key}" that is not a plain identifier.`,
      );
    }
    // Refused rather than collapsed: your component reads one of them and we
    // cannot know which, so the page's behaviour would depend on key ordering.
    if (seen.has(key)) {
      throw new BlockDefinitionError(`Block "${type}" declares "${key}" twice.`);
    }
    seen.add(key);
    if (!BLOCK_FIELD_KINDS.includes(field.kind)) {
      throw new BlockDefinitionError(
        `Block "${type}" field "${key}" has kind "${field.kind}", which is not one of: ${BLOCK_FIELD_KINDS.join(", ")}.`,
      );
    }
    if (field.kind === "select" && (!field.options || field.options.length === 0)) {
      throw new BlockDefinitionError(
        `Block "${type}" field "${key}" is a select with no options.`,
      );
    }
  }
  return {
    ...definition,
    type,
    label: definition.label?.trim() || type,
    version: definition.version ?? 1,
  };
}

/** Everything a repo declares, keyed by type. What `push` sends and what the
 *  catch-all route renders from. */
export type BlockLibrary = Record<string, BlockDefinition>;

/**
 * Collect the blocks a repo declares into the library the CLI sends.
 *
 * Takes the definitions rather than a directory: a glob would make the library
 * depend on file placement, and a developer moving a component would silently
 * withdraw a block their client's live page is built from.
 */
export function blockLibrary(...blocks: BlockDefinition[]): BlockLibrary {
  const library: BlockLibrary = {};
  for (const block of blocks) {
    if (library[block.type]) {
      throw new BlockDefinitionError(
        `Two blocks are both called "${block.type}".`,
      );
    }
    library[block.type] = block;
  }
  return library;
}

/** The shape `site.json` carries, and therefore what `snabbsajt push` sends.
 *  Same field names as the app's `blockSchemas` table, because it is the same
 *  data: this is a projection of your declarations, not a second format. */
export type PortableBlockSchema = {
  type: string;
  label: string;
  version: number;
  fields: BlockField[];
  variants?: string[];
};

/**
 * Turn the library your repo declares into the `blockSchemas` field of a site
 * package.
 *
 * Call it from whatever already writes your `site.json`:
 *
 * ```ts
 * import { blockLibrary, blockSchemasForPackage } from "@snabbsajt/site-kit";
 * import { pricingTable, heroBand } from "./snabbsajt/blocks";
 *
 * site.blockSchemas = blockSchemasForPackage(blockLibrary(pricingTable, heroBand));
 * ```
 *
 * A push carrying this registers the library on that one hemsida, so the
 * client's editor can offer the blocks and the app can check what they type
 * against the fields you declared. A push that omits it leaves the library
 * exactly as it was: a deploy from a repo mid-refactor must not empty the
 * blocks a live page is built from.
 */
export function blockSchemasForPackage(
  library: BlockLibrary,
): PortableBlockSchema[] {
  return Object.values(library)
    .map((block) => ({
      type: block.type,
      label: block.label,
      version: block.version ?? 1,
      fields: [...block.fields],
      ...(block.variants ? { variants: [...block.variants] } : {}),
    }))
    .sort((a, b) => a.type.localeCompare(b.type));
}
