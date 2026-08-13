// ---------------------------------------------------------------------------
// Computed-style sampling. Parsing source CSS is a guess (framework defaults
// out-vote the real brand, resolved CSS vars are invisible). The reliable way
// to know the colour/fonts a visitor actually sees is to read them off the
// RENDERED page with getComputedStyle. This module provides:
//   * `readComputedDesignInPage` - runs in a browser/render context (Playwright,
//     Firecrawl actions, a headless render step) and returns a raw sample.
//   * `normalizeComputedSample` - pure, cleans the raw sample into a
//     `ComputedSample` for `htmlToPortableSite(html, css, sample)` /
//     `applyComputedSample`.
//
// The split keeps the DOM-dependent read separate from the pure normalisation,
// so the normaliser is unit-testable without a browser.
// ---------------------------------------------------------------------------

import type {
  ComputedSample,
  MeasuredRole,
  MeasuredSectionSample,
  MeasuredTypeRole,
} from "./types";
import { safeLength } from "../../lib/sections/theme";

/** One element's typography exactly as the browser resolved it. Strings, because
 *  that is what `getComputedStyle` returns; `normalizeComputedSample` converts
 *  them (a px line-height becomes a ratio, "normal" becomes absent). */
export type RawRoleSample = {
  fontFamily?: string | null;
  fontSize?: string | null; // "80px"
  fontWeight?: string | null; // "700"
  lineHeight?: string | null; // "84px" | "normal"
  letterSpacing?: string | null; // "-2.4px" | "normal"
  textTransform?: string | null; // "uppercase" | "none"
  color?: string | null; // "rgb(17, 32, 50)"
};

export type RawComputedSample = {
  brandColor?: string | null; // any CSS colour string as painted
  headingFont?: string | null;
  bodyFont?: string | null;
  heroBackgroundImage?: boolean;
  /** Per-role measured type, keyed by the renderer's own type roles. This is
   *  what lifts an import above "our type scale wearing their words": the
   *  source's real px sizes, weights, tracking and casing per heading level. */
  type?: Partial<Record<MeasuredRole, RawRoleSample>>;
  /** The typeface used on SECTION headings (h2), which is regularly a different
   *  cut from the h1 - a condensed face for section labels, a display face for
   *  the headline. When the two differ the import gets a third font role. */
  sectionHeadingFont?: string | null;
  /** Measured section rhythm + content container widths, as CSS lengths. */
  layout?: {
    sectionPy?: string | null;
    containerDefault?: string | null;
    containerNarrow?: string | null;
    /** Row gap of the page's multi-column bands. Webflow's is routinely larger
     *  than ours, which is most of why a measured import's two-column band came
     *  out ~130px shorter than its source at desktop. */
    gridGap?: string | null;
  };
  /** Page colours as painted, rather than derived from the brand hue: the
   *  document background, its ink, the body-copy grey and the alternating band
   *  background. The generated palette takes these back verbatim. */
  colors?: {
    bg?: string | null;
    fg?: string | null;
    mutedFg?: string | null;
    muted?: string | null;
  };
  /** Geometry read off EACH BAND of the page, rather than the page median.
   *  `key` is the band's own heading, normalised - the only handle that
   *  survives the trip from a rendered DOM to a built section, since the
   *  importer's detectors emit in their own order and byte offsets do not
   *  cross the wire. A band with no heading is not reported at all: a
   *  measurement that cannot be attributed is worse than none. */
  sections?: Array<{
    key?: string | null;
    paddingTop?: string | null;
    paddingBottom?: string | null;
    maxWidth?: string | null;
    gap?: string | null;
    /** Computed `text-align` of the band's own heading. */
    align?: string | null;
  }>;
  /** How many of the page's stylesheets actually applied. 0 means the renderer
   *  produced an UNSTYLED page (some crawler renderers block CSS for speed), in
   *  which case every computed value is a browser default and the whole sample
   *  must be thrown away - a static guess beats a confidently wrong measurement. */
  appliedStylesheets?: number;
};

/**
 * Runs IN THE PAGE (browser context). Weighs colours painted on buttons/links/
 * nav highest, ignores neutrals, and reports the dominant accent plus the
 * resolved heading/body families and whether the hero paints a background
 * image. Returns a `RawComputedSample`. Not called in Node - evaluate it in the
 * page via `computedDesignScript()` (see the note there on why the serialised
 * form, not the function reference, is what you should pass).
 */
