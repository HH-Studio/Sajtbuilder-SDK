import { parse, type DefaultTreeAdapterTypes } from "parse5";

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;

export type ScriptEvidence = { src?: string; inline?: string; externalText?: string };
export type FormEvidence = {
  action?: string;
  method: string;
  fields: Array<{ name?: string; type: string; label?: string; required?: boolean }>;
};
export type HtmlEvidence = {
  scripts: ScriptEvidence[];
  inlineHandlers: Array<{ element: string; attribute: string; value: string }>;
  forms: FormEvidence[];
  embeds: Array<{ element: string; src: string }>;
  thirdPartyHosts: string[];
};

export type HtmlDocumentInventory = {
  url: string;
  title: string;
  text: string;
  headings: Array<{ level: number; text: string }>;
  contentBlocks: Array<
    | { kind: "heading"; level: number; text: string }
    | { kind: "paragraph" | "list-item"; text: string }
  >;
  regions: Array<{ kind: string; text: string }>;
  navigation: Array<{ label: string; href: string }>;
  mediaGroups: string[][];
  links: string[];
  media: string[];
  stylesheets: string[];
  inlineStyles: string[];
  styleBlocks: string[];
  evidence: HtmlEvidence;
};

const INERT_TEXT_ELEMENTS = new Set(["script", "style", "noscript", "template"]);
const MAX_EVIDENCE_CHARS = 64 * 1024;
const MAX_STRUCTURE_ITEMS = 1_000;
const MAX_GALLERY_CANDIDATES = 128;

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

function attribute(element: Element, name: string): string | undefined {
  return element.attrs.find((entry) => entry.name.toLowerCase() === name)?.value;
}

function descendantText(root: Node, excludeInert: boolean): string {
  const values: string[] = [];
  const stack: Array<{ node: Node; inert: boolean }> = [{ node: root, inert: false }];
  while (stack.length > 0) {
    const { node, inert } = stack.pop()!;
    if ("value" in node && typeof node.value === "string") {
      if (!inert) values.push(node.value);
      continue;
    }
    const nextInert = inert || (excludeInert && isElement(node) && INERT_TEXT_ELEMENTS.has(node.tagName));
    if ("childNodes" in node) {
      for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
        stack.push({ node: node.childNodes[index]!, inert: nextInert });
      }
    }
  }
  return values.join(" ");
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function bounded(value: string): string {
  return value.slice(0, MAX_EVIDENCE_CHARS);
}

function resolveReference(value: string | undefined, base: URL): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, base).href;
  } catch {
    return undefined;
  }
}

function srcsetReferences(value: string | undefined, base: URL): string[] {
  if (!value) return [];
  const candidates: string[] = [];
  let offset = 0;
  while (offset < value.length) {
    while (offset < value.length && (/[\t\n\f\r ]/.test(value[offset]!) || value[offset] === ",")) offset += 1;
    const start = offset;
    while (offset < value.length && !/[\t\n\f\r ]/.test(value[offset]!)) offset += 1;
    let candidate = value.slice(start, offset);
    let endedWithComma = false;
    while (candidate.endsWith(",")) {
      candidate = candidate.slice(0, -1);
      endedWithComma = true;
    }
    if (candidate && !/^(?:data|javascript|blob):/i.test(candidate)) candidates.push(candidate);
    if (endedWithComma) continue;

    // Skip density/width descriptors up to the next top-level comma. Parentheses
    // are allowed in future descriptors and must not split a candidate.
    let parentheses = 0;
    while (offset < value.length) {
      const character = value[offset++]!;
      if (character === "(") parentheses += 1;
      else if (character === ")" && parentheses > 0) parentheses -= 1;
      else if (character === "," && parentheses === 0) break;
    }
  }
  return candidates
    .map((candidate) => resolveReference(candidate, base))
    .filter((candidate): candidate is string => Boolean(candidate));
}

function addThirdParty(value: string | undefined, base: URL, hosts: Set<string>): void {
  if (!value) return;
  try {
    const url = new URL(value);
    if ((url.protocol === "http:" || url.protocol === "https:") && url.hostname !== base.hostname) {
      hosts.add(url.hostname);
    }
  } catch {
    // Non-URL evidence stays inert and is not classified as a host.
  }
}

