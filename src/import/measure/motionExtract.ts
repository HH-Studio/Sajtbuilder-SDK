// ---------------------------------------------------------------------------
// Read a source page's ANIMATION and express it as `theme.customMotion`.
//
// Layout, type and colour already survive an import; motion did not, and on a
// Webflow page it is a large part of what the owner recognises as their site.
// Two dialects cover almost all of them, and they co-exist on the same page:
//
//   A. Webflow IX2 - elements carry `data-w-id`, and a JS object literal
//      (`ixData`, in js/webflow.js or inline) holds `events` + `actionLists`.
//   B. Attribute-driven GSAP - the page declares behaviour with bare HTML
//      attributes (`animation-fade-blur`, `data-animate`, `data-aos`) and a
//      script at the end of <body> turns them into tweens. This is what almost
//      every Relume / agency "cloneable" template ships, which is most of what
//      a small business actually buys.
//
// Both are read by PARSING, never by executing - see lib/import/objectLiteral.
//
// What comes out is small on purpose. Every one of these pages animates with
// the same six values: opacity, a rise, a blur, a duration, an easing curve and
// a stagger. That is exactly `customMotion`, and it renders through the CSS
// reveal the product already had (app/globals.css `.site-reveal`), so an
// imported site gains motion without gaining a single byte of third-party JS.
//
// Anything that does not fit comes back in `notes` and is shown to the owner
// after the import, rather than being silently dropped.
// ---------------------------------------------------------------------------

import type { CustomMotion, MotionEasing } from "../../convex/model/theme";
import {
  asNumber,
  asObject,
  asString,
  readNextObjectLiteral,
  type LiteralObject,
  type LiteralValue,
} from "./objectLiteral";

/** One parallax the source page drives off scroll progress. Kept as the
 *  source's own SELECTOR because mapping it onto a rewritten section is a
 *  separate decision - `section.layout.parallax` is where it lands. */
export type ExtractedParallax = {
  selector: string;
  x?: string;
  y?: string;
};

/** What the page had that we could not carry across, as CODES rather than
 *  sentences. The import report is bilingual (sv/en/pl) and is the thing a
 *  Swedish owner actually reads - an English sentence manufactured here would
 *  arrive untranslated in their report, so the wording lives with the rest of
 *  the report copy in importActions.ts and only the FACTS travel. */
export type MotionNote =
  | { code: "blur-differs"; loadPx: number; scrollPx: number }
  | { code: "parallax-unmapped"; count: number }
  | { code: "attrs-unread"; families: string[] }
  | { code: "smooth-scroll" };

export type ExtractedMotion = {
  /** Absent when the page had no animation we could read. */
  motion?: CustomMotion;
  parallax: ExtractedParallax[];
  /** What we found and could not carry. Surfaced in the import report, never
   *  swallowed. */
  notes: MotionNote[];
};

const EMPTY: ExtractedMotion = { parallax: [], notes: [] };

// ---- easing ---------------------------------------------------------------

/** Source easing names -> the closed set the theme accepts. Covers GSAP's
 *  `powerN.out` family and Webflow's own menu; anything unknown falls through
 *  to `linear`, which is what the reveal has always used. */
const EASING_ALIASES: Record<string, MotionEasing> = {
  none: "linear",
  linear: "linear",
  "power0.out": "linear",
  "ease-out": "ease-out",
  easeout: "ease-out",
  ease: "ease-out",
  out: "ease-out",
  "power1.out": "ease-out",
  outquad: "ease-out",
  easeoutquad: "ease-out",
  "power2.out": "power2-out",
  outcubic: "power2-out",
  easeoutcubic: "power2-out",
  "power3.out": "power3-out",
  outquart: "power3-out",
  easeoutquart: "power3-out",
  "power4.out": "expo-out",
  "expo.out": "expo-out",
  outexpo: "expo-out",
  easeoutexpo: "expo-out",
  "back.out": "back-out",
  outback: "back-out",
  easeoutback: "back-out",
};

