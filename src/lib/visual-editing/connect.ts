import type { SiteSnapshot } from "../../convex/model/snapshot";
import {
  originMatches,
  parseEditorMessage,
  VISUAL_EDITING_CHANNEL,
  VISUAL_EDITING_PROTOCOL_VERSION,
  type FieldRef,
} from "./protocol";

// ---------------------------------------------------------------------------
// The SITE half of visual editing — what a builder drops into their own app.
//
// Framework-agnostic on purpose: it touches `window`, `document` and nothing
// else, so it works in Next.js, Astro, SvelteKit, Remix or a hand-rolled SPA.
// A React wrapper is a five-line `useEffect` around this; shipping the wrapper
// instead of the primitive would have forced React on everyone.
//
//   import { connectVisualEditing } from "@snabbsajt/site-kit";
//
//   const bridge = connectVisualEditing({
//     editorOrigin: "https://snabbsajt.com",
//     onRender: (snapshot) => setContent(snapshot),
//   });
//   // …later
//   bridge.disconnect();
//
// Nothing here runs unless the page is actually inside the editor's iframe, so
// it is safe to ship in production. It is inert on a normal visit.
// ---------------------------------------------------------------------------

export type ConnectVisualEditingOptions = {
  /** The editor's origin, e.g. "https://snabbsajt.com". Every inbound message
   *  is checked against it, and every outbound message is addressed to it —
   *  never "*", which would broadcast draft content to whatever page happens to
   *  be embedding this one. */
  editorOrigin: string;
  /** Called with the draft to render. Fires on connect and on every change. */
  onRender: (snapshot: SiteSnapshot, pageSlug: string) => void;
  /** Called when the editor's selection moves, so the site can mark the field.
   *  Optional — a site that does not highlight is still fully usable. */
  onHighlight?: (target: FieldRef | null) => void;
  /** Free-text build identifier shown in the editor, so a developer can see
   *  which build is in the canvas. */
  client?: string;
  /** Report the document height to the editor so it can size the frame.
   *  Default true; pass false if your layout manages its own height. */
  reportHeight?: boolean;
  /** Injected in tests. Defaults to the real window. */
  window?: Window;
};

export type VisualEditingBridge = {
  /** True when this page is running inside the editor. False on a normal
   *  visit, in which case every method below is a no-op. */
  readonly active: boolean;
  /** Tell the editor the visitor clicked an editable field. The editor opens
   *  that field; it does not take a value from here. */
  reportEditIntent(target: FieldRef): void;
  /** Push the current document height to the editor. Called automatically when
   *  `reportHeight` is on; exposed for layouts that change size on their own. */
  reportHeight(height?: number): void;
  /** Remove every listener and observer this created. */
  disconnect(): void;
};

const INERT: VisualEditingBridge = {
  active: false,
  reportEditIntent() {},
  reportHeight() {},
  disconnect() {},
};

/** True when this document is embedded in another. The check is deliberately
 *  defensive: cross-origin access to `window.top` throws in some browsers, and
 *  a thrown error means we ARE cross-origin-embedded, which counts as framed. */
function isFramed(win: Window): boolean {
  try {
    return win.parent !== win;
  } catch {
    return true;
  }
}

export function connectVisualEditing(
  options: ConnectVisualEditingOptions,
): VisualEditingBridge {
  const win = options.window ?? (typeof window !== "undefined" ? window : undefined);
  if (!win || !isFramed(win)) return INERT;

  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(options.editorOrigin).origin;
  } catch {
    // A misconfigured origin must fail closed. Falling back to "*" here would
    // be the single worst line in this file.
    return INERT;
  }

  const post = (message: Record<string, unknown>): void => {
    win.parent.postMessage(
      {
        channel: VISUAL_EDITING_CHANNEL,
        version: VISUAL_EDITING_PROTOCOL_VERSION,
        ...message,
      },
      expectedOrigin,
    );
  };

  const onMessage = (event: MessageEvent): void => {
    if (!originMatches(event.origin, expectedOrigin)) return;
    // Origin alone is not enough. ANY window on the editor's origin — a widget
    // this site embeds, a popup it opened — can post to us and would pass the
    // origin check. Only our actual embedder may drive this page.
    if (event.source !== win.parent) return;
    const message = parseEditorMessage(event.data);
    if (!message) return;
    if (message.type === "render") {
      options.onRender(message.snapshot, message.pageSlug);
    } else {
      options.onHighlight?.(message.target);
    }
  };

  win.addEventListener("message", onMessage);

  const measure = (): number => {
    const doc = win.document?.documentElement;
    return doc ? Math.max(doc.scrollHeight, doc.offsetHeight) : 0;
  };

  const sendHeight = (height?: number): void => {
    post({ type: "resize", height: height ?? measure() });
  };

  // ResizeObserver is not in the SDK's DOM lib baseline (this package targets
  // any runtime, including ones without a DOM), so it is reached defensively
  // rather than assumed. A runtime without it simply does not auto-report
  // height; the caller can still push one with `reportHeight()`.
  type ObserverCtor = new (callback: () => void) => {
    observe(target: unknown): void;
    disconnect(): void;
  };
  const ObserverImpl = (win as unknown as { ResizeObserver?: ObserverCtor })
    .ResizeObserver;
  let observer: { observe(target: unknown): void; disconnect(): void } | undefined;
  if (options.reportHeight !== false && typeof ObserverImpl === "function") {
    observer = new ObserverImpl(() => sendHeight());
    const root = win.document?.documentElement;
    if (root) observer.observe(root);
  }

  post({ type: "ready", ...(options.client ? { client: options.client } : {}) });

  return {
    active: true,
    reportEditIntent(target: FieldRef) {
      post({ type: "edit-intent", target });
    },
    reportHeight: sendHeight,
    disconnect() {
      win.removeEventListener("message", onMessage);
      observer?.disconnect();
    },
  };
}

/** Attribute a site puts on a rendered element so a click can be traced back
 *  to the field that produced it:
 *
 *    <h1 {...sajtField(section.id, "headline")}>{section.content.headline}</h1>
 *
 *  Then one delegated click handler reads the attribute and calls
 *  `reportEditIntent`. Kept as data attributes rather than a wrapper component
 *  so it costs no DOM and works in any framework. */
export function sajtField(
  sectionId: string,
  path: string,
): { "data-sajt-section": string; "data-sajt-field": string } {
  return { "data-sajt-section": sectionId, "data-sajt-field": path };
}

/** Read the nearest `sajtField` marking from a clicked element, if any. */
export function fieldRefFromEventTarget(target: unknown): FieldRef | undefined {
  const element =
    target && typeof (target as Element).closest === "function"
      ? (target as Element).closest("[data-sajt-section][data-sajt-field]")
      : null;
  if (!element) return undefined;
  const sectionId = element.getAttribute("data-sajt-section");
  const path = element.getAttribute("data-sajt-field");
  if (!sectionId || !path) return undefined;
  return { sectionId, path };
}