export function readComputedDesignInPage(
  /** The document to measure. Absent = the page this runs in, which is what a
   *  render provider evaluating `computedDesignScript()` wants.
   *
   *  Passed explicitly by the ARCHIVE lane: an uploaded folder has no address
   *  to render, so it is measured in a sandboxed iframe in the owner's own
   *  browser instead (see lib/import/archiveDocument.ts). `getComputedStyle`
   *  must come from that iframe's window - the parent's would resolve against
   *  the wrong document. */
  target?: { document: Document; window: Window },
): RawComputedSample {
  const doc = target?.document ?? document;
  const win = (target?.window ?? window) as unknown as {
    getComputedStyle: typeof getComputedStyle;
  };
  const toRgb = (c: string): [number, number, number] | null => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(",").map((x) => parseFloat(x));
    if (p.length >= 4 && p[3] === 0) return null;
    return [p[0], p[1], p[2]];
  };
  const chroma = ([r, g, b]: [number, number, number]) => (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  const freq = new Map<string, number>();
  const bump = (c: string, w: number) => {
    const rgb = toRgb(c);
    if (!rgb || chroma(rgb) < 0.12) return;
    const key = rgb.map(Math.round).join(",");
    freq.set(key, (freq.get(key) ?? 0) + w);
  };
  for (const el of Array.from(doc.querySelectorAll("a,button,.w-button,[class*=btn],[class*=button],nav a"))) {
    const s = win.getComputedStyle(el);
    bump(s.backgroundColor, 3);
    bump(s.color, 2);
    bump(s.borderColor, 1);
  }
  let best: { k: string; w: number } | null = null;
  for (const [k, w] of freq) if (!best || w > best.w) best = { k, w };
  const rgb = best ? best.k.split(",").map(Number) : null;
  const hex = rgb ? "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("") : null;
  const fam = (el: Element | null) =>
    el ? win.getComputedStyle(el).fontFamily.split(",")[0].replace(/["']/g, "").trim() : null;
  const hero = doc.querySelector("[class*=hero],header,[class*=banner],[class*=masthead]");
  const heroBg = hero ? win.getComputedStyle(hero).backgroundImage : "";
  // Did the page's CSS actually apply? A cross-origin sheet throws on cssRules
  // (loaded, just opaque) and a same-origin one reports its rule count; a sheet
  // the renderer refused to fetch reports 0 rules without throwing. Zero across
  // the board = an unstyled render, so the caller must discard this sample.
  let applied = 0;
  for (const sheet of Array.from(doc.styleSheets)) {
    try {
      if ((sheet as CSSStyleSheet).cssRules.length > 0) applied++;
    } catch {
      applied++; // cross-origin => it loaded
    }
  }
  // --- measured type / layout / colour -------------------------------------
  // Everything above reads ONE signal each (a colour, two family names). The
  // block below reads the design: per-role type, section rhythm, container
  // width and the page's own ink/paper. All of it off the rendered page, so a
  // CSS variable, a framework reset and a media query are already resolved.
  const cs = (el: Element) => win.getComputedStyle(el);
  const visible = (el: Element) => {
    const s = cs(el);
    if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return false;
    const r = el.getBoundingClientRect();
    return r.width >= 1 && r.height >= 1;
  };
  /** First VISIBLE match carrying at least `minLen` characters of real text.
   *  Hidden mobile duplicates and empty wrappers are the usual first match, and
   *  measuring one of those reports the wrong design with full confidence. */
  const pick = (sel: string, minLen: number): Element | null => {
    for (const el of Array.from(doc.querySelectorAll(sel))) {
      if ((el.textContent || "").trim().length < minLen) continue;
      if (!visible(el)) continue;
      return el;
    }
    return null;
  };
  const roleOf = (el: Element | null) => {
    if (!el) return undefined;
    const s = cs(el);
    return {
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      lineHeight: s.lineHeight,
      letterSpacing: s.letterSpacing,
      textTransform: s.textTransform,
      color: s.color,
    };
  };
  const h1El = pick("h1", 1);
  const h2El = pick("h2", 1);
  const h3El = pick("h3,h4", 1);
  // A paragraph long enough to be prose, not a label or a caption.
  const bodyEl = pick("p", 80);
  // The pull-quote. Big type that is neither a heading nor prose, and the one
  // element editorial sites most often give a third size and its own casing.
  //
  // BIGGEST wins, and headings count. The old selector took the first matching
  // `p` inside a testimonial block, which on a real page is the attribution
  // line ("- Jon Kabat-Zinn") or a caption - so a 58px pull-quote measured as
  // 16px and the band collapsed. A pull-quote is by definition the largest text
  // in its block, so pick on SIZE rather than document order.
  const quoteEl = (() => {
    const sel =
      "blockquote,blockquote p,[class*=quote] h1,[class*=quote] h2,[class*=quote] h3,[class*=quote] p," +
      "[class*=testimonial] h1,[class*=testimonial] h2,[class*=testimonial] h3,[class*=testimonial] p";
    // A lower text floor than the other roles, and scoped to quote/testimonial
    // containers so it can afford one: a pull-quote is routinely split across
    // several elements, one LINE each, and on a phone those lines are short.
    // The reference page's mobile quote lines are 19 characters, so a 20-char
    // floor measured the quote at desktop and not at all on a phone - which
    // left a 58px quote pinned at 58px on a 375px screen, the exact failure the
    // responsive ramp exists to fix.
    let best: { el: Element; size: number } | null = null;
    for (const el of Array.from(doc.querySelectorAll(sel))) {
      if ((el.textContent || "").trim().length < 12) continue;
      if (!visible(el)) continue;
      const size = parseFloat(cs(el).fontSize);
      if (!isFinite(size)) continue;
      if (!best || size > best.size) best = { el, size };
    }
    return best?.el ?? null;
  })();
  // The hero subhead: the first leaf text node after the h1 inside its own
  // block. It is a distinct role on almost every real page (lighter weight, much
  // larger than body) and collapsing it onto `body` is visible immediately.
  let leadEl: Element | null = null;
  if (h1El) {
    const scope = h1El.closest("section,header,div") || doc.body;
    for (const el of Array.from(scope.querySelectorAll("p,div,span"))) {
      // 4 = DOCUMENT_POSITION_FOLLOWING
      if (!(h1El.compareDocumentPosition(el) & 4)) continue;
      if (el.children.length > 0) continue;
      if ((el.textContent || "").trim().length < 20) continue;
      if (!visible(el)) continue;
      leadEl = el;
      break;
    }
  }
  const type: Record<string, ReturnType<typeof roleOf>> = {};
  const put = (role: string, el: Element | null) => {
    const r = roleOf(el);
    if (r) type[role] = r;
  };
  // The source's h1 is its HERO headline, and that is our `display` role.
  //
  // Our `h1` role is not the hero - it is what `PageTopHeading` renders on a
  // page whose first band is not a hero, i.e. a SECTION heading. So it takes
  // the source's h2 whenever the page has one, and only falls back to the h1
  // on a page with no section headings at all. Taking the hero's numbers for
  // both put an 80px/700 headline on every section head: on a phone that alone
  // made the reference import 8% taller than its source.
  put("display", h1El);
  put("h1", h2El ?? h1El);
  put("h2", h2El);
  put("h3", h3El);
  put("lead", leadEl);
  put("body", bodyEl);
  put("quote", quoteEl);

  // Section rhythm. Only bands whose top and bottom padding agree count - an
  // asymmetric one is a layout quirk, not the page's rhythm - and the median
  // beats the mean because one huge hero would drag an average up.
  const pys: number[] = [];
  for (const el of Array.from(doc.querySelectorAll("section,[class*=section],main > div"))) {
    const s = cs(el);
    const pt = parseFloat(s.paddingTop);
    const pb = parseFloat(s.paddingBottom);
    if (!isFinite(pt) || !isFinite(pb)) continue;
    if (pt >= 32 && Math.abs(pt - pb) <= 4) pys.push(pt);
  }
  const median = (a: number[]): number | null => {
    if (a.length === 0) return null;
    const b = a.slice().sort((x, y) => x - y);
    return b[Math.floor(b.length / 2)];
  };
  const sectionPy = median(pys);

  // Container width: the most frequently APPLIED px max-width in the page's
  // content range. Frequency, not the largest, because one oversized banner
  // should not redefine the site's measure.
  const widthFreq = new Map<number, number>();
  for (const el of Array.from(doc.querySelectorAll("div,section,main,article"))) {
    const mw = cs(el).maxWidth;
    if (!/px$/.test(mw)) continue;
    const v = Math.round(parseFloat(mw));
    if (!isFinite(v) || v < 480 || v > 1600) continue;
    widthFreq.set(v, (widthFreq.get(v) || 0) + 1);
  }
  const byFreq = Array.from(widthFreq.entries()).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const containerDefault = byFreq.length > 0 ? byFreq[0][0] : null;
  const narrowCandidates =
    containerDefault === null
      ? []
      : byFreq.filter(([v]) => v <= containerDefault * 0.8);
  const containerNarrow = narrowCandidates.length > 0 ? narrowCandidates[0][0] : null;

  // Row gap of the page's real multi-column grids. Only grids with more than
  // one column and more than one child count - a one-column grid's row gap is a
  // stack spacing, not the page's grid rhythm. Median, for the same reason the
  // section padding is a median: one unusual band must not redefine the page.
  const gaps: number[] = [];
  for (const el of Array.from(doc.querySelectorAll("*"))) {
    const s2 = cs(el);
    if (s2.display !== "grid" && s2.display !== "inline-grid") continue;
    if ((s2.gridTemplateColumns || "").trim().split(/\s+/).length < 2) continue;
    if (el.children.length < 2) continue;
    const gap = parseFloat(s2.rowGap);
    if (isFinite(gap) && gap >= 8 && gap <= 160) gaps.push(gap);
  }
  const gridGap = median(gaps);

  // Paper and ink as painted. `body` can be transparent when the background
  // sits on <html>, so fall through rather than reporting "transparent".
  const bodyCs = cs(doc.body);
  const rootCs = cs(doc.documentElement);
  const TRANSPARENT = /^(transparent|rgba\(0,\s*0,\s*0,\s*0\))$/;
  const opaque = (c: string) => (c && !TRANSPARENT.test(c.replace(/\s+/g, " ")) ? c : null);
  const pageBg = opaque(bodyCs.backgroundColor) || opaque(rootCs.backgroundColor);
  // The alternating band colour: the most common section background that is not
  // the page background.
  const bandFreq = new Map<string, number>();
  for (const el of Array.from(doc.querySelectorAll("section,[class*=section]"))) {
    const bg = opaque(cs(el).backgroundColor);
    if (!bg || bg === pageBg) continue;
    bandFreq.set(bg, (bandFreq.get(bg) || 0) + 1);
  }
  let muted: string | null = null;
  let mutedWeight = 0;
  for (const [k, w] of bandFreq) {
    if (w > mutedWeight) {
      muted = k;
      mutedWeight = w;
    }
  }

  // --- per-band geometry ----------------------------------------------------
  // Everything above is a page median. This reads each band on its own terms,
  // because a real page disagrees with its own median: a hero breathing at
  // 200px over a band at 96px is the composition, and one median flattens both.
  //
  // Outermost bands only - a `[class*=section]` wrapper inside a `<section>` is
  // part of its parent, and measuring both would report the inner one's padding
  // twice under the same heading.
  const bands: NonNullable<RawComputedSample["sections"]> = [];
  const kept: Element[] = [];
  for (const el of Array.from(doc.querySelectorAll("section,[class*=section],main > div"))) {
    if (bands.length >= 24) break;
    if (kept.some((k) => k.contains(el))) continue;
    if (!visible(el)) continue;
    const box = el.getBoundingClientRect();
    if (box.height < 40) continue;
    const headingEl = el.querySelector("h1,h2,h3,h4");
    const key = (headingEl?.textContent || "").replace(/\s+/g, " ").trim();
    if (!key) continue;
    kept.push(el);
    const s = cs(el);
    const pt = parseFloat(s.paddingTop);
    const pb = parseFloat(s.paddingBottom);
    // The band's own measure: the WIDEST px max-width applied inside it, which
    // on every real layout is the content container rather than a card in it.
    let widest = 0;
    for (const child of Array.from(el.querySelectorAll("div,section,main,article"))) {
      const mw = cs(child).maxWidth;
      if (!/px$/.test(mw)) continue;
      const value = parseFloat(mw);
      if (!isFinite(value) || value < 480 || value > 1600) continue;
      if (value > widest) widest = value;
    }
    // This band's own grid rhythm, on the same terms as the page median above.
    let bandGap: number | null = null;
    for (const child of Array.from(el.querySelectorAll("*"))) {
      const cSt = cs(child);
      if (cSt.display !== "grid" && cSt.display !== "inline-grid") continue;
      if ((cSt.gridTemplateColumns || "").trim().split(/\s+/).length < 2) continue;
      if (child.children.length < 2) continue;
      const g = parseFloat(cSt.rowGap);
      if (isFinite(g) && g >= 8 && g <= 160) {
        bandGap = g;
        break;
      }
    }
    // Only a band that is deliberately CENTRED (or right-set) reports an
    // alignment. Left is what every band already renders as, and reporting it
    // would override a site whose own heading token is centred.
    const textAlign = headingEl ? cs(headingEl).textAlign : "";
    const align =
      textAlign === "center" ? "center" : textAlign === "right" || textAlign === "end" ? "end" : null;
    bands.push({
      key: key.slice(0, 120),
      paddingTop: isFinite(pt) && pt >= 8 && pt <= 400 ? pt + "px" : null,
      paddingBottom: isFinite(pb) && pb >= 8 && pb <= 400 ? pb + "px" : null,
      maxWidth: widest > 0 ? widest + "px" : null,
      gap: bandGap === null ? null : bandGap + "px",
      align,
    });
  }

  return {
    brandColor: hex,
    headingFont: fam(h1El) || fam(doc.querySelector("h1")),
    sectionHeadingFont: fam(h2El),
    bodyFont: fam(bodyEl) || fam(doc.body),
    heroBackgroundImage: !!heroBg && heroBg !== "none",
    appliedStylesheets: applied,
    type,
    layout: {
      sectionPy: sectionPy === null ? null : sectionPy + "px",
      gridGap: gridGap === null ? null : gridGap + "px",
      containerDefault: containerDefault === null ? null : containerDefault + "px",
      containerNarrow: containerNarrow === null ? null : containerNarrow + "px",
    },
    sections: bands,
    colors: {
      bg: pageBg,
      fg: bodyCs.color,
      mutedFg: bodyEl ? cs(bodyEl).color : null,
      muted,
    },
  };
}

/**
 * `readComputedDesignInPage` serialised as a self-contained EXPRESSION, for any
 * render step that takes a script string (Firecrawl actions) or evaluates in a
 * page (`page.evaluate(computedDesignScript())`).
 *
 * Prefer this over passing the function itself. Bundlers that keep function
 * names (esbuild `keepNames` - used by tsx, Next and the Convex bundler)
 * rewrite the source to call their own `__name(...)` helper, which does not
 * exist in the page: passing the function then fails with
 * "ReferenceError: __name is not defined". The identity shim below makes the
 * serialised source runnable anywhere. Firecrawl additionally evaluates the
 * script as an expression, so it must not start with `return`.
 */
export function computedDesignScript(): string {
  return `(()=>{var __name=(f)=>f;return (${readComputedDesignInPage.toString()})();})()`;
}

const HEX = /^#[0-9a-fA-F]{3,8}$/;
const RGB = /^rgba?\([^)]+\)$/i;
/** The browser's own unvisited-link blue. Reading it as "the brand colour" means
 *  the page's CSS never applied - a second line of defence behind
 *  `appliedStylesheets`, for renderers that don't report it. */
const UA_DEFAULT_LINK = /^(#0000ee|rgba?\(\s*0\s*,\s*0\s*,\s*238\b)/i;
const GENERIC = /^(inherit|sans-serif|serif|monospace|system-ui|-apple-system|blinkmacsystemfont|ui-sans-serif|ui-serif|arial|helvetica|helvetica neue|segoe ui|roboto|times|times new roman)$/i;

/** A plausible typeface name. Letters, digits, spaces, hyphens, dots and
 *  underscores - which covers every real Google and Adobe family.
 *
 *  This was not needed while the only producer was our own render provider.
 *  It is now: the ARCHIVE lane measures in the owner's browser and posts the
 *  result, so this input crosses the wire from a client. `safeFamily` in
 *  lib/sections/theme.ts is still the gate before any declaration - this just
 *  stops nonsense being registered as a font in the first place. */
const PLAUSIBLE_FAMILY = /^[A-Za-z0-9 ._-]{1,64}$/;

/** `rgb()/rgba()` -> `#rrggbb`. A render step that reports the painted colour
 *  as `rgb(...)` (what `getComputedStyle` returns for most properties) must not
 *  be silently dropped downstream: `applyComputedSample` parses hex only. */
function rgbStringToHex(value: string): string | null {
  const parts = value
    .replace(/^rgba?\(|\)$/gi, "")
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map((p) => parseFloat(p));
  if (parts.length < 3 || parts.slice(0, 3).some((n) => Number.isNaN(n))) return null;
  if (parts.length >= 4 && parts[3] === 0) return null; // fully transparent = no colour
  return (
    "#" +
    parts
      .slice(0, 3)
      .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** A CSS length we are willing to carry into `theme.customType` /
 *  `customLayout`. Matches the renderer's own `safeLength` (lib/sections/theme)
 *  so a value that survives here is one the renderer will actually emit -
 *  otherwise the import reports "we kept your type" and the page shows the
 *  preset scale. */
const MEASURED_LENGTH = /^-?\d{1,4}(\.\d{1,3})?(px|rem|em|vw|%)$/;

/** Round a measured px length to 2 decimals and re-check it. Browsers report
 *  sub-pixel values ("79.9922px") that carry no design intent. */
function measuredLength(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim();
  const m = t.match(/^(-?[\d.]+)px$/);
  const value = m ? Number(parseFloat(m[1]).toFixed(2)) + "px" : t;
  return MEASURED_LENGTH.test(value) ? value : undefined;
}

const TRANSFORMS = new Set(["none", "uppercase", "lowercase", "capitalize"]);

/** One measured element -> one `customType` role. Everything that carries no
 *  design intent is dropped rather than guessed: "normal" tracking, a
 *  `normal` line-height (which is font-dependent, not a number the source
 *  chose), a non-numeric weight. */
function normalizeRole(raw: RawRoleSample | undefined): MeasuredTypeRole | undefined {
  if (!raw) return undefined;
  const out: MeasuredTypeRole = {};
  const size = measuredLength(raw.fontSize);
  if (size) out.size = size;
  const weight = Number(raw.fontWeight);
  if (Number.isInteger(weight) && weight >= 1 && weight <= 1000) out.weight = weight;
  // `line-height` computes to px; the renderer wants a unitless ratio so the
  // leading still tracks a size the owner later changes.
  const lhPx = raw.lineHeight && raw.lineHeight.endsWith("px") ? parseFloat(raw.lineHeight) : NaN;
  const sizePx = raw.fontSize && raw.fontSize.endsWith("px") ? parseFloat(raw.fontSize) : NaN;
  if (Number.isFinite(lhPx) && Number.isFinite(sizePx) && sizePx > 0) {
    const ratio = Number((lhPx / sizePx).toFixed(3));
    if (ratio >= 0.5 && ratio <= 4) out.lineHeight = ratio;
  }
  if (raw.letterSpacing && raw.letterSpacing !== "normal") {
    const tracking = measuredLength(raw.letterSpacing);
    // 0 tracking is the default; carrying it adds a field that changes nothing.
    if (tracking && parseFloat(tracking) !== 0) out.tracking = tracking;
  }
  const transform = raw.textTransform?.trim();
  if (transform && transform !== "none" && TRANSFORMS.has(transform)) {
    out.transform = transform as MeasuredTypeRole["transform"];
  }
  // The role's own ink. Only kept when it is a real colour string; whether it
  // DIFFERS from the page's ink is decided later, where the page ink is known -
  // carrying a colour identical to the body text would add a declaration that
  // changes nothing.
  const color = raw.color?.trim();
  if (color && /^([#]|rgba?\(|hsla?\(|oklch\()/.test(color)) out.color = color;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Pure: coerce a raw browser sample into a trusted `ComputedSample`. Drops junk
 *  (generic/empty fonts, non-colour brand strings) so a bad read never corrupts
 *  the import - it just falls back to the static guess. */
export function normalizeComputedSample(raw: RawComputedSample | null | undefined): ComputedSample {
  const out: ComputedSample = {};
  // An unstyled render measures the USER-AGENT defaults, not the site. Discard
  // the whole sample so the caller falls back to static extraction.
  if (raw?.appliedStylesheets === 0) return out;
  const brand = raw?.brandColor?.trim();
  if (brand && !UA_DEFAULT_LINK.test(brand)) {
    if (HEX.test(brand)) out.brandHex = brand;
    else if (RGB.test(brand)) {
      const hex = rgbStringToHex(brand);
      if (hex) out.brandHex = hex;
    }
  }
  const font = (f?: string | null) => {
    const name = f?.trim();
    if (!name || GENERIC.test(name)) return undefined;
    return PLAUSIBLE_FAMILY.test(name) ? name : undefined;
  };
  const h = font(raw?.headingFont);
  const b = font(raw?.bodyFont);
  if (h) out.headingFont = h;
  if (b) out.bodyFont = b;
  if (raw?.heroBackgroundImage) out.heroBackgroundImage = true;
  const sectionHeading = font(raw?.sectionHeadingFont);
  if (sectionHeading) out.sectionHeadingFont = sectionHeading;

  // Per-role type.
  const type: NonNullable<ComputedSample["type"]> = {};
  for (const [role, rawRole] of Object.entries(raw?.type ?? {})) {
    const normalized = normalizeRole(rawRole);
    if (normalized) type[role as MeasuredRole] = normalized;
  }
  if (Object.keys(type).length > 0) out.type = type;

  // Layout. A measured section padding under 32px is not a rhythm, and a
  // container narrower than 480px is a card, not the page measure - both are
  // already filtered in the page, so this only re-validates the shape.
  const layout: NonNullable<ComputedSample["layout"]> = {};
  const py = measuredLength(raw?.layout?.sectionPy);
  if (py) layout.sectionPy = py;
  const wide = measuredLength(raw?.layout?.containerDefault);
  if (wide) layout.containerDefault = wide;
  const narrow = measuredLength(raw?.layout?.containerNarrow);
  if (narrow) layout.containerNarrow = narrow;
  const gridGap = measuredLength(raw?.layout?.gridGap);
  if (gridGap) layout.gridGap = gridGap;
  if (Object.keys(layout).length > 0) out.layout = layout;

  // Colours. Kept as hex so the palette generator and `SAFE_COLOR` in the
  // renderer both accept them without a second parser.
  const colorHex = (value: string | null | undefined): string | undefined => {
    const v = value?.trim();
    if (!v) return undefined;
    if (HEX.test(v)) return v.toLowerCase();
    if (RGB.test(v)) return rgbStringToHex(v) ?? undefined;
    return undefined;
  };
  const colors: NonNullable<ComputedSample["colors"]> = {};
  const bg = colorHex(raw?.colors?.bg);
  if (bg) colors.bg = bg;
  const fg = colorHex(raw?.colors?.fg);
  if (fg) colors.fg = fg;
  const mutedFg = colorHex(raw?.colors?.mutedFg);
  if (mutedFg) colors.mutedFg = mutedFg;
  const muted = colorHex(raw?.colors?.muted);
  if (muted) colors.muted = muted;
  if (Object.keys(colors).length > 0) out.colors = colors;

  // Per-band geometry. A band with no key cannot be attributed to a section, and
  // a band whose every value was dropped carries no design - both are left out
  // rather than shipped as an empty override.
  const sections: NonNullable<ComputedSample["sections"]> = [];
  for (const raw2 of raw?.sections ?? []) {
    const key = measuredKey(raw2?.key);
    if (!key) continue;
    const band: MeasuredSectionSample = { key };
    // `safeLength`, not `measuredLength`: this geometry is applied by the
    // RENDERER's own gate, which is narrower (no `vw`). Shipping a value the
    // renderer will drop would put a number in the bundle that changes nothing
    // and report an accuracy we did not deliver.
    const pt = bandLength(raw2?.paddingTop);
    if (pt) band.paddingTop = pt;
    const pb = bandLength(raw2?.paddingBottom);
    if (pb) band.paddingBottom = pb;
    const mw = bandLength(raw2?.maxWidth);
    if (mw) band.maxWidth = mw;
    const gap = bandLength(raw2?.gap);
    if (gap) band.gap = gap;
    const align = raw2?.align?.trim();
    if (align === "center" || align === "end") band.align = align;
    if (Object.keys(band).length > 1) sections.push(band);
    if (sections.length >= 24) break;
  }
  if (sections.length > 0) out.sections = sections;

  return out;
}

/** A band length, rounded like every other measurement and then put through the
 *  renderer's own `safeLength` so the two halves cannot disagree. */
function bandLength(raw: string | null | undefined): string | undefined {
  return safeLength(measuredLength(raw));
}

/** The band handle both halves agree on: the heading, whitespace-collapsed,
 *  lower-cased and truncated. Exported because the IMPORTER builds the same key
 *  off a built section's own heading - two spellings of this would mean no band
 *  ever matched and the whole feature would be a silent no-op. */
export function measuredKey(value: string | null | undefined): string | undefined {
  const key = (value ?? "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 80);
  return key.length >= 2 ? key : undefined;
}

// ---------------------------------------------------------------------------
// Render-step hookup (for convex/import/provider.ts):
//   1. Fetch the page WITH rendering (Firecrawl `render`/`actions`, or a
//      headless browser). You already receive rendered HTML + inline CSS.
//   2. In the same render, evaluate `readComputedDesignInPage` to get a
//      RawComputedSample. (Firecrawl: a page `action` that returns JS output.)
//   3. `const sample = normalizeComputedSample(raw)`.
//   4. `htmlToPortableSite(html, baseUrl, css, sample)` - the sample overrides
//      the static colour/font/hero guesses with the painted truth.
// Falls back gracefully: no render/sample -> static extraction as today.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Two widths, one ramp.
//
// A source page does not set one size per role - it sets three or four across
// breakpoints. The reference page's hero runs 80 -> 60 -> 50 -> 40px and its
// pull-quote 58 -> 48 -> 30px. Storing only the desktop number pinned a phone to
// the desktop size, which was the whole remaining mobile gap on that import.
//
// The URL lane renders once, so it never had the second number. The ARCHIVE lane
// renders in an iframe we own, so it can simply be measured twice - and that is
// the only reason `sizeMin` / `sizeFluid` finally have a producer.
// ---------------------------------------------------------------------------

/** The two widths an archive is measured at. Wide is the desktop the source's
 *  largest breakpoint targets; narrow is a real phone. */
export const MEASURE_WIDTHS = { wide: 1440, narrow: 375 } as const;

const px = (v: string | undefined): number | undefined => {
  if (!v || !v.endsWith("px")) return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * Fold a NARROW sample into a WIDE one, turning each role's two measured sizes
 * into the `clamp(sizeMin, sizeFluid, size)` ramp the renderer already supports.
 *
 * `sizeFluid` is a pure `cqw` value because that is what `measuredSize` accepts
 * (and `cqw`, never `vw` - a viewport unit resolves against the real window
 * inside the editor's scaled device frame). A pure ratio cannot pass through
 * both measured points, so it is anchored to the WIDE one and the narrow
 * measurement becomes the floor: the size is exact at desktop, exact at phone,
 * and interpolates between - which is the shape a source page's own breakpoints
 * produce anyway.
 *
 * Everything that is not a size comes from the WIDE sample: a page's weight,
 * tracking and casing are design decisions, not responsive ones, and taking
 * them from two renders would let a phone-only override rewrite the desktop.
 */
export function mergeResponsiveSamples(
  wide: ComputedSample,
  narrow: ComputedSample | null | undefined,
  wideWidth: number = MEASURE_WIDTHS.wide,
): ComputedSample {
  if (!narrow?.type || !wide.type || !(wideWidth > 0)) return wide;
  const type: NonNullable<ComputedSample["type"]> = { ...wide.type };
  for (const role of Object.keys(type) as MeasuredRole[]) {
    const w = type[role];
    const big = px(w?.size);
    const small = px(narrow.type[role]?.size);
    if (!w || !big || !small) continue;
    // Identical at both widths => the role is not responsive. A ramp there
    // would add two fields that change nothing.
    if (Math.abs(big - small) < 0.5) continue;
    // A role that grows on a PHONE is a measurement artefact (a wrapped
    // heading, a different element winning the selector), not a design.
    if (small > big) continue;
    const cqw = Number(((big / wideWidth) * 100).toFixed(3));
    if (!(cqw > 0)) continue;
    type[role] = {
      ...w,
      sizeMin: `${Number(small.toFixed(2))}px`,
      sizeFluid: `${cqw}cqw`,
    };
  }
  return { ...wide, type };
}
