import type { TrackingConfigDoc } from "../../convex/model/tracking";
import type { HtmlIngestionResult } from "./input";
import { detectSupportedBookingProvider, nativeFormReplacement, type NativeFormField, type SupportedBookingProvider } from "../native-replacements";

export type BehaviorSignal = {
  kind: "analytics" | "booking" | "form" | "gallery" | "map" | "animation" | "script" | "embed" | "handler";
  locator: string;
  excerpt: string;
  value?: string;
};

export type HtmlBehaviorInventory = {
  tracking: TrackingConfigDoc;
  trackingConflicts: Array<{ provider: "ga4" | "gtm" | "metaPixel"; values: string[]; signal: BehaviorSignal }>;
  booking: Array<{ provider: SupportedBookingProvider; url: string; pageUrl: string; signal: BehaviorSignal }>;
  forms: Array<{ native: { recipient: string; fields: NativeFormField[] } | null; pageUrl: string; signal: BehaviorSignal }>;
  galleries: Array<{ pageUrl: string; references: string[]; signal: BehaviorSignal }>;
  maps: BehaviorSignal[];
  animations: BehaviorSignal[];
  signals: BehaviorSignal[];
};

const BEHAVIOR_LIMITS = {
  scripts: 2_000,
  embeds: 500,
  handlers: 1_000,
  booking: 100,
  forms: 500,
  galleries: 100,
  maps: 100,
  animations: 1_000,
} as const;

function matches(text: string, expression: RegExp, group = 0): string[] {
  return [...text.matchAll(expression)].map((match) => match[group]!).filter(Boolean);
}

