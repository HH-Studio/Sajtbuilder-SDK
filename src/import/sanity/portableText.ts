// ---------------------------------------------------------------------------
// Portable Text -> our bounded text, with every loss recorded.
//
// A collection field is one of nine closed types and none of them is rich HTML
// (`convex/model/collections.ts`). `longText` is plain text. So the honest
// conversion of a Portable Text array is: keep the words, keep the structure a
// plain-text field can carry (paragraph breaks, list bullets), and REPORT every
// block we could not express instead of inventing markup for it.
//
// The failure mode this file exists to prevent is a converter that silently
// invents markup. A callout, an embedded YouTube, the agency's own custom block
// component: each becomes a named loss the report carries, never a guessed
// `<div>` and never a dropped-in silence.
// ---------------------------------------------------------------------------

/** One thing the conversion could not carry across. */
export type PortableTextLoss = {
  /** The Portable Text `_type` of the block or span. */
  blockType: string;
  /** Why it did not come across, in the words the report prints. */
  reason: string;
  /** A short excerpt, when there was any text at all to show. */
  excerpt?: string;
};

export type PortableTextResult = {
  text: string;
  losses: PortableTextLoss[];
  /** Asset ids referenced by images embedded IN the text. They cannot live in
   *  a `longText` field, so they are reported as losses too - but an agency
   *  that knows which pictures were in the body can put them back. */
  embeddedAssetIds: string[];
};

type Span = { _type?: string; text?: string; marks?: string[] };
type MarkDef = { _key?: string; _type?: string; href?: string };
type Block = {
  _type?: string;
  _key?: string;
  style?: string;
  listItem?: string;
  level?: number;
  children?: Span[];
  markDefs?: MarkDef[];
  [field: string]: unknown;
};

function excerptOf(value: unknown, max = 80): string | undefined {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return undefined;
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** True when the value looks like a Portable Text array: an array of objects
 *  where at least one is a `block`. */
export function isPortableText(value: unknown): value is Block[] {
  return (
    Array.isArray(value) &&
    value.some(
      (entry) =>
        !!entry && typeof entry === "object" && (entry as Block)._type === "block",
    )
  );
}

/** Convert one Portable Text array.
 *
 *  `maxChars` bounds the result the way the field it lands in is bounded; text
 *  past it is cut and the cut is reported, because a body that silently loses
 *  its last three paragraphs is the kind of loss an agency finds months later.
 */
export function portableTextToPlain(
  blocks: unknown,
  maxChars = 4000,
): PortableTextResult {
  const losses: PortableTextLoss[] = [];
  const embeddedAssetIds: string[] = [];
  if (!Array.isArray(blocks)) {
    return { text: "", losses, embeddedAssetIds };
  }
  const lines: string[] = [];
  for (const raw of blocks) {
    if (!raw || typeof raw !== "object") continue;
    const block = raw as Block;
    const type = block._type ?? "unknown";
    if (type !== "block") {
      // An embedded object: an image, a callout, a code sample, a YouTube
      // embed, or one of the agency's own components. None of them fits a
      // plain-text field, and none of them is guessed at.
      if (type === "image" || type === "file") {
        const ref = (block.asset as { _ref?: string } | undefined)?._ref;
        if (ref) embeddedAssetIds.push(ref);
        losses.push({
          blockType: type,
          reason:
            "a picture inside the text. A collection field holds text or one image, never both, so this one is listed here for you to place yourself.",
          ...(ref ? { excerpt: ref } : {}),
        });
        continue;
      }
      losses.push({
        blockType: type,
        reason:
          "an embedded block this text field cannot hold. Nothing was invented in its place.",
        ...(excerptOf(block) ? { excerpt: excerptOf(block) } : {}),
      });
      continue;
    }
    const marks = new Map<string, MarkDef>();
    for (const def of block.markDefs ?? []) {
      if (def?._key) marks.set(def._key, def);
    }
    let text = "";
    for (const child of block.children ?? []) {
      if (!child || typeof child !== "object") continue;
      if (child._type && child._type !== "span") {
        // An inline object - a footnote, an inline reference, an emoji
        // component. Same rule as a block-level one.
        losses.push({
          blockType: child._type,
          reason: "an inline object inside a paragraph. Its text, if any, was kept; the object was not.",
          ...(excerptOf(child) ? { excerpt: excerptOf(child) } : {}),
        });
      }
      const value = typeof child.text === "string" ? child.text : "";
      if (!value) continue;
      // A link is the one mark worth carrying, and the honest way to carry it
      // in plain text is to say where it goes. `strong` and `em` are dropped
      // without a loss entry: they change nothing a reader needs and reporting
      // every bolded word would bury the losses that matter.
      const link = (child.marks ?? [])
        .map((key) => marks.get(key))
        .find((def) => def?._type === "link" && def.href);
      text += link?.href ? `${value} (${link.href})` : value;
    }
    if (!text.trim()) continue;
    if (block.listItem) {
      const indent = "  ".repeat(Math.max(0, (block.level ?? 1) - 1));
      lines.push(`${indent}- ${text.trim()}`);
      continue;
    }
    lines.push(text.trim());
  }
  const joined = lines.join("\n\n");
  if (joined.length > maxChars) {
    losses.push({
      blockType: "block",
      reason: `the text was longer than the ${maxChars} characters this field holds, so the end was cut.`,
      excerpt: excerptOf(joined.slice(maxChars)),
    });
    return { text: joined.slice(0, maxChars), losses, embeddedAssetIds };
  }
  return { text: joined, losses, embeddedAssetIds };
}
