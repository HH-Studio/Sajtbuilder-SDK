import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const button = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [border-radius:var(--btn-radius)]",
  {
    variants: {
      variant: {
        primary: "btn-primary bg-primary text-primary-foreground hover:opacity-90",
        outline: "border border-border bg-transparent hover:bg-muted",
        ghost: "bg-transparent hover:bg-muted",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-4",
        lg: "h-12 px-7 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

type ButtonProps = VariantProps<typeof button> & {
  href?: string;
  className?: string;
  children: React.ReactNode;
};

/** A link-styled button. This template has no client interactivity, so every
 *  call to action is an anchor — which is also what SnabbSajt CTAs become. */
export function Button({ href, variant, size, className, children }: ButtonProps) {
  const classes = cn(button({ variant, size }), className);
  if (href) {
    const external = href.startsWith("http");
    return (
      <Link
        href={href}
        className={classes}
        {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      >
        {children}
      </Link>
    );
  }
  return <button className={classes}>{children}</button>;
}
