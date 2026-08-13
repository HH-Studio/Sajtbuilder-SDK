import { spawn } from "node:child_process";

// ---------------------------------------------------------------------------
// Opening the approval page for the human standing at the terminal.
//
// Device-code pairing asks someone to move a URL from a terminal into a
// browser by hand, which is the slowest, most error-prone step of the flow —
// so we do it for them when there is obviously a human there.
//
// Two rules keep that from becoming a liability:
//
//   • Only when interactive. No TTY, or CI set, means nobody is watching a
//     browser, and spawning one is at best noise.
//   • Only http(s), and never through a shell. The URL comes from a server
//     response; treating it as an opaque string handed to `open(1)` is how a
//     redirect or a crafted value turns into command execution. We parse it,
//     demand a web protocol, and pass it as a single argv entry.
// ---------------------------------------------------------------------------

export type OpenBrowserEnv = {
  platform?: NodeJS.Platform;
  isTty?: boolean;
  env?: Record<string, string | undefined>;
  /** Injected in tests so nothing is really spawned. */
  spawnImpl?: typeof spawn;
};

/** True when a browser should be opened without being asked. */
export function shouldAutoOpen(deps: OpenBrowserEnv = {}): boolean {
  const env = deps.env ?? process.env;
  const isTty = deps.isTty ?? Boolean(process.stdout.isTTY);
  if (!isTty) return false;
  // Any CI system, plus the usual opt-outs people already reach for.
  if (env.CI || env.SNABBSAJT_NO_OPEN || env.NO_BROWSER) return false;
  return true;
}

/** Best-effort. Returns whether we actually launched something; never throws,
 *  because failing to open a browser must never fail a pairing. */
export function openBrowser(url: string, deps: OpenBrowserEnv = {}): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;

  const platform = deps.platform ?? process.platform;
  const spawnImpl = deps.spawnImpl ?? spawn;
  const [command, args] =
    platform === "darwin"
      ? (["open", [parsed.href]] as const)
      : platform === "win32"
        // `start` is a cmd builtin; the empty string is the window title that
        // cmd would otherwise steal from a quoted URL.
        ? (["cmd", ["/c", "start", "", parsed.href]] as const)
        : (["xdg-open", [parsed.href]] as const);

  try {
    const child = spawnImpl(command, [...args], {
      stdio: "ignore",
      detached: true,
      // Never `shell: true` — see the header.
      shell: false,
    });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
