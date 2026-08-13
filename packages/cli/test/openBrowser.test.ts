import { describe, expect, it, vi } from "vitest";
import { openBrowser, shouldAutoOpen } from "../src/commands/openBrowser";

// A stand-in for node's spawn that records the argv it was handed and returns
// the minimum surface openBrowser touches.
function recordingSpawn() {
  const calls: Array<{ command: string; args: string[] }> = [];
  const impl = ((command: string, args: string[]) => {
    calls.push({ command, args });
    return { on: () => {}, unref: () => {} };
  }) as unknown as typeof import("node:child_process").spawn;
  return { calls, impl };
}

describe("shouldAutoOpen", () => {
  it("opens when a human is at an interactive terminal", () => {
    expect(shouldAutoOpen({ isTty: true, env: {} })).toBe(true);
  });

  it("stays quiet when there is no TTY", () => {
    expect(shouldAutoOpen({ isTty: false, env: {} })).toBe(false);
  });

  it("stays quiet in CI even with a TTY", () => {
    expect(shouldAutoOpen({ isTty: true, env: { CI: "true" } })).toBe(false);
  });

  it("honours the opt-out variables", () => {
    expect(shouldAutoOpen({ isTty: true, env: { SNABBSAJT_NO_OPEN: "1" } })).toBe(false);
    expect(shouldAutoOpen({ isTty: true, env: { NO_BROWSER: "1" } })).toBe(false);
  });
});

describe("openBrowser", () => {
  it("uses the platform opener and passes the URL as one argv entry", () => {
    const { calls, impl } = recordingSpawn();
    expect(
      openBrowser("https://snabbsajt.com/dashboard/connect", {
        platform: "darwin",
        spawnImpl: impl,
      }),
    ).toBe(true);
    expect(calls).toEqual([
      { command: "open", args: ["https://snabbsajt.com/dashboard/connect"] },
    ]);
  });

  it("uses xdg-open on linux and cmd start on windows", () => {
    const linux = recordingSpawn();
    openBrowser("https://x.test/a", { platform: "linux", spawnImpl: linux.impl });
    expect(linux.calls[0]?.command).toBe("xdg-open");

    const win = recordingSpawn();
    openBrowser("https://x.test/a", { platform: "win32", spawnImpl: win.impl });
    expect(win.calls[0]).toEqual({
      command: "cmd",
      args: ["/c", "start", "", "https://x.test/a"],
    });
  });

  // The URL arrives in a server response, so anything that is not plainly a web
  // address must never reach an opener — this is the injection boundary.
  it.each(["file:///etc/passwd", "javascript:alert(1)", "not a url at all", ""])(
    "refuses to open %s",
    (url) => {
      const { calls, impl } = recordingSpawn();
      expect(openBrowser(url, { platform: "darwin", spawnImpl: impl })).toBe(false);
      expect(calls).toHaveLength(0);
    },
  );

  // Shell metacharacters in a legal https URL are NOT a reason to refuse — `&`
  // is valid in a path — but they must stay inside a single argv entry, because
  // that (plus shell: false) is what makes them inert.
  it("keeps a URL containing shell metacharacters in one argv entry", () => {
    const { calls, impl } = recordingSpawn();
    expect(
      openBrowser('https://x.test/a" && rm -rf /', {
        platform: "darwin",
        spawnImpl: impl,
      }),
    ).toBe(true);
    expect(calls[0]?.args).toHaveLength(1);
    expect(calls[0]?.args[0]).toBe(new URL('https://x.test/a" && rm -rf /').href);
    // And nothing was ever handed to a shell to re-parse.
    expect(calls[0]?.args[0]).not.toContain(" ");
  });

  it("never throws when the opener is missing", () => {
    const throwing = (() => {
      throw new Error("ENOENT");
    }) as unknown as typeof import("node:child_process").spawn;
    expect(() =>
      openBrowser("https://x.test", { platform: "linux", spawnImpl: throwing }),
    ).not.toThrow();
    expect(openBrowser("https://x.test", { platform: "linux", spawnImpl: throwing })).toBe(
      false,
    );
  });
});
