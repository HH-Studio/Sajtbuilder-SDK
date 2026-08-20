import type { BlockDefinition, BlockLibrary } from "./defineBlock";
import type { RenderPage, RenderSection, RenderSite } from "../delivery/renderModel";

// ---------------------------------------------------------------------------
// Composed pages: rendering a page SnabbSajt knows about, with the agency's own
// components.
//
// Plan: the app's P0-2026-08-19 master plan, slice 1.3, owner answer 12 — "let
// users delete, edit and add pages, and build using blocks, that are added to
// the agency's version if they pull. Make it work."
//
// This is the resolver half of that, framework-free on purpose so the Next.js
// glue (`<SnabbSajtPages>`) stays a thin file a developer can read in a minute
// and replace if their routing is unusual.
//
// Three rules, and each one is a thing an agency would otherwise discover the
// hard way in front of a client:
//
//  1. **Their own routes win.** A page SnabbSajt knows about is served only
//     where the app has no route of its own, because a catch-all that shadowed
//     `/kontakt` would replace a hand-built page with a content-managed one on
//     the day somebody typed that slug into the editor.
//  2. **An unknown block renders NOTHING, and says so.** Not a placeholder, not
//     an error boundary: a live page must never grow a grey box because a
//     deploy went out before the component did. `onMissingBlock` is how a build
//     log gets to complain while the visitor sees a page.
//  3. **The props are passed through as data.** No merging with defaults, no
//     coercion. The client's content is what the client wrote, and a component
//     that wants a fallback writes one in the component.
// ---------------------------------------------------------------------------

/** A section that is one of the agency's own blocks. */
export type BlockSection = RenderSection & {
  type: "block";
  content: {
    type: "block";
    blockType: string;
    version: number;
    props?: Record<string, unknown>;
    label?: string;
  };
};

export function isBlockSection(section: RenderSection): section is BlockSection {
  const content = section.content as { type?: unknown; blockType?: unknown };
  return (
    section.type === "block" &&
    content?.type === "block" &&
    typeof content.blockType === "string"
  );
}

/** One section resolved against the repo's library: what to render and with
 *  what. `definition` is present when the library knows the block, and the
 *  caller decides what an unknown one means (usually: nothing). */
export type ResolvedBlock = {
  blockType: string;
  version: number;
  props: Record<string, unknown>;
  variant: string;
  definition?: BlockDefinition;
};

export function resolveBlockSection(
  section: BlockSection,
  library: BlockLibrary,
): ResolvedBlock {
  const { blockType, version, props } = section.content;
  return {
    blockType,
    version,
    props: (props ?? {}) as Record<string, unknown>,
    variant: section.variant,
    definition: library[blockType],
  };
}

/** Find the page for a path, in the shape a catch-all route hands over.
 *
 *  `[]` and `[""]` are both the home page: Next gives an empty catch-all no
 *  segments, and a developer calling this by hand usually passes `""`. */
export function pageForSegments(
  site: RenderSite,
  segments: string[] | undefined,
): RenderPage | undefined {
  const slug = (segments ?? []).filter(Boolean).join("/");
  return site.pages.find((page) => page.slug === slug);
}

/** Every path this site would serve, for `generateStaticParams`.
 *
 *  The home page is included as an empty array, which is the shape Next expects
 *  and the one an app forgets: without it the home route falls through to the
 *  dynamic path on every request. */
export function staticParamsFor(site: RenderSite): { slug: string[] }[] {
  return site.pages.map((page) => ({
    slug: page.slug === "" ? [] : page.slug.split("/"),
  }));
}

/** The version of a block the page was written against, and the version the
 *  repo now declares. A build log that prints these is how an agency notices
 *  that a client's page is a migration behind, before the client does. */
export type BlockVersionDrift = {
  blockType: string;
  pageSlug: string;
  contentVersion: number;
  libraryVersion: number;
};

export function blockVersionDrift(
  site: RenderSite,
  library: BlockLibrary,
): BlockVersionDrift[] {
  const drift: BlockVersionDrift[] = [];
  for (const page of site.pages) {
    for (const section of page.sections) {
      if (!isBlockSection(section)) continue;
      const definition = library[section.content.blockType];
      if (!definition) continue;
      const libraryVersion = definition.version ?? 1;
      if (libraryVersion !== section.content.version) {
        drift.push({
          blockType: section.content.blockType,
          pageSlug: page.slug,
          contentVersion: section.content.version,
          libraryVersion,
        });
      }
    }
  }
  return drift;
}

/** Blocks a page uses that the repo does not declare.
 *
 *  The honest failure list: these render nothing, and the reason is always the
 *  same, a deploy that went out before the component did. */
export function missingBlocks(
  site: RenderSite,
  library: BlockLibrary,
): string[] {
  const missing = new Set<string>();
  for (const page of site.pages) {
    for (const section of page.sections) {
      if (!isBlockSection(section)) continue;
      if (!library[section.content.blockType]) {
        missing.add(section.content.blockType);
      }
    }
  }
  return [...missing].sort();
}
