// ---------------------------------------------------------------------------
// What `snabbsajt init --agency` writes into an agency's repository.
//
// Kept apart from the command so the files a developer opens on their first
// morning can be read and reviewed as files, rather than as escaped strings
// inside an orchestrator. Nothing here runs; it is text.
//
// The comments inside these templates are the real documentation for a block:
// they are what the agency's own Claude reads when it is asked to make one more
// field editable, and what a developer reads when nobody remembers who set the
// project up.
// ---------------------------------------------------------------------------

export const SITE_KIT = "@snabbsajt/site-kit";

export const BLOCKS_FILE = `import { defineBlock, blockLibrary } from "${SITE_KIT}";

// Your components, described once so SnabbSajt can put content into them.
//
// A block is one component of yours plus the fields the client may fill in.
// Those fields are what shows up in the client's editor, so name them for what
// the client sees, not for your prop names.
//
// Change a field and bump the version. A page keeps the version it was written
// against, so nothing goes blank while you work.
//
// This file is DATA: the CLI reads it and sends it to SnabbSajt. Keep React out
// of it, and put the component mapping in components.ts next door.

export const hero = defineBlock({
  type: "hero",
  label: "Hero",
  version: 1,
  fields: [
    { name: "heading", kind: "text", label: "Rubrik" },
    { name: "body", kind: "richtext", label: "Text" },
    { name: "image", kind: "image", label: "Bild" },
    { name: "cta", kind: "link", label: "Knapp" },
  ],
});

export const library = blockLibrary(hero);
`;

export const COMPONENTS_FILE = `import type { ComponentType } from "react";

// Which component draws which block.
//
// Kept apart from blocks.ts on purpose: that file is data the CLI sends to
// SnabbSajt, and a React import in it would drag your component tree into the
// push. Add one line here per block you declare.

export const components: Record<string, ComponentType<Record<string, unknown>>> = {
  // hero: Hero,
};
`;

export const PAGE_FILE = `import {
  isBlockSection,
  pageForSegments,
  resolveBlockSection,
  staticParamsFor,
} from "${SITE_KIT}";
import { library } from "@/snabbsajt/blocks";
import { components } from "@/snabbsajt/components";

// Every page the client makes in SnabbSajt, drawn by your own components.
//
// This is a catch-all, so it answers any address your app has no route for.
// Your own routes keep winning, because Next.js prefers a specific route over
// this one. Nothing you already built changes.

export async function generateStaticParams() {
  return staticParamsFor(await loadSite());
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const page = pageForSegments(await loadSite(), slug ?? []);
  if (!page) return null;
  return (
    <>
      {page.sections.filter(isBlockSection).map((section) => {
        const resolved = resolveBlockSection(section, library);
        const Component = components[resolved.blockType];
        // An unknown block draws nothing rather than throwing. A page the
        // client published must not break because a component was renamed.
        if (!Component) return null;
        return <Component key={section.id} {...resolved.props} />;
      })}
    </>
  );
}

// Replace this with your own read: the published site from the delivery API,
// or the JSON that snabbsajt pull writes into the repo.
async function loadSite() {
  const { readFile } = await import("node:fs/promises");
  return JSON.parse(await readFile("snabbsajt/site.json", "utf8"));
}
`;
