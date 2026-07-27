import { describe, expect, it, vi } from "vitest";
import {
  connectVisualEditing,
  fieldRefFromEventTarget,
  sajtField,
} from "../src/lib/visual-editing/connect";
import {
  originMatches,
  parseEditorMessage,
  parseSiteMessage,
  VISUAL_EDITING_CHANNEL,
  VISUAL_EDITING_PROTOCOL_VERSION,
} from "../src/lib/visual-editing/protocol";

const CHANNEL = VISUAL_EDITING_CHANNEL;
const VERSION = VISUAL_EDITING_PROTOCOL_VERSION;
const EDITOR = "https://snabbsajt.com";

function envelope(extra: Record<string, unknown>) {
  return { channel: CHANNEL, version: VERSION, ...extra };
}

/** A window stand-in that is framed, records postMessage, and lets a test
 *  deliver an inbound message with a chosen origin. */
function fakeWindow(opts: { framed?: boolean } = {}) {
  const listeners: Array<(e: MessageEvent) => void> = [];
  const posted: Array<{ message: unknown; origin: string }> = [];
  const self = {
    parent: {} as Window,
    addEventListener: (_: string, fn: (e: MessageEvent) => void) => {
      listeners.push(fn);
    },
    removeEventListener: (_: string, fn: (e: MessageEvent) => void) => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
    document: { documentElement: { scrollHeight: 900, offsetHeight: 900 } },
  } as unknown as Window & { parent: Window };

  if (opts.framed === false) (self as { parent: Window }).parent = self;
  (self.parent as unknown as { postMessage: unknown }).postMessage = (
    message: unknown,
    origin: string,
  ) => {
    posted.push({ message, origin });
  };

  return {
    win: self,
    posted,
    listenerCount: () => listeners.length,
    /** Deliver as the real embedder would: right origin, source === parent. */
    deliver(data: unknown, origin: string) {
      for (const fn of [...listeners])
        fn({ data, origin, source: self.parent } as unknown as MessageEvent);
    },
    /** Deliver a fully hand-built event, for testing the source check. */
    deliverRaw(event: MessageEvent) {
      for (const fn of [...listeners]) fn(event);
    },
  };
}

describe("origin checking", () => {
  it("accepts the exact origin", () => {
    expect(originMatches("https://snabbsajt.com", EDITOR)).toBe(true);
  });

  it("rejects a look-alike prefix domain", () => {
    // The classic: a substring check would let this through.
    expect(originMatches("https://snabbsajt.com.evil.test", EDITOR)).toBe(false);
  });

  it("rejects the same host on another scheme or port", () => {
    expect(originMatches("http://snabbsajt.com", EDITOR)).toBe(false);
    expect(originMatches("https://snabbsajt.com:8443", EDITOR)).toBe(false);
  });

  it("rejects empty and unparseable values rather than defaulting open", () => {
    expect(originMatches("", EDITOR)).toBe(false);
    expect(originMatches("https://snabbsajt.com", "not a url")).toBe(false);
  });
});

describe("parsing untrusted messages", () => {
  it("ignores anything not on our channel", () => {
    expect(parseSiteMessage({ type: "ready", version: VERSION })).toBeUndefined();
    expect(parseSiteMessage("hello")).toBeUndefined();
    expect(parseSiteMessage(null)).toBeUndefined();
  });

  it("refuses an unknown protocol version instead of guessing", () => {
    expect(
      parseSiteMessage({ channel: CHANNEL, version: 99, type: "ready" }),
    ).toBeUndefined();
  });

  it("accepts a well-formed edit intent", () => {
    const parsed = parseSiteMessage(
      envelope({ type: "edit-intent", target: { sectionId: "s1", path: "headline" } }),
    );
    expect(parsed).toMatchObject({ type: "edit-intent", target: { path: "headline" } });
  });

  it.each([
    ["a missing target", { type: "edit-intent" }],
    ["an empty path", { type: "edit-intent", target: { sectionId: "s1", path: "" } }],
    [
      "a path with a quote",
      { type: "edit-intent", target: { sectionId: "s1", path: 'a"b' } },
    ],
    [
      "a path that looks like a selector",
      { type: "edit-intent", target: { sectionId: "s1", path: "div > span" } },
    ],
    [
      "a non-string sectionId",
      { type: "edit-intent", target: { sectionId: 7, path: "headline" } },
    ],
  ])("rejects %s", (_label, body) => {
    expect(parseSiteMessage(envelope(body))).toBeUndefined();
  });

  it("clamps an absurd height rather than trusting or dropping it", () => {
    expect(parseSiteMessage(envelope({ type: "resize", height: 10 ** 9 }))).toMatchObject(
      { height: 50_000 },
    );
    expect(parseSiteMessage(envelope({ type: "resize", height: -20 }))).toMatchObject({
      height: 0,
    });
  });

  it("rejects a non-finite height", () => {
    expect(
      parseSiteMessage(envelope({ type: "resize", height: Number.NaN })),
    ).toBeUndefined();
    expect(
      parseSiteMessage(envelope({ type: "resize", height: "600" })),
    ).toBeUndefined();
  });

  it("truncates an over-long client string instead of storing it whole", () => {
    const parsed = parseSiteMessage(
      envelope({ type: "ready", client: "x".repeat(5000) }),
    );
    expect((parsed as { client: string }).client).toHaveLength(200);
  });

  it("parses editor→site render and highlight, and rejects malformed ones", () => {
    expect(
      parseEditorMessage(envelope({ type: "render", snapshot: {}, pageSlug: "" })),
    ).toMatchObject({ type: "render" });
    expect(
      parseEditorMessage(envelope({ type: "highlight", target: null })),
    ).toMatchObject({ type: "highlight", target: null });
    expect(
      parseEditorMessage(envelope({ type: "render", snapshot: "nope", pageSlug: "" })),
    ).toBeUndefined();
    expect(
      parseEditorMessage(envelope({ type: "render", snapshot: {} })),
    ).toBeUndefined();
  });
});

