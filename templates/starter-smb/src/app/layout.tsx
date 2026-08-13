import type { Metadata } from "next";
import { loadSite } from "@/lib/site-source";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { businessName } = await loadSite();
  return {
    title: businessName,
    description: `${businessName} — built with the SnabbSajt starter template.`,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const site = await loadSite();
  // Theme tokens, whichever source the content came from: `src/site.ts` and a
  // published snapshot both carry the same set. `globals.css` maps them to CSS
  // variables, so a palette your client changed in SnabbSajt lands here too.
  const t = site.theme as {
    appearance?: string;
    palette?: string;
    fontPair?: string;
    radius?: string;
    buttonStyle?: string;
  };

  return (
    <html
      lang={site.language}
      className={t.appearance === "dark" ? "dark" : undefined}
      data-palette={t.palette}
      data-font={t.fontPair}
      data-radius={t.radius}
      data-btn={t.buttonStyle}
    >
      <body>{children}</body>
    </html>
  );
}
