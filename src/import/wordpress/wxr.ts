import { SaxesParser, type SaxesAttributePlain } from "saxes";
import { DEFAULT_WXR_LIMITS, type WxrAuthor, type WxrDocument, type WxrItem, type WxrItemTerm, type WxrLimits, type WxrTerm } from "./model";
import { extractWxrSeo } from "./seo";

type Frame = { name: string; text: string; attributes: Record<string, string> };
type MutableItem = Omit<WxrItem, "seo">;

function bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function required(value: string | undefined, label: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`WXR ${label} is required`);
  return normalized;
}

function positiveInteger(value: string | undefined, label: string): string {
  const normalized = required(value, label);
  if (!/^\d+$/.test(normalized)) throw new Error(`WXR ${label} must be an integer`);
  return normalized;
}

function optionalInteger(value: string | undefined, label: string): number | undefined {
  if (!value?.trim()) return undefined;
  if (!/^-?\d+$/.test(value.trim())) throw new Error(`WXR ${label} must be an integer`);
  return Number(value.trim());
}

function attrValue(value: string | SaxesAttributePlain): string {
  return typeof value === "string" ? value : value.value;
}

/**
 * Parse WordPress WXR as bounded inert data. DTDs/entities are rejected before
 * the streaming parser sees them, and no plugin/theme/PHP content executes.
 */
