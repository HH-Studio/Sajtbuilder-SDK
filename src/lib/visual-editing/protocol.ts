import type { SiteSnapshot } from "../../convex/model/snapshot";

// ---------------------------------------------------------------------------
// Visual-editing bridge — the wire protocol between the SnabbSajt editor and a
// headless site rendering inside its canvas.
//
// The shape of the problem: the builder's site runs THEIR code, so it cannot
// run inside our renderer, and we will not execute it. Instead their site runs
// where it always runs — on their own host — and the editor embeds it in a
// sandboxed iframe. Content flows in, click-to-edit intents flow back.
//
// Two rules make this safe, and both are enforced on both sides:
//
//   1. EVERY message is checked against an expected origin. A page inside the
//      iframe can navigate itself anywhere; without this check a third-party
//      page could impersonate the site and receive draft content.
//   2. Nothing executable ever crosses. The payload is a SiteSnapshot — the
//      same validated, typed document the published site renders — plus flat
//      identifiers. No HTML, no functions, no style strings.
//
// The editor is the source of truth for content. The site is the source of
// truth for layout and for where a field appears on screen. Neither trusts the
// other for anything outside its own half.
// ---------------------------------------------------------------------------

/** Bumped only on a breaking change. Both sides refuse a version they do not
 *  know, rather than guessing at a payload they may not understand. */
export const VISUAL_EDITING_PROTOCOL_VERSION = 1;

/** Namespace on every message, so a page that uses postMessage for its own
 *  purposes never collides with ours. */
export const VISUAL_EDITING_CHANNEL = "snabbsajt.visual-editing";

// ── editor → site ──────────────────────────────────────────────────────────

/** Sent once the editor has seen the site's `ready`, and again on every draft
 *  change. The site re-renders from this and nothing else. */
export type RenderMessage = {
  channel: typeof VISUAL_EDITING_CHANNEL;
  version: number;
  type: "render";
  /** The draft as it currently stands — same shape as a published snapshot. */
  snapshot: SiteSnapshot;
  /** Which page of the site the editor is showing, by slug ("" = home). */
  pageSlug: string;
};

/** Ask the site to visually mark one field — the editor's selection moved. */
export type HighlightMessage = {
  channel: typeof VISUAL_EDITING_CHANNEL;
  version: number;
  type: "highlight";
  /** Null clears the highlight. */
  target: FieldRef | null;
};

export type EditorMessage = RenderMessage | HighlightMessage;

// ── site → editor ──────────────────────────────────────────────────────────

/** First message from the site: "I am wired up, send me content." */
export type ReadyMessage = {
  channel: typeof VISUAL_EDITING_CHANNEL;
  version: number;
  type: "ready";
  /** Free-text, display only — shown in the editor so a developer can tell
   *  which build is in the canvas ("next@15.5.0, commit a1b2c3"). */
  client?: string;
};

/** The visitor clicked something editable in the rendered site. The editor
 *  responds by opening that field — it does NOT trust this to change data. */
export type EditIntentMessage = {
  channel: typeof VISUAL_EDITING_CHANNEL;
  version: number;
  type: "edit-intent";
  target: FieldRef;
};

/** The site's rendered height changed, so the editor can size the iframe
 *  instead of leaving a scrollbar inside a scrollbar. */
export type ResizeMessage = {
  channel: typeof VISUAL_EDITING_CHANNEL;
  version: number;
  type: "resize";
  height: number;
};

export type SiteMessage = ReadyMessage | EditIntentMessage | ResizeMessage;

/** Points at one editable value. `sectionId` is the section's stable id as it
 *  appears in the snapshot; `path` is a dotted path within that section's
 *  content ("headline", "items.2.title"). Deliberately flat strings: the editor
 *  resolves them against its own draft and ignores anything it cannot match. */
export type FieldRef = {
  sectionId: string;
  path: string;
};

// ── validation ─────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFieldRef(value: unknown): value is FieldRef {
  return (
    isRecord(value) &&
    typeof value.sectionId === "string" &&
    value.sectionId.length > 0 &&
    typeof value.path === "string" &&
    value.path.length > 0 &&
    // A path is content addressing, not a selector. Anything outside this
    // alphabet is either a mistake or an attempt at something else.
    /^[A-Za-z0-9_.[\]-]{1,200}$/.test(value.path)
  );
}

/** Narrow an untrusted `MessageEvent.data` to a site→editor message.
 *  Returns undefined for anything that is not ours — including a message with
 *  the right shape but an unknown protocol version. */
export function parseSiteMessage(data: unknown): SiteMessage | undefined {
  if (!isRecord(data)) return undefined;
  if (data.channel !== VISUAL_EDITING_CHANNEL) return undefined;
  if (data.version !== VISUAL_EDITING_PROTOCOL_VERSION) return undefined;

  switch (data.type) {
    case "ready":
      return {
        channel: VISUAL_EDITING_CHANNEL,
        version: VISUAL_EDITING_PROTOCOL_VERSION,
        type: "ready",
        ...(typeof data.client === "string"
          ? { client: data.client.slice(0, 200) }
          : {}),
      };
    case "edit-intent":
      if (!isFieldRef(data.target)) return undefined;
      return {
        channel: VISUAL_EDITING_CHANNEL,
        version: VISUAL_EDITING_PROTOCOL_VERSION,
        type: "edit-intent",
        target: { sectionId: data.target.sectionId, path: data.target.path },
      };
    case "resize": {
      const height = data.height;
      // A hostile or buggy height must not be able to blow up the editor's
      // layout, so it is clamped rather than trusted or rejected.
      if (typeof height !== "number" || !Number.isFinite(height)) return undefined;
      return {
        channel: VISUAL_EDITING_CHANNEL,
        version: VISUAL_EDITING_PROTOCOL_VERSION,
        type: "resize",
        height: Math.min(Math.max(Math.round(height), 0), 50_000),
      };
    }
    default:
      return undefined;
  }
}

/** Narrow an untrusted `MessageEvent.data` to an editor→site message. */
export function parseEditorMessage(data: unknown): EditorMessage | undefined {
  if (!isRecord(data)) return undefined;
  if (data.channel !== VISUAL_EDITING_CHANNEL) return undefined;
  if (data.version !== VISUAL_EDITING_PROTOCOL_VERSION) return undefined;

  switch (data.type) {
    case "render": {
      if (!isRecord(data.snapshot)) return undefined;
      if (typeof data.pageSlug !== "string") return undefined;
      return {
        channel: VISUAL_EDITING_CHANNEL,
        version: VISUAL_EDITING_PROTOCOL_VERSION,
        type: "render",
        snapshot: data.snapshot as unknown as SiteSnapshot,
        pageSlug: data.pageSlug,
      };
    }
    case "highlight":
      if (data.target !== null && !isFieldRef(data.target)) return undefined;
      return {
        channel: VISUAL_EDITING_CHANNEL,
        version: VISUAL_EDITING_PROTOCOL_VERSION,
        type: "highlight",
        target: data.target === null ? null : (data.target as FieldRef),
      };
    default:
      return undefined;
  }
}

/** Compare a message event's origin against the one we expect.
 *
 *  Exact string equality on the ORIGIN, never `startsWith` and never a check
 *  against the href: `https://evil.com?x=https://good.com` starts with nothing
 *  useful, but a sloppy substring check on a full URL would pass it. */
export function originMatches(eventOrigin: string, expected: string): boolean {
  if (!eventOrigin || !expected) return false;
  try {
    return new URL(expected).origin === eventOrigin;
  } catch {
    return false;
  }
}
