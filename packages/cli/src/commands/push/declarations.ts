import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  blockSchemasForPackage,
  collectionsForPackage,
  type PortableBlockSchema,
  type PortableCollection,
} from "@snabbsajt/site-kit";

// ---------------------------------------------------------------------------
// The repo's own declarations, folded into the push.
//
// Plan: slices 3.4 and 3.7 of the app's P0-2026-08-19 master plan, which both
// stopped at the same sentence: "`blocks.registerBlocks` has no CLI caller".
// That was true, and it made "every push re-derives" describe a command nobody
// could run. `snabbsajt/blocks.ts` and `snabbsajt/collections.ts` were data
// files the developer wrote and nothing read.
//
// They are read here, and folded into the package `push` already sends, rather
// than sent to a second endpoint. `import_site` has always accepted
// `blockSchemas` and `contentCollections`, so this needs no new server door and
// no second authorization path — the same reason `push` uses `import_site`
// instead of a REST route of its own.
//
// Two ways in, because a CLI cannot assume it may execute a TypeScript file:
//
//  1. **The declaration files themselves**, imported. Node strips types on its
//     own from 22.18 and 24, which is what an agency's Next.js repo runs. When
//     the runtime cannot, we say so in one sentence and name the way out
//     rather than pushing a package with the blocks silently missing.
//  2. **`--register <file.json>`**, a plain JSON file holding
//     `{ blockSchemas, contentCollections }`. What a build step writes, and
//     what an older Node uses.
//
// Absent declarations are NOT an error. A repo that has not declared anything
// pushes content exactly as it did before, and the server leaves the library
// it already holds alone. That is the promise `blockSchemasForPackage` makes:
// a deploy from a repo mid-refactor must not empty the blocks a live page is
// built from.
// ---------------------------------------------------------------------------

export type Declarations = {
  blockSchemas?: PortableBlockSchema[];
  contentCollections?: PortableCollection[];
  /** What was read, for the line `push` prints. */
  sources: string[];
  /** A file that exists and could not be read. Reported, never thrown: the
   *  content half of the push is still worth landing, and a builder who sees
   *  "blocks were not sent" fixes one file instead of debugging an import. */
  warnings: string[];
};

const BLOCKS_CANDIDATES = ["snabbsajt/blocks.ts", "snabbsajt/blocks.js", "snabbsajt/blocks.mjs"];
const COLLECTIONS_CANDIDATES = [
  "snabbsajt/collections.ts",
  "snabbsajt/collections.js",
  "snabbsajt/collections.mjs",
];
const JSON_CANDIDATE = "snabbsajt/declarations.json";

function firstExisting(cwd: string, candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const path = join(cwd, candidate);
    if (existsSync(path)) return path;
  }
  return undefined;
}

/** A module's declarations, however the developer chose to export them.
 *
 *  `library` is what `snabbsajt init` writes and what the docs show. A default
 *  export is accepted too, because a developer who wrote one file for one
 *  block should not have to learn our naming to be understood. */
function libraryFrom(module: Record<string, unknown>): Record<string, unknown> | undefined {
  for (const name of ["library", "default", "blocks", "collections"]) {
    const value = module[name];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return undefined;
}

function typeStrippingMessage(path: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  if (path.endsWith(".ts") && /Unknown file extension|strip|Cannot find module/i.test(detail)) {
    return `${path} could not be imported by this Node (${process.version}), so the declarations in it were not sent. Node 22.18 and later read TypeScript on their own; on an older one, write the declarations to ${JSON_CANDIDATE} and they will be picked up.`;
  }
  return `${path} could not be read, so the declarations in it were not sent: ${detail}`;
}

/**
 * Read whatever this repository declares.
 *
 * `explicitJson` is `--register <path>` and wins outright: a build that emits
 * a file has decided, and quietly preferring a stale `blocks.ts` beside it
 * would send the wrong library with no way to tell from the output.
 */
export async function loadDeclarations(
  cwd: string,
  explicitJson?: string,
): Promise<Declarations> {
  const result: Declarations = { sources: [], warnings: [] };

  const jsonPath = explicitJson
    ? resolve(cwd, explicitJson)
    : firstExisting(cwd, [JSON_CANDIDATE]);
  if (jsonPath) {
    if (!existsSync(jsonPath)) {
      result.warnings.push(`${jsonPath} does not exist, so no declarations were sent.`);
      return result;
    }
    try {
      const parsed = JSON.parse(readFileSync(jsonPath, "utf8")) as Declarations;
      if (Array.isArray(parsed.blockSchemas)) result.blockSchemas = parsed.blockSchemas;
      if (Array.isArray(parsed.contentCollections)) {
        result.contentCollections = parsed.contentCollections;
      }
      result.sources.push(jsonPath);
    } catch (error) {
      result.warnings.push(typeStrippingMessage(jsonPath, error));
    }
    return result;
  }

  const blocksPath = firstExisting(cwd, BLOCKS_CANDIDATES);
  if (blocksPath) {
    try {
      const module = (await import(pathToFileURL(blocksPath).href)) as Record<string, unknown>;
      const library = libraryFrom(module);
      if (library) {
        result.blockSchemas = blockSchemasForPackage(library as never);
        result.sources.push(blocksPath);
      } else {
        result.warnings.push(
          `${blocksPath} exports no block library, so no blocks were sent. Export it as \`library\`, the way \`snabbsajt init --agency\` writes it.`,
        );
      }
    } catch (error) {
      result.warnings.push(typeStrippingMessage(blocksPath, error));
    }
  }

  const collectionsPath = firstExisting(cwd, COLLECTIONS_CANDIDATES);
  if (collectionsPath) {
    try {
      const module = (await import(pathToFileURL(collectionsPath).href)) as Record<string, unknown>;
      const library = libraryFrom(module);
      if (library) {
        result.contentCollections = collectionsForPackage(library as never);
        result.sources.push(collectionsPath);
      } else {
        result.warnings.push(
          `${collectionsPath} exports no collection library, so no lists were sent. Export it as \`library\`.`,
        );
      }
    } catch (error) {
      result.warnings.push(typeStrippingMessage(collectionsPath, error));
    }
  }

  return result;
}

/**
 * Fold the declarations into the package about to be sent.
 *
 * The package wins where it already says something, and that ordering is the
 * whole design: `snabbsajt pull` writes the app's own answer into
 * `site.json`, so a repo that has been pulled already carries the collections
 * the client filled in, ROWS INCLUDED. Overwriting that with a declaration
 * that has no rows would push an empty list back over a month of the client's
 * typing.
 *
 * So a declaration is applied only where the package is silent, and what it
 * adds is the shape a repo owns and the app cannot invent.
 */
export function withDeclarations<T extends Record<string, unknown>>(
  payload: T,
  declarations: Declarations,
): T {
  const merged: Record<string, unknown> = { ...payload };
  if (declarations.blockSchemas && !hasEntries(payload.blockSchemas)) {
    merged.blockSchemas = declarations.blockSchemas;
  }
  if (declarations.contentCollections && !hasEntries(payload.contentCollections)) {
    merged.contentCollections = declarations.contentCollections;
  }
  return merged as T;
}

function hasEntries(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}
