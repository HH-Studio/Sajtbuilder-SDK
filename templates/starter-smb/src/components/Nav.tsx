import Link from "next/link";
import { site } from "@/site";

export function Nav() {
  const pages = site.pages
    .filter((p) => p.showInNav)
    .sort((a, b) => a.order - b.order);

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="font-semibold tracking-tight">
          {site.site.businessName}
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          {pages.map((p) => (
            <Link
              key={p.tmpId}
              href={p.slug ? `/${p.slug}` : "/"}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {p.title}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
