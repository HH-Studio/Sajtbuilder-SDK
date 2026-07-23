import type { Metadata } from "next";
import { site } from "@/site";
import "./globals.css";

const t = site.site.theme;

export const metadata: Metadata = {
  title: site.site.businessName,
  description: `${site.site.businessName} — built with the SnabbSajt starter template.`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang={site.site.language}
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