export function normalizeEasing(raw: string | undefined): MotionEasing | undefined {
  if (!raw) return undefined;
  const key = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (EASING_ALIASES[key]) return EASING_ALIASES[key];
  // `back.out(1.7)`, `power2.inOut` etc. - strip the argument, try the head.
  const head = key.replace(/\(.*$/, "");
  return EASING_ALIASES[head];
}

// ---- units ----------------------------------------------------------------

/** A source page writes a rise as a bare number (GSAP `y: 24` = pixels), as
 *  `"24px"`, or as a value + unit pair (IX2). Normalise to a CSS length the
 *  theme's `safeLength` will accept - and refuse anything absurd, because a
 *  measured outlier that renders is worse than one that falls back. */
export function toLength(
  value: number | undefined,
  unit = "px",
  limit = 400,
): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const abs = Math.abs(value);
  if (abs === 0) return undefined;
  // IX2 writes its units in caps ("PX", "VW"), and `safeLength` matches the CSS
  // spelling - an uppercased unit would have been dropped silently.
  const css = unit.toLowerCase();
  if (css === "%" ? abs > 100 : abs > limit) return undefined;
  // Anything not in `safeLength`'s five units would be dropped downstream, so
  // refuse it here where we can say why rather than there where we cannot.
  if (!["px", "rem", "em", "cqw", "%"].includes(css)) return undefined;
  return `${Number(value.toFixed(2))}${css}`;
}

/** Seconds (GSAP) or milliseconds (IX2) -> milliseconds. A value under 20 is
 *  seconds by construction: nobody writes a 12ms fade, and every GSAP config
 *  in the wild is in seconds. */
export function toMs(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.round(value < 20 ? value * 1000 : value);
}

/** ScrollTrigger's `start` ("top bottom", "top 80%", "top 75% ") as a
 *  percentage into the band's ENTRY range. "top bottom" - the element's top
 *  touching the bottom of the screen - is entry 0%, which is our default. */
export function startToEntryPercent(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const parts = raw.trim().toLowerCase().split(/\s+/);
  if (parts.length < 2 || parts[0] !== "top") return undefined;
  const viewport = parts[1]!;
  if (viewport === "bottom") return 0;
  if (viewport === "center") return 50;
  if (viewport === "top") return 100;
  const pct = /^(\d{1,3})%$/.exec(viewport);
  if (!pct) return undefined;
  // 100% of the viewport is its bottom edge; 0% is its top.
  const entered = 100 - Number(pct[1]);
  return entered >= 0 && entered <= 90 ? entered : undefined;
}

// ---- dialect B: attribute-driven GSAP -------------------------------------

/** The attribute families a template uses to declare "animate me". Detected
 *  from the SCRIPT (a `querySelectorAll('[...]')` call), not from a hardcoded
 *  list, so an agency's own attribute name is picked up too - these are only
 *  what we recognise well enough to name in the report. */
const KNOWN_ATTR_FAMILIES =
  /\[\s*(animation-[a-z-]+|data-anim[a-z-]*|data-aos[a-z-]*|data-scroll[a-z-]*)\s*[\]=]/gi;

type Tween = {
  y?: number;
  blur?: number;
  durationMs?: number;
  staggerMs?: number;
  easing?: MotionEasing;
  startPercent?: number;
  scrollDriven: boolean;
};

/** Read every `gsap.from(...)` / `gsap.fromTo(...)` config in a script. */
export function readGsapTweens(script: string): Tween[] {
  const out: Tween[] = [];
  const call = /gsap\s*\.\s*(from|fromTo|to)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = call.exec(script)) !== null) {
    // `gsap.to` reads the same but describes the END state, so its `y`/blur is
    // where things settle, not where they start. Only `from`/`fromTo` describe
    // an entrance.
    if (m[1] === "to") continue;
    const config = readNextObjectLiteral(script, call.lastIndex);
    if (!config) continue;
    // `fromTo(el, fromVars, toVars)` - the first object is the entrance.
    const filter = asString(config.filter);
    const blur = filter ? asNumber(/blur\(([^)]*)\)/.exec(filter)?.[1] ?? "") : undefined;
    const scroll = config.scrollTrigger;
    const scrollDriven = scroll !== undefined && scroll !== null && scroll !== false;
    const start = asString(asObject(scroll)?.start);
    const tween: Tween = {
      y: asNumber(config.y),
      blur,
      durationMs: toMs(asNumber(config.duration)),
      staggerMs: toMs(asNumber(config.stagger)),
      easing: normalizeEasing(asString(config.ease)),
      startPercent: startToEntryPercent(start),
      scrollDriven,
    };
    const animates =
      tween.y !== undefined ||
      tween.blur !== undefined ||
      config.autoAlpha !== undefined ||
      config.opacity !== undefined;
    if (animates) out.push(tween);
  }
  return out;
}

