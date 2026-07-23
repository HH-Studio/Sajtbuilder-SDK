import type { PortableSectionContent, TypedSiteKitSection } from "@snabbsajt/site-kit";
import { Star } from "lucide-react";
import { Band, Eyebrow, Heading } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Typed content helpers. `PortableSectionContent` is the exact union SnabbSajt
// accepts, so each component below is typed to one real section shape.
// ---------------------------------------------------------------------------
type Content<T extends PortableSectionContent["type"]> = Extract<PortableSectionContent, { type: T }>;
type Cta = NonNullable<Content<"cta-band">["primaryCta"]>;
type CtaTarget = Cta["target"];

/** Turn a SnabbSajt CTA target into an href the preview can link to. */
export function ctaHref(target: CtaTarget): string {
  switch (target.kind) {
    case "external":
      return target.url;
    case "email":
      return `mailto:${target.value}`;
    case "phone":
      return `tel:${target.value}`;
    case "anchor":
      return `#${target.anchorId}`;
    case "page":
      return target.pageSlug ? `/${target.pageSlug}` : "/";
    case "booking":
      return "#";
    default:
      return "#";
  }
}

function CtaButton({ cta, variant = "primary" }: { cta?: Cta; variant?: "primary" | "outline" }) {
  if (!cta) return null;
  return (
    <Button href={ctaHref(cta.target)} variant={variant}>
      {cta.label}
    </Button>
  );
}

