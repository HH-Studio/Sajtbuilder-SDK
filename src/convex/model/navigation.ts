import { v, type Infer } from "convex/values";

/** Targets that remain meaningful from every global navigation surface. */
export const globalNavTarget = v.union(
  v.object({ kind: v.literal("page"), pageSlug: v.string() }),
  v.object({ kind: v.literal("external"), url: v.string() }),
  v.object({ kind: v.literal("phone"), value: v.string() }),
  v.object({ kind: v.literal("email"), value: v.string() }),
  v.object({ kind: v.literal("booking") }),
);
export type GlobalNavTarget = Infer<typeof globalNavTarget>;

export const navMegaMenu = v.object({
  triggerLabel: v.string(),
  position: v.number(),
  groups: v.array(
    v.object({
      heading: v.string(),
      description: v.optional(v.string()),
      items: v.array(v.object({ label: v.string(), target: globalNavTarget })),
    }),
  ),
  featured: v.optional(
    v.object({
      eyebrow: v.optional(v.string()),
      title: v.string(),
      description: v.optional(v.string()),
      link: v.object({ label: v.string(), target: globalNavTarget }),
    }),
  ),
});
export type NavMegaMenu = Infer<typeof navMegaMenu>;
