// ---------------------------------------------------------------------------
// The `illustration` section's drawing model.
//
// An authored site routinely carries a line drawing of its own — a mark, a
// diagram, a hand-drawn arrow. Importing one today loses it: an SVG is not a
// photograph, and there is no section that renders one.
//
// The obvious answer is "sanitise the file and inline it", and it is the wrong
// one. Sanitising markup is a denylist: it is only as good as the list of
// things you remembered to strip, and every year produces a new way to smuggle
// script through one. prd.md §8 asks for validated, bound tokens instead.
//
// So this model does not carry markup at all. It carries a viewBox and a list
// of PATHS, and the renderer builds the `<svg>` element itself. There is no
// `<script>` to strip because there is nowhere for one to live: an element
// that is not a `<path>` cannot be represented, a URL cannot be represented, an
// event attribute cannot be represented, and `foreignObject` cannot be
// represented. Colour is a closed set of site tokens, never a raw value, so an
// imported drawing also inherits the site's palette instead of freezing the
// source's.
//
// What that costs: gradients, clip paths, embedded rasters and text. An
// importer that meets one says so in the report rather than dropping it
// silently — see `docs/site-generation-and-import.md`.
// ---------------------------------------------------------------------------

/** Where a path takes its colour from. Site tokens only: an imported drawing
 *  should recolour with the site, and a raw value would also be the one place
 *  in this model that accepts a free string. */
export const ILLUSTRATION_INK_KEYS = [
  "ink",
  "muted",
  "primary",
  "accent",
  "border",
  "none",
] as const;
export type IllustrationInk = (typeof ILLUSTRATION_INK_KEYS)[number];

const INK_VAR: Record<IllustrationInk, string> = {
  ink: "var(--site-fg)",
  muted: "var(--site-muted-fg)",
  primary: "var(--site-primary)",
  accent: "var(--site-accent)",
  border: "var(--site-border)",
  none: "none",
};

/** A drawing is a diagram, not an illustration program: 64 paths is already
 *  more than any line drawing needs, and 8 kB of path data per path is a very
 *  detailed curve. Past either, an import is carrying something this section
 *  is the wrong home for. */
export const ILLUSTRATION_LIMITS = { paths: 64, pathData: 8192 } as const;

/** SVG path data: commands and numbers, nothing else. Deliberately a closed
 *  character set rather than a grammar — a `d` attribute cannot execute, and
 *  the only thing that matters is that nothing which is not path data gets in.
 *  Exponent notation (`1e-5`) is real output from real drawing tools. */
const PATH_DATA = /^[MmZzLlHhVvCcSsQqTtAa0-9,.\s+\-eE]+$/;

/** `minX minY width height`, all finite, with a positive extent. */
const VIEW_BOX = /^-?\d+(\.\d+)?( -?\d+(\.\d+)?){3}$/;

export function safeViewBox(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!VIEW_BOX.test(trimmed)) return undefined;
  const [, , width, height] = trimmed.split(" ").map(Number);
  if (!(width > 0) || !(height > 0)) return undefined;
  return trimmed;
}

export function safePathData(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > ILLUSTRATION_LIMITS.pathData) return undefined;
  if (!PATH_DATA.test(trimmed)) return undefined;
  // A path that starts anywhere other than a moveto is not a path a renderer
  // can place, and is the shape a truncated or spliced value takes.
  if (!/^[Mm]/.test(trimmed)) return undefined;
  return trimmed;
}

export function inkVar(value: string | undefined, fallback: IllustrationInk): string {
  return INK_VAR[
    (ILLUSTRATION_INK_KEYS as readonly string[]).includes(value ?? "")
      ? (value as IllustrationInk)
      : fallback
  ];
}

/** Stroke weight in viewBox units. Bounded so a bad number cannot paint the
 *  whole canvas or vanish. */
export function safeStrokeWidth(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value <= 0 || value > 64) return undefined;
  return value;
}

export type IllustrationPathInput = {
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
};

export type DrawablePath = {
  d: string;
  fill: string;
  stroke: string;
  strokeWidth?: number;
};

/** Everything the renderer needs, or `null` when nothing survived validation —
 *  in which case the section draws no `<svg>` at all rather than an empty box. */
export function drawableIllustration(content: {
  viewBox?: string;
  paths?: readonly IllustrationPathInput[];
}): { viewBox: string; paths: DrawablePath[] } | null {
  const viewBox = safeViewBox(content.viewBox);
  if (!viewBox) return null;
  const paths: DrawablePath[] = [];
  for (const path of (content.paths ?? []).slice(0, ILLUSTRATION_LIMITS.paths)) {
    const d = safePathData(path?.d);
    if (!d) continue;
    // A path with neither a fill nor a stroke is invisible. The default is the
    // one a line drawing wants — no fill, the site's ink as the line — but only
    // when the author asked for no fill either: adding an outline to a shape
    // that was filled on purpose is a different drawing.
    const known = (value: string | undefined): boolean =>
      (ILLUSTRATION_INK_KEYS as readonly string[]).includes(value ?? "");
    const strokeFallback: IllustrationInk = known(path.fill) ? "none" : "ink";
    paths.push({
      d,
      fill: inkVar(path.fill, "none"),
      stroke: inkVar(path.stroke, strokeFallback),
      strokeWidth: safeStrokeWidth(path.strokeWidth),
    });
  }
  return paths.length ? { viewBox, paths } : null;
}
