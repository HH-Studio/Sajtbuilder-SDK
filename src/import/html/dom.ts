import { parse, type DefaultTreeAdapterTypes } from "parse5";

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;

export type ScriptEvidence = { src?: string; inline?: string; externalText?: string };
export type FormEvidence = {
  action?: string;
  method: string;
  fields: Array<{ name?: string; type: string }>;
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
  links: string[];
  media: string[];
  stylesheets: string[];
  inlineStyles: string[];
  styleBlocks: string[];
  evidence: HtmlEvidence;
};

const INERT_TEXT_ELEMENTS = new Set(["script", "style", "noscript", "template"]);
const MAX_EVIDENCE_CHARS = 64 * 1024;

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
      if (/^h[1-6]$/.test(tag)) headings.push({ level: Number(tag[1]), text: compact(descendantText(node, true)) });

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
        while (fieldStack.length > 0) {
          const fieldNode = fieldStack.pop()!;
          if (isElement(fieldNode) && ["input", "textarea", "select"].includes(fieldNode.tagName)) {
            const fieldType = fieldNode.tagName === "input" ? attribute(fieldNode, "type") ?? "text" : fieldNode.tagName;
            fields.push({ ...(attribute(fieldNode, "name") ? { name: attribute(fieldNode, "name") } : {}), type: fieldType });
          }
          if ("childNodes" in fieldNode) {
            for (let index = fieldNode.childNodes.length - 1; index >= 0; index -= 1) fieldStack.push(fieldNode.childNodes[index]!);
          }
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
    links: [...links],
    media: [...media],
    stylesheets: [...stylesheets],
    inlineStyles,
    styleBlocks,
    evidence,
  };
}