describe("connectVisualEditing", () => {
  it("is completely inert on a normal, unframed visit", () => {
    const { win, posted } = fakeWindow({ framed: false });
    const bridge = connectVisualEditing({
      editorOrigin: EDITOR,
      onRender: () => {},
      window: win,
    });
    expect(bridge.active).toBe(false);
    bridge.reportEditIntent({ sectionId: "s1", path: "headline" });
    expect(posted).toHaveLength(0);
  });

  it("fails closed on a misconfigured editor origin — never falls back to '*'", () => {
    const { win, posted } = fakeWindow();
    const bridge = connectVisualEditing({
      editorOrigin: "not a url",
      onRender: () => {},
      window: win,
    });
    expect(bridge.active).toBe(false);
    expect(posted).toHaveLength(0);
  });

  it("announces itself to the editor's exact origin, never a wildcard", () => {
    const { win, posted } = fakeWindow();
    connectVisualEditing({
      editorOrigin: EDITOR,
      onRender: () => {},
      client: "next@15",
      window: win,
    });
    expect(posted).toHaveLength(1);
    expect(posted[0]!.origin).toBe(EDITOR);
    expect(posted[0]!.message).toMatchObject({ type: "ready", client: "next@15" });
  });

  it("renders content the editor sends", () => {
    const { win, deliver } = fakeWindow();
    const onRender = vi.fn();
    connectVisualEditing({ editorOrigin: EDITOR, onRender, window: win });

    deliver(
      envelope({ type: "render", snapshot: { businessName: "X" }, pageSlug: "meny" }),
      EDITOR,
    );
    expect(onRender).toHaveBeenCalledWith({ businessName: "X" }, "meny");
  });

  it("IGNORES a render that arrives from any other origin", () => {
    const { win, deliver } = fakeWindow();
    const onRender = vi.fn();
    connectVisualEditing({ editorOrigin: EDITOR, onRender, window: win });

    deliver(
      envelope({ type: "render", snapshot: { businessName: "evil" }, pageSlug: "" }),
      "https://evil.test",
    );
    expect(onRender).not.toHaveBeenCalled();
  });

  it("IGNORES a render from another window on the editor's own origin", () => {
    // Origin alone is not enough: a widget this site embeds, or a popup it
    // opened, served from the editor's origin would otherwise be able to swap
    // the content the site displays.
    const { win, deliverRaw } = fakeWindow();
    const onRender = vi.fn();
    connectVisualEditing({ editorOrigin: EDITOR, onRender, window: win });

    // Right origin, wrong window.
    deliverRaw({
      data: envelope({ type: "render", snapshot: {}, pageSlug: "" }),
      origin: EDITOR,
      source: { notOurParent: true },
    } as unknown as MessageEvent);
    expect(onRender).not.toHaveBeenCalled();
  });

  it("rejects an ARRAY masquerading as a snapshot", () => {
    const { win, deliver } = fakeWindow();
    const onRender = vi.fn();
    connectVisualEditing({ editorOrigin: EDITOR, onRender, window: win });
    deliver(envelope({ type: "render", snapshot: [], pageSlug: "" }), EDITOR);
    expect(onRender).not.toHaveBeenCalled();
  });

  it("stops listening after disconnect", () => {
    const { win, deliver, listenerCount } = fakeWindow();
    const onRender = vi.fn();
    const bridge = connectVisualEditing({ editorOrigin: EDITOR, onRender, window: win });
    bridge.disconnect();
    expect(listenerCount()).toBe(0);

    deliver(envelope({ type: "render", snapshot: {}, pageSlug: "" }), EDITOR);
    expect(onRender).not.toHaveBeenCalled();
  });

  it("reports an edit intent and a measured height back to the editor", () => {
    const { win, posted } = fakeWindow();
    const bridge = connectVisualEditing({
      editorOrigin: EDITOR,
      onRender: () => {},
      window: win,
    });
    bridge.reportEditIntent({ sectionId: "s1", path: "headline" });
    bridge.reportHeight();

    const types = posted.map((p) => (p.message as { type: string }).type);
    expect(types).toEqual(["ready", "edit-intent", "resize"]);
    expect(posted[2]!.message).toMatchObject({ height: 900 });
  });
});

describe("field marking", () => {
  it("emits data attributes a click handler can read back", () => {
    expect(sajtField("s1", "items.2.title")).toEqual({
      "data-sajt-section": "s1",
      "data-sajt-field": "items.2.title",
    });
  });

  it("walks up to the nearest marked ancestor", () => {
    const marked = {
      getAttribute: (name: string) =>
        name === "data-sajt-section" ? "s1" : "headline",
    };
    const clicked = { closest: () => marked };
    expect(fieldRefFromEventTarget(clicked)).toEqual({
      sectionId: "s1",
      path: "headline",
    });
  });

  it("returns nothing for a click on unmarked chrome", () => {
    expect(fieldRefFromEventTarget({ closest: () => null })).toBeUndefined();
    expect(fieldRefFromEventTarget(undefined)).toBeUndefined();
  });
});