function extractGsap(scripts: string[], notes: MotionNote[]): CustomMotion | undefined {
  const tweens = scripts.flatMap(readGsapTweens);
  if (tweens.length === 0) return undefined;

  // The scroll tweens govern the whole page; the load tweens govern the first
  // screen. Where they disagree we keep the scroll value and say so, because
  // one is 37 elements and the other is 13.
  const scroll = tweens.filter((t) => t.scrollDriven);
  const load = tweens.filter((t) => !t.scrollDriven);
  const primary = scroll[0] ?? load[0]!;

  const motion: CustomMotion = {};
  const y = toLength(primary.y ?? load[0]?.y);
  if (y) motion.enterY = y;
  const blur = toLength(primary.blur ?? load[0]?.blur, "px", 64);
  if (blur) motion.enterBlur = blur;
  const easing = primary.easing ?? load[0]?.easing;
  if (easing) motion.easing = easing;
  // Duration and stagger describe the page-LOAD entrance. A scroll-driven
  // reveal has no duration of its own: its progress is the scroll position.
  const duration = load[0]?.durationMs ?? primary.durationMs;
  if (duration) motion.duration = duration;
  const stagger = load[0]?.staggerMs ?? primary.staggerMs;
  if (stagger !== undefined) motion.stagger = stagger;
  if (primary.startPercent !== undefined && primary.startPercent > 0) {
    motion.startAt = primary.startPercent;
  }

  if (
    scroll[0]?.blur !== undefined &&
    load[0]?.blur !== undefined &&
    scroll[0].blur !== load[0].blur
  ) {
    notes.push({
      code: "blur-differs",
      loadPx: load[0].blur,
      scrollPx: scroll[0].blur,
    });
  }
  return Object.keys(motion).length > 0 ? motion : undefined;
}

// ---- dialect A: Webflow IX2 ----------------------------------------------

/** Find the `ixData` payload in a script. Two shapes in the wild: the exported
 *  `Webflow.require("ix2").init({...})` call, and a bare `ixData: {...}` /
 *  `"ixData": {...}` inside a larger state object. */
