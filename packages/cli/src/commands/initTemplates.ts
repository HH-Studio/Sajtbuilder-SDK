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
    { key: "heading", kind: "text", label: "Rubrik" },
    { key: "body", kind: "richtext", label: "Text" },
    { key: "image", kind: "image", label: "Bild" },
    { key: "cta", kind: "link", label: "Knapp" },
  ],
});

export const library = blockLibrary(hero);
`;

export const COLLECTIONS_FILE = `import { defineCollection, collectionLibrary } from "${SITE_KIT}";

// The lists your client fills in: properties, staff, cases, menus, vehicles.
//
// You design the card once. They add rows forever, and they can never change
// the shape, because the shape lives here in your repository.
//
// Each row gets its own address, /<slugPrefix>/<row slug>, drawn by the block
// named in template.detailBlockType. bindings maps that block's field keys to
// this list's field keys, so one card block can draw two different lists.
//
// Data only, like blocks.ts. Delete this file if the site has no lists.

export const cases = defineCollection({
  key: "cases",
  name: "Referenser",
  slugPrefix: "referenser",
  fields: [
    { key: "client", type: "text", label: "Kund", required: true },
    { key: "summary", type: "longText", label: "Kort beskrivning" },
    { key: "cover", type: "image", label: "Bild" },
    { key: "year", type: "number", label: "\u00c5r" },
  ],
  template: {
    cardBlockType: "hero",
    detailBlockType: "hero",
    bindings: { heading: "client", body: "summary", image: "cover" },
  },
});

export const library = collectionLibrary(cases);
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
  collectionRowParams,
  isBlockSection,
  pageForSegments,
  renderModelFromPackage,
  resolveCollectionRow,
  resolveBlockSection,
  rowForSegments,
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
  const site = await loadSite();
  // Pages and rows in one list, because one catch-all answers for both. A row
  // whose list has no detail block is left out on purpose: its address would
  // draw nothing, and a build that pre-rendered it would publish a blank page.
  return [...staticParamsFor(site), ...collectionRowParams(site)];
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const site = await loadSite();

  // A row's own page, asked first: /referenser/villa-4 is two segments, which
  // a page can never be here, so this costs one array lookup and saves the
  // case where a client's page slug happens to collide with a list prefix.
  const found = rowForSegments(site, slug ?? []);
  if (found) {
    const resolved = resolveCollectionRow(
      found.collection,
      found.row,
      library,
      "detail",
    );
    const RowComponent = resolved ? components[resolved.blockType] : undefined;
    if (!RowComponent || !resolved) return null;
    return <RowComponent {...resolved.props} />;
  }

  const page = pageForSegments(site, slug ?? []);
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

// Reads exactly what \`snabbsajt pull --format portable\` writes into the repo:
// snabbsajt/content/site.json (the site WITHOUT its pages) and one file per
// page under snabbsajt/content/pages/. The split is what keeps a page edit to
// a one-file diff, so this puts the two halves back together.
//
// Replace it with your own read whenever you would rather fetch the published
// site from the delivery API than commit the JSON.
async function loadSite() {
  const { readFile, readdir } = await import("node:fs/promises");
  const dir = "snabbsajt/content";
  const site = JSON.parse(await readFile(\`\${dir}/site.json\`, "utf8"));
  // A repository that has never been pulled has no pages directory yet. An
  // empty site draws nothing, which beats a build that cannot start.
  const names = await readdir(\`\${dir}/pages\`).catch(() => [] as string[]);
  const pages = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name) =>
        JSON.parse(await readFile(\`\${dir}/pages/\${name}\`, "utf8")),
      ),
  );
  // Ordered by each page's own order, never by file name: a directory listing
  // sorts by locale and by filesystem, so a nav that came from it would
  // reshuffle on a colleague's machine.
  pages.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  // Through the render model rather than raw, so the lists your client fills
  // in arrive joined to their rows and a reference points at an address
  // instead of an internal id. A published site read from the delivery API
  // goes through renderModelFromPublished instead, and draws identically.
  return renderModelFromPackage({ ...site, pages });
}
`;

export const REVALIDATE_ROUTE_FILE = `import { revalidateTag } from "next/cache";
import { createRevalidateHandler } from "${SITE_KIT}";

// SnabbSajt calls this the moment your client publishes.
//
// Dropping a cache tag takes milliseconds. Rebuilding the whole deployment
// takes minutes and costs money, and that is what happens instead when this
// route is missing. So keep it, and tag the fetches that read your published
// content with SNABBSAJT_CACHE_TAG ("snabbsajt") so this one call refreshes
// them all:
//
//   fetch(url, { next: { tags: [SNABBSAJT_CACHE_TAG] } })
//
// There is no shared secret. The route carries no data and reveals nothing:
// the most a stranger achieves is making your deployment refetch content that
// is already public. Pass \`paths\` as well if you cache whole routes:
//
//   createRevalidateHandler({ revalidateTag, revalidatePath, paths: ["/"] })

export const POST = createRevalidateHandler({ revalidateTag });
`;
