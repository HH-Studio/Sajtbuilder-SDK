---
name: make-site-editable
description: Turn an agency's own Next.js app into a SnabbSajt agency site - wrap components in defineBlock, declare the lists they fill in with defineCollection, move each page's composition into SnabbSajt content, push, and walk the doctor contract. Use when the human says "make this site editable", "gor den har sajten redigerbar", "connect this repo to SnabbSajt", "our client should be able to edit this", or asks to add a field to a block their client cannot change yet. The code keeps rendering the site; SnabbSajt only holds the content.
metadata:
  skill-version: "1.1.0"
  minimum-cli-version: "0.5.0"
  portable-format: "sajt-site@1"
---

# Make an existing app editable by its owner

The human is an agency. They wrote this app, they keep writing it, and their
client should be able to change the words and pictures without asking them.

**Their code keeps rendering the site.** SnabbSajt holds the CONTENT and the
editor. Nothing here moves their design system, their components or their
deployment anywhere.

## What "done" means

The client opens their website in SnabbSajt, sees the real page, changes a
heading, and the change is live after they publish. Nothing else counts as done,
so do not stop at "the block compiles".

## Order of work

1. **Set the repository up.**

   ```bash
   npx @snabbsajt/cli@latest init --agency
   ```

   It writes `snabbsajt/blocks.ts`, `snabbsajt/components.ts` and the catch-all
   route, adds the package, links the directory to a site, and pairs a write
   token. It never overwrites a file the agency wrote, so read what it reports
   as "kept" and merge those by hand.

2. **Describe one component, not all of them.** Pick the page the client
   complains about most. Wrap the components on it with `defineBlock`, one field
   per thing a client would ask you to change:

   ```ts
   export const hero = defineBlock({
     type: "hero",
     label: "Hero",
     version: 1,
     fields: [
       { key: "heading", kind: "text", label: "Rubrik" },
       { key: "image", kind: "image", label: "Bild" },
     ],
   });
   ```

   Name fields for what the CLIENT sees, never for the prop. `heading` is a
   field; `titleSlotOverride` is a prop leaking into somebody's Tuesday.

3. **Map the component.** One line per block in `snabbsajt/components.ts`. Keep
   React out of `blocks.ts`: that file is data the CLI sends.

4. **Move the composition, not the code.** The page's content becomes SnabbSajt
   sections of type `block`. The component still draws it. If a value cannot be
   a field (a computed price, a live count), leave it in the code and say so.

5. **Push, then look.**

   ```bash
   npx @snabbsajt/cli@latest push . --site <id>
   ```

   Then open the site in SnabbSajt and check the page renders in the editor's
   frame. A block that shows a placeholder outline is one whose schema landed
   and whose component did not.

6. **Walk the doctor contract.**

   ```bash
   npx @snabbsajt/cli@latest site doctor
   ```

   Fix what it names. The four that bite most often: `images.remotePatterns` has
   to allow the SnabbSajt asset host, the locales have to match the site's, the
   head tags have to survive the catch-all, and `frame-ancestors` has to allow
   the editor or the client sees a blank frame.

7. **Write the finish list.** Say plainly what the client can now change, what
   is still code, and what you would make editable next. An agency that skips
   this hands the client an editor and no idea what it reaches.

## Rules

- **Never execute the client's or the source's code to find out what it does.**
  Read it.
- **Never invent content.** Keep their real wording, prices, hours and contact
  details. A value you cannot find stays a review item.
- **A field the client should not touch stays out of the block, or is locked in
  the app.** A Byggare can lock one field from the dock, which is the right
  answer for the price on the pricing page: the rest of the page stays editable.
- **Bump the version when a field changes shape.** A page keeps the version it
  was written against, so nothing goes blank while you work.
- **Do not publish.** Publishing is the client's, or an explicit ask.

## When the page is a LIST

A block is one thing on a page. When the client's ask is "we add a new property
every week", that is a collection: you design the card once, they add rows
forever, and they can never change the shape, because the shape is in the repo.

```ts
// snabbsajt/collections.ts
export const properties = defineCollection({
  key: "properties",
  name: "Objekt",
  slugPrefix: "objekt",
  fields: [
    { key: "address", type: "text", label: "Adress", required: true },
    { key: "price", type: "number", label: "Pris" },
    { key: "photo", type: "image", label: "Bild" },
  ],
  template: {
    cardBlockType: "property-card",
    detailBlockType: "property-page",
    bindings: { heading: "address", amount: "price", image: "photo" },
  },
});

export const library = collectionLibrary(properties);
```

Three things follow from that file and nothing else is needed:

- `snabbsajt push` sends it, so the list appears in the client's sidebar.
- `rowsFor(site, "objekt")` gives your own list component its rows.
- `/objekt/<slug>` renders through the catch-all, drawn by `property-page`.

Nine field types: `text`, `longText`, `number`, `date`, `image`, `link`,
`boolean`, `choice`, `reference`. A `reference` names another collection by its
`key`, and `referencedHref` turns one into an address.

**Rows are never in the repo.** They are the client's, and a push that carried
them would overwrite a month of their typing on every deploy.

## When you are asked for one more field

"Gör hero-bilden redigerbar" is a one-line change: add the field to
`defineBlock`, bump the version, push. The in-app locks and hidden fields the
agency set survive a push, so you are not undoing anybody's toggles.