export function readIxData(script: string): Record<string, LiteralValue> | null {
  const init = /require\s*\(\s*["']ix2["']\s*\)\s*\.\s*init\s*\(/.exec(script);
  if (init) {
    const parsed = readNextObjectLiteral(script, init.index + init[0].length);
    if (parsed && (parsed.events || parsed.actionLists)) return parsed;
  }
  const key = /["']?ixData["']?\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = key.exec(script)) !== null) {
    const parsed = readNextObjectLiteral(script, m.index + m[0].length);
    if (parsed && (parsed.events || parsed.actionLists)) return parsed;
  }
  return null;
}

function ixConfig(item: LiteralValue): LiteralObject | undefined {
  return asObject(asObject(item)?.config);
}

function ixSelector(config: LiteralObject): string | undefined {
  const target = asObject(config.target);
  if (!target) return undefined;
  return asString(target.selector) ?? asString(target.id);
}

function extractIx2(
  scripts: string[],
  notes: MotionNote[],
): { motion?: CustomMotion; parallax: ExtractedParallax[] } {
  const parallax: ExtractedParallax[] = [];
  let motion: CustomMotion | undefined;

  for (const script of scripts) {
    const data = readIxData(script);
    const actionLists = data ? asObject(data.actionLists) : undefined;
    if (!actionLists) continue;

    for (const raw of Object.values(actionLists)) {
      const list = asObject(raw);
      if (!list) continue;

      // Continuous (scroll-progress) groups are the parallax family: an element
      // that moves as a FUNCTION of scroll rather than once on entry.
      const groups = list.continuousParameterGroups;
      if (Array.isArray(groups)) {
        for (const rawGroup of groups) {
          const group = asObject(rawGroup);
          const actionGroups = group?.continuousActionGroups;
          if (!Array.isArray(actionGroups)) continue;
          // Keyframe 0 is the offset it starts at; it settles at the last one.
          const first = asObject(
            actionGroups.find((g) => asNumber(asObject(g)?.keyframe) === 0),
          );
          if (!first || !Array.isArray(first.actionItems)) continue;
          for (const item of first.actionItems) {
            if (asObject(item)?.actionTypeId !== "TRANSFORM_MOVE") continue;
            const config = ixConfig(item);
            const selector = config ? ixSelector(config) : undefined;
            if (!config || !selector) continue;
            const x = toLength(asNumber(config.xValue), asString(config.xUnit) ?? "px");
            const y = toLength(asNumber(config.yValue), asString(config.yUnit) ?? "px");
            // A page usually ships the same drift twice - one action list for
            // desktop, one for the mobile copy of the same block - so dedupe on
            // the selector or the owner is told about five parallaxes that are
            // really two.
            if ((x || y) && !parallax.some((p) => p.selector === selector)) {
              parallax.push({ selector, ...(x ? { x } : {}), ...(y ? { y } : {}) });
            }
          }
        }
      }

      // Everything else is an entrance: a rise + a fade, once, on entry.
      const items = list.actionItemGroups;
      const flat: LiteralValue[] = Array.isArray(items)
        ? items.flatMap((g) => {
            const inner = asObject(g)?.actionItems;
            return Array.isArray(inner) ? inner : [];
          })
        : Array.isArray(list.actionItems)
          ? list.actionItems
          : [];
      const draft: CustomMotion = { ...(motion ?? {}) };
      for (const raw of flat) {
        const item = asObject(raw);
        const config = item ? ixConfig(item) : undefined;
        if (!item || !config) continue;
        const durationMs = toMs(asNumber(config.duration));
        const easing = normalizeEasing(asString(config.easing));
        if (item.actionTypeId === "TRANSFORM_MOVE") {
          const y = toLength(asNumber(config.yValue), asString(config.yUnit) ?? "px");
          if (y && !draft.enterY) draft.enterY = y;
        }
        if (item.actionTypeId === "STYLE_FILTER") {
          const blur = toLength(asNumber(config.filters), "px", 64);
          if (blur && !draft.enterBlur) draft.enterBlur = blur;
        }
        if (durationMs && !draft.duration) draft.duration = durationMs;
        if (easing && !draft.easing) draft.easing = easing;
      }
      if (Object.keys(draft).length > 0) motion = draft;
    }
  }

  if (parallax.length > 0) {
    notes.push({ code: "parallax-unmapped", count: parallax.length });
  }
  return { motion, parallax };
}

// ---- entry point ----------------------------------------------------------

/** Every `<script>` body in the page, plus any script FILES the caller
 *  fetched (Webflow puts `ixData` in `js/webflow.js`). */
export function inlineScripts(html: string): string[] {
  const out: string[] = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const body = m[1]!.trim();
    if (body) out.push(body);
  }
  return out;
}

/**
 * Read a page's motion. `html` supplies the inline scripts and the animation
 * attributes; `externalScripts` are script files the caller fetched.
 *
 * Pure, so it is unit-testable without a browser or a network.
 */
export function extractMotion(
  html: string,
  externalScripts: string[] = [],
): ExtractedMotion {
  const scripts = [...inlineScripts(html), ...externalScripts];
  if (scripts.length === 0) return EMPTY;
  const notes: MotionNote[] = [];

  const ix = extractIx2(scripts, notes);
  const gsap = extractGsap(scripts, notes);

  // Where a page runs both, the attribute-driven tweens win: they are the ones
  // the template author wrote deliberately, and IX2 leftovers on a cloneable
  // are usually a navbar dropdown, not the page's motion.
  const motion: CustomMotion = { ...(ix.motion ?? {}), ...(gsap ?? {}) };

  const declared = new Set(
    [...html.matchAll(KNOWN_ATTR_FAMILIES)].map((m) => m[1]!.toLowerCase()),
  );
  if (declared.size > 0 && !gsap) {
    notes.push({ code: "attrs-unread", families: [...declared].sort() });
  }
  if (/\bnew\s+Lenis\s*\(/.test(scripts.join("\n"))) {
    notes.push({ code: "smooth-scroll" });
  }

  if (Object.keys(motion).length === 0) {
    return { parallax: ix.parallax, notes };
  }
  return { motion, parallax: ix.parallax, notes };
}