// ---- hero -----------------------------------------------------------------
function Hero({ c }: { c: Content<"hero"> }) {
  return (
    <Band>
      <div className="grid items-center gap-10 md:grid-cols-2">
        <div>
          {c.eyebrow && <Eyebrow>{c.eyebrow}</Eyebrow>}
          <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">{c.headline}</h1>
          {c.subheadline && (
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">{c.subheadline}</p>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            <CtaButton cta={c.primaryCta} />
            <CtaButton cta={c.secondaryCta} variant="outline" />
          </div>
        </div>
        <div className="aspect-[4/3] rounded-lg border border-border bg-muted" aria-hidden />
      </div>
    </Band>
  );
}

// ---- services -------------------------------------------------------------
function Services({ c, variant }: { c: Content<"services">; variant: string }) {
  const list = variant === "list";
  return (
    <Band tone="muted">
      <Heading>{c.heading}</Heading>
      {c.intro && <p className="mt-3 max-w-2xl text-muted-foreground">{c.intro}</p>}
      <div className={cn("mt-10 grid gap-6", list ? "md:grid-cols-2" : "md:grid-cols-3")}>
        {c.items.map((item, i) => (
          <div key={i} className="rounded-lg border border-border bg-background p-6">
            <h3 className="text-lg font-semibold">{item.title}</h3>
            {item.description && <p className="mt-2 text-muted-foreground">{item.description}</p>}
          </div>
        ))}
      </div>
    </Band>
  );
}

// ---- about ----------------------------------------------------------------
function About({ c }: { c: Content<"about"> }) {
  return (
    <Band>
      <div className="max-w-3xl">
        <Heading>{c.heading}</Heading>
        <p className="mt-6 text-lg leading-relaxed text-muted-foreground">{c.body}</p>
      </div>
    </Band>
  );
}

// ---- team -----------------------------------------------------------------
function Team({ c }: { c: Content<"team"> }) {
  return (
    <Band tone="muted">
      <Heading>{c.heading}</Heading>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 md:grid-cols-3">
        {c.members.map((m, i) => (
          <div key={i} className="rounded-lg border border-border bg-background p-6 text-center">
            <div className="mx-auto mb-4 h-20 w-20 rounded-full bg-muted" aria-hidden />
            <p className="font-semibold">{m.name}</p>
            {m.role && <p className="text-sm text-muted-foreground">{m.role}</p>}
          </div>
        ))}
      </div>
    </Band>
  );
}

// ---- testimonials ---------------------------------------------------------
function Testimonials({ c }: { c: Content<"testimonials"> }) {
  return (
    <Band>
      {c.heading && <Heading className="mb-10">{c.heading}</Heading>}
      <div className="grid gap-6 md:grid-cols-2">
        {c.quotes.map((q, i) => (
          <figure key={i} className="rounded-lg border border-border p-6">
            {typeof q.rating === "number" && (
              <div className="mb-3 flex gap-0.5" aria-label={`${q.rating} out of 5`}>
                {Array.from({ length: q.rating }).map((_, s) => (
                  <Star key={s} className="h-4 w-4 fill-primary text-primary" />
                ))}
              </div>
            )}
            <blockquote className="text-lg">&ldquo;{q.text}&rdquo;</blockquote>
            {q.author && <figcaption className="mt-4 text-sm text-muted-foreground">{q.author}</figcaption>}
          </figure>
        ))}
      </div>
    </Band>
  );
}

// ---- pricing --------------------------------------------------------------
function Pricing({ c }: { c: Content<"pricing"> }) {
  return (
    <Band tone="muted">
      <Heading className="mb-10">{c.heading}</Heading>
      <div className="grid gap-6 md:grid-cols-3">
        {c.tiers.map((t, i) => (
          <div key={i} className="flex flex-col rounded-lg border border-border bg-background p-6">
            <h3 className="text-lg font-semibold">{t.name}</h3>
            <p className="mt-2 text-2xl font-semibold">
              {t.price} {c.currency && <span className="text-base text-muted-foreground">{c.currency}</span>}
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              {(t.features ?? []).map((f, fi) => (
                <li key={fi}>{f}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Band>
  );
}

// ---- faq ------------------------------------------------------------------
function Faq({ c }: { c: Content<"faq"> }) {
  return (
    <Band>
      <Heading className="mb-8">{c.heading}</Heading>
      <div className="mx-auto max-w-2xl divide-y divide-border">
        {c.items.map((item, i) => (
          <details key={i} className="group py-4">
            <summary className="cursor-pointer list-none font-medium">{item.question}</summary>
            <p className="mt-2 text-muted-foreground">{item.answer}</p>
          </details>
        ))}
      </div>
    </Band>
  );
}

// ---- contact --------------------------------------------------------------
function Contact({ c, id }: { c: Content<"contact">; id?: string }) {
  return (
    <Band id={id}>
      <div className="mx-auto max-w-xl">
        <Heading className="mb-8">{c.heading}</Heading>
        {/* SnabbSajt handles submission natively. In this preview the form is
            inert — wire an action if you host it yourself. */}
        <form className="grid gap-4">
          {c.fields.map((f) => (
            <label key={f.key} className="grid gap-1.5 text-sm font-medium">
              {f.label}
              {f.type === "textarea" ? (
                <textarea
                  rows={4}
                  required={f.required}
                  className="rounded-md border border-input bg-background px-3 py-2 font-normal"
                />
              ) : (
                <input
                  type={f.type === "email" ? "email" : f.type === "phone" ? "tel" : "text"}
                  required={f.required}
                  className="h-11 rounded-md border border-input bg-background px-3 font-normal"
                />
              )}
            </label>
          ))}
          <Button className="mt-2">{c.submitLabel ?? "Send"}</Button>
        </form>
      </div>
    </Band>
  );
}

// ---- cta-band -------------------------------------------------------------
function CtaBand({ c }: { c: Content<"cta-band"> }) {
  return (
    <Band tone="inverted" className="text-center">
      <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{c.headline}</h2>
      {c.subtext && <p className="mx-auto mt-3 max-w-xl opacity-90">{c.subtext}</p>}
      <div className="mt-8 flex justify-center gap-3">
        <Button href={ctaHref(c.primaryCta.target)} variant="outline" className="border-primary-foreground text-primary-foreground">
          {c.primaryCta.label}
        </Button>
      </div>
    </Band>
  );
}

// ---- footer ---------------------------------------------------------------
function Footer({ c }: { c: Content<"footer"> }) {
  return (
    <footer className="border-t border-border py-10">
      <div className="container flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground md:flex-row">
        <p className="font-medium text-foreground">{c.businessName}</p>
        <p>&copy; {new Date().getFullYear()} {c.businessName}. All rights reserved.</p>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Renderer: one SnabbSajt section -> one component. Add a case here when you
// add a section type to your vocabulary.
// ---------------------------------------------------------------------------
export function SectionRenderer({ section }: { section: TypedSiteKitSection }) {
  const c = section.content;
  switch (c.type) {
    case "hero":
      return <Hero c={c} />;
    case "services":
      return <Services c={c} variant={section.variant} />;
    case "about":
      return <About c={c} />;
    case "team":
      return <Team c={c} />;
    case "testimonials":
      return <Testimonials c={c} />;
    case "pricing":
      return <Pricing c={c} />;
    case "faq":
      return <Faq c={c} />;
    case "contact":
      return <Contact c={c} id={section.anchorId} />;
    case "cta-band":
      return <CtaBand c={c} />;
    case "footer":
      return <Footer c={c} />;
    default:
      // A section type this template does not render yet. It still imports into
      // SnabbSajt fine — add a component + case above to preview it here.
      return null;
  }
}
