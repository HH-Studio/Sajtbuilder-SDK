import { generate, lexer, parse, walk, type CssNode } from "css-tree";

export type CssEvidence = {
  source: string;
  colors: string[];
  fontFamilies: string[];
  fontWeights: string[];
  spacing: string[];
  breakpoints: string[];
  layout: string[];
  media: string[];
  imports: string[];
  animations: string[];
  warnings: string[];
};

const SPACING_PROPERTIES = new Set([
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "gap", "row-gap", "column-gap",
]);
const LAYOUT_PROPERTIES = new Set([
  "display", "position", "float", "clear", "overflow", "overflow-x", "overflow-y",
  "grid", "grid-template", "grid-template-columns", "grid-template-rows", "grid-area",
  "flex", "flex-flow", "flex-direction", "flex-wrap", "justify-content", "align-items",
  "columns", "column-count", "column-width",
]);

function unique(values: Set<string>): string[] {
  return [...values];
}

function resolveCssUrl(value: string, base: URL): string | undefined {
  if (/^(?:data|javascript):/i.test(value)) return undefined;
  try {
    return new URL(value, base).href;
  } catch {
    return undefined;
  }
}

function propertyMayContainColor(property: string): boolean {
  if (property.startsWith("--")) return false; // Usage is unknown; do not turn tokens into design facts.
  if (property === "color" || property.endsWith("-color")) return true;
  if (/^(?:background(?:-image)?|border(?:-(?:top|right|bottom|left|block(?:-(?:start|end))?|inline(?:-(?:start|end))?))?|border-image(?:-source)?|outline|column-rule|text-decoration|text-emphasis)$/.test(property)) return true;
  return ["box-shadow", "text-shadow", "fill", "stroke", "filter", "mask-image"].includes(property);
}

function collectDeclarationColors(node: CssNode, colors: Set<string>): void {
  walk(node, (child) => {
    if (child.type === "Hash") {
      colors.add(`#${child.value}`);
      return;
    }
    if (child.type !== "Identifier" && child.type !== "Function") return;
    try {
      if (lexer.matchType("color", child).error === null) colors.add(generate(child));
    } catch {
      // Malformed values remain parser warnings, never executable CSS.
    }
  });
}

export function parseCssEvidence(css: string, sourceUrl: string): CssEvidence {
  const base = new URL(sourceUrl);
  const warnings: string[] = [];
  const result = {
    colors: new Set<string>(),
    fontFamilies: new Set<string>(),
    fontWeights: new Set<string>(),
    spacing: new Set<string>(),
    breakpoints: new Set<string>(),
    layout: new Set<string>(),
    media: new Set<string>(),
    imports: new Set<string>(),
    animations: new Set<string>(),
  };
  let ast: CssNode;
  try {
    ast = parse(css, {
      positions: false,
      onParseError(error) {
        warnings.push(error.message);
      },
    });
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : String(error));
    return {
      source: base.href,
      colors: [], fontFamilies: [], fontWeights: [], spacing: [], breakpoints: [],
      layout: [], media: [], imports: [], animations: [], warnings,
    };
  }

  walk(ast, (node) => {
    if (node.type === "Declaration") {
      const property = node.property.toLowerCase();
      const value = generate(node.value);
      if (propertyMayContainColor(property)) collectDeclarationColors(node.value, result.colors);
      if (property === "font-family") result.fontFamilies.add(value);
      if (property === "font-weight") result.fontWeights.add(value);
      if (SPACING_PROPERTIES.has(property)) result.spacing.add(`${property}:${value}`);
      if (LAYOUT_PROPERTIES.has(property)) result.layout.add(`${property}:${value}`);
      if (property.startsWith("animation") || property.startsWith("transition")) {
        result.animations.add(`${property}:${value}`);
      }
    }
    if (node.type === "Atrule") {
      const name = node.name.toLowerCase();
      const prelude = node.prelude ? generate(node.prelude) : "";
      if (name === "media" && prelude) result.breakpoints.add(prelude);
      if (name.endsWith("keyframes")) result.animations.add(`@${name}${prelude ? ` ${prelude}` : ""}`);
      if (name === "import" && node.prelude) {
        walk(node.prelude, (child) => {
          if (child.type === "Url") {
            const resolved = resolveCssUrl(child.value, base);
            if (resolved) result.imports.add(resolved);
          } else if (child.type === "String") {
            const resolved = resolveCssUrl(child.value, base);
            if (resolved) result.imports.add(resolved);
          }
        });
      }
    }
    if (node.type === "Url") {
      const resolved = resolveCssUrl(node.value, base);
      if (resolved && !result.imports.has(resolved)) result.media.add(resolved);
    }
  });

  for (const imported of result.imports) result.media.delete(imported);
  return {
    source: base.href,
    colors: unique(result.colors),
    fontFamilies: unique(result.fontFamilies),
    fontWeights: unique(result.fontWeights),
    spacing: unique(result.spacing),
    breakpoints: unique(result.breakpoints),
    layout: unique(result.layout),
    media: unique(result.media),
    imports: unique(result.imports),
    animations: unique(result.animations),
    warnings,
  };
}
