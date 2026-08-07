import { describe, expect, it } from "vitest";
import {
  compareVersions,
  detectInstall,
  maybeNotifyUpdate,
  offerUpgrade,
  runUpgradeCommand,
  updateChecksEnabled,
  upgradeCommand,
} from "../src/update";

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    output: { stdout: (m: string) => out.push(m), stderr: (m: string) => err.push(m) },
    stdoutText: () => out.join("\n"),
    stderrText: () => err.join("\n"),
  };
}

const registry = (version: string): typeof globalThis.fetch =>
  (async () => new Response(JSON.stringify({ version }), { status: 200 })) as unknown as typeof globalThis.fetch;

const offline: typeof globalThis.fetch = (async () => {
  throw new Error("offline");
}) as unknown as typeof globalThis.fetch;

describe("compareVersions", () => {
  it("orders numerically, not as strings", () => {
    // The bug this exists to prevent: "0.10.0" < "0.9.0" lexicographically,
    // which makes a CLI tell people to downgrade.
    expect(compareVersions("0.9.0", "0.10.0")).toBe(-1);
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("v1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("2.0.0", "10.0.0")).toBe(-1);
  });

  it("treats a prerelease as older than its release", () => {
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBe(-1);
    expect(compareVersions("1.0.0", "1.0.0-beta.1")).toBe(1);
  });
});

describe("detectInstall", () => {
  it("recognises npx, a global install and a repo dependency", () => {
    expect(detectInstall("/Users/x/.npm/_npx/abc/node_modules/.bin/snabbsajt")).toBe("npx");
    expect(detectInstall("/usr/local/lib/node_modules/@snabbsajt/cli/dist/cli.js")).toBe("npm");
    expect(detectInstall("/Users/x/repo/node_modules/.bin/snabbsajt")).toBe("local");
    expect(detectInstall("/Users/x/.bun/bin/snabbsajt")).toBe("bun");
  });

  it("does not depend on npm_config_user_agent, which npx often leaves empty", () => {
    expect(detectInstall("/Users/x/.npm/_npx/abc/node_modules/.bin/snabbsajt", "")).toBe("npx");
  });
});

describe("upgradeCommand", () => {
  it("has nothing to run under npx", () => {
    expect(upgradeCommand("npx")).toBeNull();
  });
  it("names the right manager", () => {
    expect(upgradeCommand("pnpm")).toContain("pnpm add -g");
    expect(upgradeCommand("npm")).toContain("npm install -g");
  });
});

describe("updateChecksEnabled", () => {
  it("is silent for machines", () => {
    // --json is the load-bearing one: a version banner in a pipe corrupts the
    // output of the command the caller actually ran.
    expect(updateChecksEnabled(true)).toBe(false);
  });
});

describe("maybeNotifyUpdate", () => {
  it("says nothing after a failed command", async () => {
    const cap = capture();
    const latest = await maybeNotifyUpdate("0.1.0", {
      asJson: false,
      failed: true,
      now: Date.now(),
      output: cap.output,
      fetch: registry("9.9.9"),
    });
    expect(latest).toBeUndefined();
    expect(cap.stderrText()).toBe("");
  });

  it("says nothing under --json even when a newer version exists", async () => {
    const cap = capture();
    await maybeNotifyUpdate("0.1.0", {
      asJson: true,
      failed: false,
      now: Date.now(),
      output: cap.output,
      fetch: registry("9.9.9"),
    });
    expect(cap.stdoutText()).toBe("");
    expect(cap.stderrText()).toBe("");
  });

  it("is silent when the registry is unreachable", async () => {
    const cap = capture();
    const latest = await maybeNotifyUpdate("0.1.0", {
      asJson: false,
      failed: false,
      now: Date.now(),
      output: cap.output,
      fetch: offline,
    });
    expect(latest).toBeUndefined();
    expect(cap.stderrText()).toBe("");
  });
});

describe("offerUpgrade", () => {
  it("defaults to no, and prints the command anyway", async () => {
    const cap = capture();
    let ran: string | undefined;
    const code = await offerUpgrade("npm install -g @snabbsajt/cli@latest", cap.output, {
      confirm: async (_q, defaultYes) => defaultYes,
      run: (cmd) => {
        ran = cmd;
        return 0;
      },
    });
    // Nothing ran, because the default answer is no. A CLI that upgrades a
    // pinned global toolchain because someone hit Enter is a CLI people
    // uninstall.
    expect(ran).toBeUndefined();
    expect(code).toBe(0);
    expect(cap.stdoutText()).toContain("npm install -g @snabbsajt/cli@latest");
  });

  it("runs the command on an explicit yes and returns its exit code", async () => {
    const cap = capture();
    let ran: string | undefined;
    const code = await offerUpgrade("pnpm add -g @snabbsajt/cli@latest", cap.output, {
      confirm: async () => true,
      run: (cmd) => {
        ran = cmd;
        return 3;
      },
    });
    expect(ran).toBe("pnpm add -g @snabbsajt/cli@latest");
    expect(code).toBe(3);
  });
});

describe("runUpgradeCommand", () => {
  it("--json reports the facts and runs nothing", async () => {
    const cap = capture();
    let ran = false;
    const code = await runUpgradeCommand(["--json"], "0.3.0", cap.output, {
      fetch: registry("0.4.0"),
      now: Date.now(),
      run: () => {
        ran = true;
        return 0;
      },
    });
    expect(code).toBe(0);
    expect(ran).toBe(false);
    const payload = JSON.parse(cap.stdoutText()) as { latest: string; upToDate: boolean };
    expect(payload.latest).toBe("0.4.0");
    expect(payload.upToDate).toBe(false);
  });

  it("says so when already current", async () => {
    const cap = capture();
    const code = await runUpgradeCommand([], "9.9.9", cap.output, {
      fetch: registry("0.4.0"),
      now: Date.now(),
    });
    expect(code).toBe(0);
    expect(cap.stdoutText()).toContain("Already on the newest");
  });
});