export function parseWxr(input: string | Uint8Array, overrides: Partial<WxrLimits> = {}): WxrDocument {
  const limits = { ...DEFAULT_WXR_LIMITS, ...overrides };
  const xml = typeof input === "string" ? input : new TextDecoder("utf-8", { fatal: true }).decode(input);
  if (bytes(xml) > limits.maxBytes) throw new Error(`WXR exceeds the ${limits.maxBytes} byte cap`);
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error("WXR DTD and entity declarations are not allowed");

  const document: WxrDocument = {
    version: "",
    title: "",
    siteUrl: "",
    blogUrl: "",
    authors: [],
    terms: [],
    items: [],
  };
  const frames: Frame[] = [];
  let elements = 0;
  let attachments = 0;
  let taxonomyAssignments = 0;
  let currentAuthor: Partial<WxrAuthor> | undefined;
  let currentTerm: Partial<WxrTerm> | undefined;
  let currentItem: MutableItem | undefined;
  let currentItemTerm: WxrItemTerm | undefined;
  let currentMeta: { key?: string; value?: string } | undefined;
  let parserError: Error | undefined;

  const parser = new SaxesParser({ xmlns: false });
  parser.on("doctype", () => {
    parserError = new Error("WXR DTD declarations are not allowed");
  });
  parser.on("error", (error) => {
    parserError = error;
  });
  parser.on("opentag", (tag) => {
    elements += 1;
    if (elements > limits.maxElements) throw new Error(`WXR exceeds the ${limits.maxElements} element cap`);
    if (frames.length + 1 > limits.maxDepth) throw new Error(`WXR exceeds the ${limits.maxDepth} level depth cap`);
    const attributes = Object.fromEntries(
      Object.entries(tag.attributes).map(([name, value]) => [name, attrValue(value)]),
    );
    frames.push({ name: tag.name, text: "", attributes });

    if (tag.name === "wp:author" && !currentItem) currentAuthor = {};
    if (["wp:category", "wp:tag", "wp:term"].includes(tag.name) && !currentItem) currentTerm = {};
    if (tag.name === "item") {
      if (document.items.length >= limits.maxItems) throw new Error(`WXR exceeds the ${limits.maxItems} item cap`);
      currentItem = { sourceId: "", type: "", status: "", title: "", slug: "", content: "", terms: [], metadata: {} };
    }
    if (tag.name === "wp:postmeta" && currentItem) currentMeta = {};
    if (tag.name === "category" && currentItem) {
      currentItemTerm = {
        taxonomy: attributes.domain ?? "",
        slug: attributes.nicename ?? "",
        name: "",
      };
    }
  });
  const appendText = (text: string) => {
    const frame = frames.at(-1);
    if (!frame) return;
    frame.text += text;
    if (bytes(frame.text) > limits.maxTextNodeBytes) {
      throw new Error(`WXR text node exceeds the ${limits.maxTextNodeBytes} byte cap`);
    }
  };
  parser.on("text", appendText);
  parser.on("cdata", appendText);
  parser.on("closetag", (tag) => {
    const frame = frames.pop();
    if (!frame || frame.name !== tag.name) throw new Error("WXR parser stack mismatch");
    const value = frame.text.trim();

    if (currentMeta && currentItem) {
      if (tag.name === "wp:meta_key") currentMeta.key = value;
      if (tag.name === "wp:meta_value") currentMeta.value = value;
      if (tag.name === "wp:postmeta") {
        const key = currentMeta.key?.trim();
        if (key) {
          if (Object.keys(currentItem.metadata).length >= limits.maxMetadataPerItem) {
            throw new Error(`WXR item exceeds the ${limits.maxMetadataPerItem} metadata cap`);
          }
          currentItem.metadata[key] = currentMeta.value ?? "";
        }
        currentMeta = undefined;
      }
    } else if (currentItem) {
      if (tag.name === "title") currentItem.title = value;
      else if (tag.name === "link") currentItem.link = value || undefined;
      else if (tag.name === "wp:post_id") currentItem.sourceId = positiveInteger(value, "post id");
      else if (tag.name === "wp:post_type") currentItem.type = value;
      else if (tag.name === "wp:status") currentItem.status = value;
      else if (tag.name === "wp:post_name") currentItem.slug = value;
      else if (tag.name === "wp:post_parent") currentItem.parentSourceId = value === "0" || !value ? undefined : positiveInteger(value, "post parent");
      else if (tag.name === "wp:menu_order") currentItem.menuOrder = optionalInteger(value, "menu order");
      else if (tag.name === "wp:post_date_gmt" || (tag.name === "wp:post_date" && !currentItem.publishedAt)) currentItem.publishedAt = value || undefined;
      else if (tag.name === "dc:creator") currentItem.creator = value || undefined;
      else if (tag.name === "content:encoded") currentItem.content = value;
      else if (tag.name === "excerpt:encoded") currentItem.excerpt = value || undefined;
      else if (tag.name === "wp:attachment_url") currentItem.attachmentUrl = value || undefined;
      else if (tag.name === "category" && currentItemTerm) {
        taxonomyAssignments += 1;
        if (document.terms.length + taxonomyAssignments > limits.maxTerms) {
          throw new Error(`WXR exceeds the ${limits.maxTerms} term cap`);
        }
        currentItemTerm.name = value;
        currentItem.terms.push(currentItemTerm);
        currentItemTerm = undefined;
      } else if (tag.name === "item") {
        currentItem.sourceId = positiveInteger(currentItem.sourceId, "post id");
        currentItem.type = required(currentItem.type, "post type");
        currentItem.status = required(currentItem.status, "post status");
        currentItem.title = required(currentItem.title, "post title");
        currentItem.slug ||= currentItem.sourceId;
        if (currentItem.type === "attachment") {
          attachments += 1;
          if (attachments > limits.maxAttachments) throw new Error(`WXR exceeds the ${limits.maxAttachments} attachment cap`);
        }
        const featuredMediaSourceId = currentItem.metadata._thumbnail_id?.trim();
        const seo = extractWxrSeo(currentItem.metadata);
        document.items.push({
          ...currentItem,
          ...(featuredMediaSourceId ? { featuredMediaSourceId } : {}),
          ...(seo ? { seo } : {}),
        });
        currentItem = undefined;
      }
    } else if (currentAuthor) {
      if (tag.name === "wp:author_id") currentAuthor.id = positiveInteger(value, "author id");
      else if (tag.name === "wp:author_login") currentAuthor.login = value || undefined;
      else if (tag.name === "wp:author_display_name") currentAuthor.displayName = value || undefined;
      else if (tag.name === "wp:author") {
        if (document.authors.length >= limits.maxAuthors) throw new Error(`WXR exceeds the ${limits.maxAuthors} author cap`);
        document.authors.push({ ...currentAuthor, id: positiveInteger(currentAuthor.id, "author id") });
        currentAuthor = undefined;
      }
    } else if (currentTerm) {
      if (tag.name === "wp:term_id") currentTerm.id = positiveInteger(value, "term id");
      else if (["wp:category_nicename", "wp:tag_slug", "wp:term_slug"].includes(tag.name)) currentTerm.slug = value;
      else if (["wp:cat_name", "wp:tag_name", "wp:term_name"].includes(tag.name)) currentTerm.name = value;
      else if (tag.name === "wp:term_taxonomy") currentTerm.taxonomy = value;
      else if (["wp:category", "wp:tag", "wp:term"].includes(tag.name)) {
        if (document.terms.length >= limits.maxTerms) throw new Error(`WXR exceeds the ${limits.maxTerms} term cap`);
        const taxonomy = tag.name === "wp:category" ? "category" : tag.name === "wp:tag" ? "tag" : required(currentTerm.taxonomy, "term taxonomy");
        document.terms.push({
          id: positiveInteger(currentTerm.id, "term id"),
          taxonomy,
          slug: required(currentTerm.slug, "term slug"),
          name: required(currentTerm.name, "term name"),
        });
        currentTerm = undefined;
      }
    } else {
      if (tag.name === "wp:wxr_version") document.version = value;
      else if (tag.name === "wp:base_site_url") document.siteUrl = value;
      else if (tag.name === "wp:base_blog_url") document.blogUrl = value;
      else if (tag.name === "title" && frames.at(-1)?.name === "channel") document.title = value;
    }
  });

  try {
    parser.write(xml).close();
  } catch (error) {
    throw new Error(`Invalid or unsafe WXR: ${(error as Error).message}`);
  }
  if (parserError) throw new Error(`Invalid or unsafe WXR: ${parserError.message}`);
  document.version = required(document.version, "version");
  document.title = required(document.title, "channel title");
  document.siteUrl = required(document.siteUrl, "base site URL");
  document.blogUrl ||= document.siteUrl;
  return document;
}