export function parseHtmlDocument(html: string, baseUrl: string): HtmlDocumentInventory {
  const documentUrl = new URL(baseUrl);
  const document = parse(html);
  let base = documentUrl;
  const baseStack: Node[] = [document];
  while (baseStack.length > 0) {
    const node = baseStack.pop()!;
    if (isElement(node) && node.tagName.toLowerCase() === "base") {
      const href = attribute(node, "href");
      if (href) {
        try {
          const candidate = new URL(href, documentUrl);
          if (candidate.protocol === "http:" || candidate.protocol === "https:") {
            base = candidate;
            break;
          }
        } catch {
          // Keep looking for the first base URL that browsers can resolve.
        }
      }
    }
    if ("childNodes" in node) {
      for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
        baseStack.push(node.childNodes[index]!);
      }
    }
  }
  const headings: HtmlDocumentInventory["headings"] = [];
  const contentBlocks: HtmlDocumentInventory["contentBlocks"] = [];
  const regions: HtmlDocumentInventory["regions"] = [];
  const navigation: HtmlDocumentInventory["navigation"] = [];
  const mediaGroups: string[][] = [];
  const mediaGroupKeys = new Set<string>();
  let galleryCandidates = 0;
  const links = new Set<string>();
  const media = new Set<string>();
  const stylesheets = new Set<string>();
  const inlineStyles: string[] = [];
  const styleBlocks: string[] = [];
  const thirdPartyHosts = new Set<string>();
  const evidence: HtmlEvidence = {
    scripts: [],
    inlineHandlers: [],
    forms: [],
    embeds: [],
    thirdPartyHosts: [],
  };
  let title = "";

  const stack: Node[] = [document];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (isElement(node)) {
      const tag = node.tagName.toLowerCase();
      if (tag === "title" && !title) title = compact(descendantText(node, true));
      if (/^h[1-6]$/.test(tag) && headings.length < MAX_STRUCTURE_ITEMS) {
        const heading = { level: Number(tag[1]), text: compact(descendantText(node, true)) };
        headings.push(heading);
        if (heading.text && contentBlocks.length < MAX_STRUCTURE_ITEMS) contentBlocks.push({ kind: "heading", ...heading });
      }
      if ((tag === "p" || tag === "blockquote" || tag === "li") && contentBlocks.length < MAX_STRUCTURE_ITEMS) {
        const blockText = compact(descendantText(node, true));
        if (blockText) contentBlocks.push({ kind: tag === "li" ? "list-item" : "paragraph", text: bounded(blockText) });
      }
      const role = attribute(node, "role")?.toLowerCase();
      const regionKind = ["header", "main", "section", "article", "aside", "footer", "nav"].includes(tag)
        ? tag
        : role && ["banner", "main", "region", "complementary", "contentinfo", "navigation"].includes(role)
          ? role
          : undefined;
      if (regionKind && regions.length < MAX_STRUCTURE_ITEMS) {
        const regionText = compact(descendantText(node, true));
        if (regionText) regions.push({ kind: regionKind, text: bounded(regionText) });
      }
      const groupingHint = `${attribute(node, "class") ?? ""} ${attribute(node, "id") ?? ""}`.toLowerCase();
      if (galleryCandidates < MAX_GALLERY_CANDIDATES && /(?:^|[\s_-])(?:gallery|photo-grid|image-grid|portfolio-grid)(?:$|[\s_-])/.test(groupingHint)) {
        galleryCandidates += 1;
        const references: string[] = [];
        const groupStack: Node[] = [node];
        while (groupStack.length > 0 && references.length < 24) {
          const candidate = groupStack.pop()!;
          if (isElement(candidate) && candidate.tagName.toLowerCase() === "img") {
            const source = resolveReference(attribute(candidate, "src"), base);
            if (source) references.push(source);
            references.push(...srcsetReferences(attribute(candidate, "srcset"), base));
          }
          if ("childNodes" in candidate) {
            for (let index = candidate.childNodes.length - 1; index >= 0; index -= 1) groupStack.push(candidate.childNodes[index]!);
          }
        }
        const unique = [...new Set(references)];
        const key = unique.join("\n");
        if (unique.length >= 3 && !mediaGroupKeys.has(key)) {
          mediaGroupKeys.add(key);
          mediaGroups.push(unique);
        }
      }

      for (const attr of node.attrs) {
        if (attr.name.toLowerCase().startsWith("on")) {
          evidence.inlineHandlers.push({ element: tag, attribute: attr.name.toLowerCase(), value: bounded(attr.value) });
        }
      }
      const style = attribute(node, "style");
      if (style) inlineStyles.push(bounded(style));

      if (tag === "a") {
        const href = resolveReference(attribute(node, "href"), base);
        if (href) links.add(href);
        if (href) {
          let parent: Node | undefined = node.parentNode as Node | undefined;
          while (parent) {
            if (isElement(parent) && (parent.tagName.toLowerCase() === "nav" || attribute(parent, "role")?.toLowerCase() === "navigation")) {
              const label = compact(descendantText(node, true));
              if (label && navigation.length < MAX_STRUCTURE_ITEMS) navigation.push({ label: bounded(label), href });
              break;
            }
            parent = "parentNode" in parent ? parent.parentNode as Node | undefined : undefined;
          }
        }
        addThirdParty(href, documentUrl, thirdPartyHosts);
      }
      if (tag === "img" || tag === "source" || tag === "video" || tag === "audio" || tag === "track") {
        const src = resolveReference(attribute(node, "src"), base);
        if (src) media.add(src);
        for (const candidate of srcsetReferences(attribute(node, "srcset"), base)) {
          media.add(candidate);
          addThirdParty(candidate, documentUrl, thirdPartyHosts);
        }
        addThirdParty(src, documentUrl, thirdPartyHosts);
        if (tag === "video") {
          const poster = resolveReference(attribute(node, "poster"), base);
          if (poster) media.add(poster);
          addThirdParty(poster, documentUrl, thirdPartyHosts);
        }
      }
      if (tag === "link") {
        const rel = (attribute(node, "rel") ?? "").toLowerCase().split(/\s+/);
        const as = (attribute(node, "as") ?? "").toLowerCase();
        const href = resolveReference(attribute(node, "href"), base);
        const isPreload = rel.includes("preload");
        if (href && (rel.includes("modulepreload") || (isPreload && as === "script"))) {
          evidence.scripts.push({ src: href });
        } else if (href && (rel.includes("stylesheet") || (isPreload && as === "style"))) {
          stylesheets.add(href);
        } else if (href && (rel.includes("icon") || (isPreload && ["audio", "font", "image", "track", "video"].includes(as)))) {
          media.add(href);
        }
        addThirdParty(href, documentUrl, thirdPartyHosts);
      }
      if (tag === "style") styleBlocks.push(bounded(descendantText(node, false)));
      if (tag === "script") {
        const src = resolveReference(attribute(node, "src"), base);
        const inline = bounded(descendantText(node, false).trim());
        evidence.scripts.push({ ...(src ? { src } : {}), ...(inline ? { inline } : {}) });
        addThirdParty(src, documentUrl, thirdPartyHosts);
      }
      if (tag === "form") {
        const action = resolveReference(attribute(node, "action"), base);
        const fields: FormEvidence["fields"] = [];
        const fieldStack: Node[] = [node];
        const fieldNodes: Element[] = [];
        const labelsByFor = new Map<string, string>();
        while (fieldStack.length > 0) {
          const fieldNode = fieldStack.pop()!;
          if (isElement(fieldNode)) {
            if (["input", "textarea", "select"].includes(fieldNode.tagName) && fieldNodes.length < MAX_STRUCTURE_ITEMS) fieldNodes.push(fieldNode);
            if (fieldNode.tagName.toLowerCase() === "label") {
              const target = attribute(fieldNode, "for");
              if (target && !labelsByFor.has(target)) labelsByFor.set(target, compact(descendantText(fieldNode, true)));
            }
          }
          if ("childNodes" in fieldNode) {
            for (let index = fieldNode.childNodes.length - 1; index >= 0; index -= 1) fieldStack.push(fieldNode.childNodes[index]!);
          }
        }
        for (const fieldNode of fieldNodes) {
            const fieldType = fieldNode.tagName === "input" ? attribute(fieldNode, "type") ?? "text" : fieldNode.tagName;
            let label = attribute(fieldNode, "id") ? labelsByFor.get(attribute(fieldNode, "id")!) : undefined;
            if (!label) {
              let parent: Node | undefined = fieldNode.parentNode as Node | undefined;
              while (parent && parent !== node) {
                if (isElement(parent) && parent.tagName.toLowerCase() === "label") {
                  label = compact(descendantText(parent, true));
                  break;
                }
                parent = "parentNode" in parent ? parent.parentNode as Node | undefined : undefined;
              }
            }
            fields.push({
              ...(attribute(fieldNode, "name") ? { name: attribute(fieldNode, "name") } : {}),
              type: fieldType,
              ...(label ? { label: bounded(label) } : {}),
              ...(attribute(fieldNode, "required") !== undefined ? { required: true } : {}),
            });
        }
        evidence.forms.push({ ...(action ? { action } : {}), method: (attribute(node, "method") ?? "get").toLowerCase(), fields });
        addThirdParty(action, documentUrl, thirdPartyHosts);
      }
      if (["iframe", "embed", "object"].includes(tag)) {
        const src = resolveReference(attribute(node, tag === "object" ? "data" : "src"), base);
        if (src) evidence.embeds.push({ element: tag, src });
        addThirdParty(src, documentUrl, thirdPartyHosts);
      }
    }
    if ("childNodes" in node) {
      for (let index = node.childNodes.length - 1; index >= 0; index -= 1) stack.push(node.childNodes[index]!);
    }
  }
  evidence.thirdPartyHosts = [...thirdPartyHosts].sort();

  return {
    url: documentUrl.href,
    title,
    text: compact(descendantText(document, true)),
    headings,
    contentBlocks,
    regions,
    navigation,
    mediaGroups,
    links: [...links],
    media: [...media],
    stylesheets: [...stylesheets],
    inlineStyles,
    styleBlocks,
    evidence,
  };
}
