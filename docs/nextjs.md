# Convert a Next.js site

Site Kit reads the finished site as content. It does not transplant App Router,
React components, Tailwind classes, server actions, or route handlers.

## Recommended workflow

1. Inventory routes under `app/` or `pages/`.
2. Open the rendered site and record the actual page content and navigation.
3. Create one SnabbSajt page for each substantial public page.
4. Fold thin routes into sections when that makes the result simpler.
5. Map reusable React components to built-in SnabbSajt section types.
6. Copy only used public images into the package `assets/` directory.
7. Replace app-only actions with typed SnabbSajt calls to action.
8. Validate, pack, import, and review on mobile before publishing.

## Route example

```text
app/page.tsx              -> page slug ""
app/services/page.tsx     -> page slug "services"
app/about/page.tsx        -> page slug "about"
app/contact/page.tsx      -> page slug "contact"
app/api/**                -> not imported
app/dashboard/**          -> not imported
```

Dynamic routes need a decision. A small set of real articles can become post
pages. A database-backed product catalog or authenticated application is not a
website section and should remain outside SnabbSajt.

## Component example

```tsx
<Hero title="Accounting without the admin" image="/team.jpg" />
<ServiceGrid services={services} />
<Testimonials items={reviews} />
```

maps to `hero`, `services`, and `testimonials` sections. The component props
become structured content. The JSX and CSS do not enter the package.

## What to report as unsupported

- Logged-in applications and dashboards
- Server actions and custom API routes
- Interactive calculators without a matching section
- Arbitrary checkout or booking embeds
- Custom animation systems
- Tracking scripts not represented by SnabbSajt's typed integrations