function collectTracking(text: string): { tracking: TrackingConfigDoc; conflicts: Array<{ provider: "ga4" | "gtm" | "metaPixel"; values: string[] }> } {
  const tracking: TrackingConfigDoc = {};
  const candidates = {
    ga4: [...new Set([
      ...matches(text, /gtag\(\s*['"]config['"]\s*,\s*['"](G-[A-Z0-9]{4,})['"]/gi, 1),
      ...matches(text, /googletagmanager\.com\/gtag\/js\?[^\s'"<>]*\bid=(G-[A-Z0-9]{4,})(?:[&#'"<>\s]|$)/gi, 1),
    ].map((value) => value.toUpperCase()))],
    gtm: [...new Set([
      ...matches(text, /googletagmanager\.com\/gtm\.js\?[^\s'"<>]*\bid=(GTM-[A-Z0-9]{4,})(?:[&#'"<>\s]|$)/gi, 1),
      ...matches(text, /\(\s*window\s*,\s*document\s*,\s*['"]script['"]\s*,\s*['"]dataLayer['"]\s*,\s*['"](GTM-[A-Z0-9]{4,})['"]\s*\)/gi, 1),
    ].map((value) => value.toUpperCase()))],
    metaPixel: [...new Set([
      ...matches(text, /fbq\(\s*['"]init['"]\s*,\s*['"](\d{6,20})['"]/gi, 1),
      ...matches(text, /facebook\.com\/tr\?id=(\d{6,20})/gi, 1),
    ])],
  };
  const conflicts: Array<{ provider: "ga4" | "gtm" | "metaPixel"; values: string[] }> = [];
  for (const provider of ["ga4", "gtm", "metaPixel"] as const) {
    const values = candidates[provider];
    if (values.length === 1) tracking[provider] = values[0];
    else if (values.length > 1) conflicts.push({ provider, values });
  }
  return { tracking, conflicts };
}

function signal(kind: BehaviorSignal["kind"], locator: string, excerpt: string, value?: string): BehaviorSignal {
  return { kind, locator, excerpt: excerpt.replace(/\s+/g, " ").trim().slice(0, 500), ...(value ? { value } : {}) };
}

export function detectHtmlBehavior(input: HtmlIngestionResult): HtmlBehaviorInventory {
  const scriptText = input.evidence.scripts.slice(0, BEHAVIOR_LIMITS.scripts)
    .map((entry) => [entry.src, entry.inline, entry.externalText].filter(Boolean).join("\n"))
    .join("\n");
  const { tracking, conflicts } = collectTracking(scriptText);
  const signals: BehaviorSignal[] = [];
  for (const [provider, value] of Object.entries(tracking)) {
    signals.push(signal("analytics", `tracking.${provider}`, `${provider}: ${value}`, value));
  }
  const trackingConflicts = conflicts.map((entry) => {
    const found = signal("analytics", `tracking.${entry.provider}`, `Conflicting ${entry.provider} identifiers: ${entry.values.join(", ")}`);
    signals.push(found);
    return { ...entry, signal: found };
  });
  input.evidence.scripts.slice(0, BEHAVIOR_LIMITS.scripts).forEach((entry, index) => signals.push(signal("script", `script[${index}]`, [entry.src, entry.inline, entry.externalText].filter(Boolean).join(" ") || "inline script")));
  input.evidence.embeds.slice(0, BEHAVIOR_LIMITS.embeds).forEach((entry, index) => signals.push(signal("embed", `embed[${index}]`, `${entry.element} ${entry.src}`, entry.src)));
  input.evidence.inlineHandlers.slice(0, BEHAVIOR_LIMITS.handlers).forEach((entry, index) => signals.push(signal("handler", `handler[${index}]`, `${entry.element}[${entry.attribute}]=${entry.value}`)));
  if (input.evidence.scripts.length > BEHAVIOR_LIMITS.scripts) signals.push(signal("script", "scripts.truncated", `${input.evidence.scripts.length - BEHAVIOR_LIMITS.scripts} additional scripts were aggregated as inert evidence`));
  if (input.evidence.embeds.length > BEHAVIOR_LIMITS.embeds) signals.push(signal("embed", "embeds.truncated", `${input.evidence.embeds.length - BEHAVIOR_LIMITS.embeds} additional embeds were aggregated as inert evidence`));
  if (input.evidence.inlineHandlers.length > BEHAVIOR_LIMITS.handlers) signals.push(signal("handler", "handlers.truncated", `${input.evidence.inlineHandlers.length - BEHAVIOR_LIMITS.handlers} additional inline handlers were aggregated as inert evidence`));

  const booking: HtmlBehaviorInventory["booking"] = [];
  const bookingSeen = new Set<string>();
  for (const page of input.pages) {
    for (const candidate of [...page.links, ...page.evidence.embeds.map((entry) => entry.src)]) {
      const provider = detectSupportedBookingProvider(candidate);
      if (!provider || bookingSeen.has(candidate)) continue;
      if (booking.length >= BEHAVIOR_LIMITS.booking) continue;
      bookingSeen.add(candidate);
      const found = signal("booking", page.url, `${provider} booking URL ${candidate}`, candidate);
      signals.push(found);
      booking.push({ provider, url: candidate, pageUrl: page.url, signal: found });
    }
  }

  const forms: HtmlBehaviorInventory["forms"] = [];
  let formIndex = 0;
  for (const page of input.pages) {
    for (const form of page.evidence.forms) {
      if (forms.length >= BEHAVIOR_LIMITS.forms) break;
      const native = nativeFormReplacement(form);
      const found = signal(
        "form",
        `${page.url}#form-${formIndex++ + 1}`,
        `${form.method.toUpperCase()} ${form.action ?? "(no action)"}; fields ${form.fields.map((field) => `${field.name ?? "?"}:${field.type}`).join(", ")}`,
      );
      signals.push(found);
      forms.push({ native, pageUrl: page.url, signal: found });
    }
  }

  const galleries: HtmlBehaviorInventory["galleries"] = [];
  for (const page of input.pages) {
    for (const references of page.mediaGroups) {
      if (galleries.length >= BEHAVIOR_LIMITS.galleries) break;
      const found = signal("gallery", page.url, `${references.length} structurally grouped image references form a gallery candidate`);
      signals.push(found);
      galleries.push({ pageUrl: page.url, references, signal: found });
    }
  }

  const maps: BehaviorSignal[] = [];
  for (const page of input.pages) {
    for (const candidate of [...page.links, ...page.evidence.embeds.map((entry) => entry.src)]) {
      if (maps.length >= BEHAVIOR_LIMITS.maps) break;
      let host = "";
      try { host = new URL(candidate).hostname.toLowerCase(); } catch { continue; }
      let path = "";
      try { path = new URL(candidate).pathname; } catch { /* already parsed */ }
      const googleMap = (/^(?:maps\.)?google\.[a-z.]+$/.test(host) && (/^maps\./.test(host) || path.startsWith("/maps")));
      if (!googleMap && !["maps.app.goo.gl", "openstreetmap.org"].some((known) => host === known || host.endsWith(`.${known}`))) continue;
      const found = signal("map", page.url, `Map reference ${candidate}`, candidate);
      signals.push(found);
      maps.push(found);
    }
  }

  const animations = input.css.flatMap((css) => css.animations.map((value) => signal("animation", css.source, value))).slice(0, BEHAVIOR_LIMITS.animations);
  signals.push(...animations);
  return { tracking, trackingConflicts, booking, forms, galleries, maps, animations, signals };
}
