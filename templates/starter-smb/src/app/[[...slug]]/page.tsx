import { notFound } from "next/navigation";
import { findPage } from "@snabbsajt/site-kit";
import { loadSite } from "@/lib/site-source";
import { Nav } from "@/components/Nav";
import { SectionRenderer } from "@/components/sections";

// One route handles every page of the site — whether it comes from `src/site.ts`
// or from the published SnabbSajt snapshot (see `src/lib/site-source.ts`). The
// slug segments map to a page's `slug` ("" = home).
export async function generateStaticParams() {
  const model = await loadSite();
  return model.pages.map((p) => ({ slug: p.slug ? p.slug.split("/") : [] }));
}

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const path = (slug ?? []).join("/");

  const model = await loadSite();
  const page = findPage(model, path);
  if (!page) notFound();

  return (
    <>
      <Nav site={model} />
      <main>
        {page.sections.map((section, i) => (
          <SectionRenderer key={i} section={section} assets={model.assets} />
        ))}
      </main>
    </>
  );
}
