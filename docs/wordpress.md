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

Parsing alone does not create a SnabbSajt package. Use the WordPress CLI command
to reconcile WXR with the current public site, review conflicts, and produce a
validated package.
