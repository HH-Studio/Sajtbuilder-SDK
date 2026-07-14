# WordPress WXR parsing

WordPress conversion requires both a public URL and a WordPress WXR/XML export.
The URL supplies current rendered design and navigation evidence. WXR supplies
authoritative pages, posts, hierarchy, taxonomies, media relationships, menus,
status, and basic Yoast/Rank Math metadata.

`parseWxr()` reads the export as bounded inert data. It uses the streaming
`saxes` parser so the importer does not build an unbounded XML DOM. DTD and
entity declarations are rejected before parsing. Input bytes, depth, elements,
text nodes, items, terms, authors, attachments, and per-item metadata all have
explicit limits.

The parser intentionally excludes accounts, emails, passwords, comments,
revisions, PHP, themes, plugins, WooCommerce runtime, and page-builder runtime.
Source ids are import-local strings only. Nothing from WXR executes.

```ts
import { indexWxrMedia, parseWxr } from "@snabbsajt/site-kit";

const wxr = parseWxr(await Bun.file("export.xml").bytes());
const media = indexWxrMedia(wxr);
```

## Convert a site

```bash
snabbsajt site import wordpress \
  --url https://example.com \
  --wxr ./export.xml \
  --out ./example-wordpress
```

Both inputs are mandatory. The bounded public crawl supplies current URLs,
visible copy, design signals, behavior, and safe media bytes. WXR supplies the
authoritative page/post graph. The resulting `import-report.md` lists public vs
WXR conflicts, missing attachments, taxonomy relationships, old redirects, SEO
fields, drafts held from publishing, and plugin replacements.

Verified gallery attachment ids become a native gallery. Forms and booking
shortcodes remain inert review items unless every recipient, field, service,
duration, price, availability, timezone, and contact fact is sourced. PHP,
themes, plugins, accounts, comments, scripts, and page-builder runtime never
execute or enter the package.

Review, approve, validate, and pack exactly like an HTML import:

```bash
snabbsajt site import approve ./example-wordpress --yes
snabbsajt site validate ./example-wordpress
snabbsajt site pack ./example-wordpress -o example-wordpress.zip
```
