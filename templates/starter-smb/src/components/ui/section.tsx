import { cn } from "@/lib/cn";

/** A full-width band with a centered, max-width container. `tone` mirrors the
 *  SnabbSajt section tone: default background, muted, or inverted. */
export function Band({
  children,
  tone = "default",
  id,
  className,
}: {
  children: React.ReactNode;
  tone?: "default" | "muted" | "inverted";
  id?: string;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "py-16 md:py-24",
        tone === "muted" && "bg-muted",
        tone === "inverted" && "bg-primary text-primary-foreground",
        className,
      )}
    >
      <div className="container">{children}</div>
    </section>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-sm font-medium uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  );
}

export function Heading({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn("text-3xl font-semibold tracking-tight md:text-4xl", className)}>{children}</h2>
  );
}
