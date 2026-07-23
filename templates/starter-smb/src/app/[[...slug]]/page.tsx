import { notFound } from "next/navigation";
import { site } from "@/site";
import { Nav } from "@/components/Nav";
import { SectionRenderer } from "@/components/sections";

// One route handles every page in `site.ts`. The slug segments map to a page's
// `slug` ("" = home). Sections render in `order` (fractional-indexing) order.
export function generateStaticParams() {
  return site.pages.map((p) => ({ slug: p.slug ? p.slug.split("/") : [] }));
}

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const path = (slug ?? []).join("/");

  const page = site.pages.find((p) => p.slug === path);
  if (!page) notFound();

  const sections = site.sections
    .filter((s) => s.pageTmpId === page.tmpId)
    .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));

  return (
    <>
      <Nav />
      <main>
        {sections.map((section, i) => (
          <SectionRenderer key={i} section={section} />
        ))}
      </main>
    </>
  );
}
