import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConnectError,
  startDeviceAuth,
  waitForApproval,
  type DeviceStart,
} from "../src/commands/connect/deviceAuth";
import {
  envFileIsGitIgnored,
  readDeliveryToken,
  readProjectConfig,
  writeDeliveryToken,
  writeProjectConfig,
} from "../src/commands/connect/project";
import { runConnectCommand } from "../src/commands/connect";

function tempProject(): string {
  return mkdtempSync(join(tmpdir(), "snabbsajt-connect-"));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const START: DeviceStart = {
  deviceCode: "dc_secret",
  userCode: "WXYZ-1234",
  verificationUrl: "https://snabbsajt.com/dashboard/connect",
  expiresIn: 600,
  interval: 2,
};

const APPROVED = {
  status: "approved",
  token: "sajt_pub_realtoken",
  websiteId: "k17abcdefghijklmnopqrstuvwx",
  siteName: "Kvarterets Bistro",
  slug: "kvarterets-bistro",
};

function collectOutput() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    output: { stdout: (m: string) => out.push(m), stderr: (m: string) => err.push(m) },
  };
}

describe("device pairing", () => {
  it("starts a pairing and returns the human code and URL", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(START));
    const start = await startDeviceAuth({
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
      apiUrl: "https://example.convex.site",
    });
    expect(start.userCode).toBe("WXYZ-1234");
    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toBe(
      "https://example.convex.site/v1/cli/device/start",
    );
  });

  it("explains a rate-limited start instead of leaking the status code", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "rate_limited" }, 429));
    await expect(
      startDeviceAuth({ fetch: fetchImpl as unknown as typeof globalThis.fetch }),
    ).rejects.toThrow(/Too many pairing attempts/);
  });

  it("polls through pending and resolves when the human approves", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: "pending", userCode: "WXYZ-1234" }))
      .mockResolvedValueOnce(jsonResponse(APPROVED));

    const approved = await waitForApproval(START, {
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
      sleep: async () => {},
    });
    expect(approved.token).toBe("sajt_pub_realtoken");
    expect(approved.siteName).toBe("Kvarterets Bistro");
  });

  it("says the human declined, rather than 'it failed'", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ status: "denied" }));
    await expect(
      waitForApproval(START, {
        fetch: fetchImpl as unknown as typeof globalThis.fetch,
        sleep: async () => {},
      }),
    ).rejects.toThrow(/declined in the browser/);
  });

  it("says the code expired, and to run connect again", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ status: "expired" }));
    await expect(
      waitForApproval(START, {
        fetch: fetchImpl as unknown as typeof globalThis.fetch,
        sleep: async () => {},
      }),
    ).rejects.toThrow(/expired/);
  });

  it("treats an already-used code as its own case, not a denial", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ status: "claimed" }));
    await expect(
      waitForApproval(START, {
        fetch: fetchImpl as unknown as typeof globalThis.fetch,
        sleep: async () => {},
      }),
    ).rejects.toThrow(/already used/);
  });

  it("backs off on a 429 instead of abandoning the pairing", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "rate_limited" }, 429))
      .mockResolvedValueOnce(jsonResponse(APPROVED));
    const slept: number[] = [];

    const approved = await waitForApproval(START, {
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
      sleep: async (ms) => {
        slept.push(ms);
      },
    });
    expect(approved.token).toBe("sajt_pub_realtoken");
    expect(slept[0]).toBeGreaterThan(START.interval * 1000); // backed off
  });

  it("gives up once the pairing window has passed", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ status: "pending" }));
    await expect(
      waitForApproval(
        { ...START, expiresIn: 4 },
        {
          fetch: fetchImpl as unknown as typeof globalThis.fetch,
          sleep: async () => {},
        },
      ),
    ).rejects.toThrow(/Timed out/);
  });
});

describe("project files — the secret/not-secret split", () => {
  it("round-trips the project config", () => {
    const dir = tempProject();
    writeProjectConfig(dir, { siteId: "k17abc", apiUrl: "https://x.convex.site" });
    expect(readProjectConfig(dir)).toMatchObject({ siteId: "k17abc" });
  });

  it("ignores a corrupt project file rather than crashing the CLI", () => {
    const dir = tempProject();
    writeFileSync(join(dir, ".snabbsajt.json"), "{ not json", "utf8");
    expect(readProjectConfig(dir)).toBeUndefined();
  });

  it("creates .env.local with the token and reads it back", () => {
    const dir = tempProject();
    const result = writeDeliveryToken(dir, "sajt_pub_abc");
    expect(result.action).toBe("created");
    expect(readFileSync(join(dir, ".env.local"), "utf8")).toContain(
      "SNABBSAJT_DELIVERY_TOKEN=sajt_pub_abc",
    );
    expect(readDeliveryToken(dir)).toBe("sajt_pub_abc");
  });

  it("REPLACES an existing token rather than stacking a second line", () => {
    const dir = tempProject();
    writeDeliveryToken(dir, "sajt_pub_old");
    const result = writeDeliveryToken(dir, "sajt_pub_new");
    expect(result.action).toBe("replaced");
    const contents = readFileSync(join(dir, ".env.local"), "utf8");
    expect(contents.match(/SNABBSAJT_DELIVERY_TOKEN=/g)).toHaveLength(1);
    expect(contents).toContain("sajt_pub_new");
  });

  it("keeps other variables intact when appending", () => {
    const dir = tempProject();
    writeFileSync(join(dir, ".env.local"), "DATABASE_URL=postgres://x\n", "utf8");
    expect(writeDeliveryToken(dir, "sajt_pub_abc").action).toBe("appended");
    const contents = readFileSync(join(dir, ".env.local"), "utf8");
    expect(contents).toContain("DATABASE_URL=postgres://x");
    expect(contents).toContain("SNABBSAJT_DELIVERY_TOKEN=sajt_pub_abc");
  });

  it("treats a MISSING .gitignore as not-ignored — the safe direction", () => {
    const dir = tempProject();
    expect(envFileIsGitIgnored(dir)).toBe(false);
    expect(writeDeliveryToken(dir, "sajt_pub_abc").unignored).toBe(true);
  });

  it.each([".env.local", "/.env.local", ".env*", ".env*.local", "*.local"])(
    "recognises %s as covering .env.local",
    (rule) => {
      const dir = tempProject();
      writeFileSync(join(dir, ".gitignore"), `node_modules\n${rule}\n`, "utf8");
      expect(envFileIsGitIgnored(dir)).toBe(true);
    },
  );

  it("does not count a commented-out rule as protection", () => {
    const dir = tempProject();
    writeFileSync(join(dir, ".gitignore"), "# .env.local\n", "utf8");
    expect(envFileIsGitIgnored(dir)).toBe(false);
  });

  it("lets the environment win over .env.local, because CI sets it there", () => {
    const dir = tempProject();
    writeDeliveryToken(dir, "sajt_pub_fromfile");
    vi.stubEnv("SNABBSAJT_DELIVERY_TOKEN", "sajt_pub_fromenv");
    expect(readDeliveryToken(dir)).toBe("sajt_pub_fromenv");
    vi.unstubAllEnvs();
  });
});

describe("snabbsajt connect", () => {
  const originalCwd = process.cwd();
  let dir: string;

  beforeEach(() => {
    dir = tempProject();
    process.chdir(dir);
  });
  afterEach(() => {
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
  });

  function pairingFetch() {
    return vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(START))
      .mockResolvedValueOnce(jsonResponse(APPROVED));
  }

  it("writes both files and points at the next command", async () => {
    const { out, output } = collectOutput();
    const code = await runConnectCommand(["connect"], output, {
      fetch: pairingFetch() as unknown as typeof globalThis.fetch,
      sleep: async () => {},
      apiUrl: "https://example.convex.site",
    });

    expect(code).toBe(0);
    expect(readProjectConfig(dir)).toMatchObject({
      siteId: APPROVED.websiteId,
      siteName: "Kvarterets Bistro",
    });
    expect(readDeliveryToken(dir)).toBe("sajt_pub_realtoken");
    expect(out.join("\n")).toContain("snabbsajt pull");
  });

  it("warns on stderr when the token landed in a file git would track", async () => {
    const { err, output } = collectOutput();
    await runConnectCommand(["connect"], output, {
      fetch: pairingFetch() as unknown as typeof globalThis.fetch,
      sleep: async () => {},
    });
    expect(err.join("\n")).toMatch(/does not appear to be gitignored/);
  });

  it("stays quiet when .env.local is already ignored", async () => {
    writeFileSync(join(dir, ".gitignore"), ".env.local\n", "utf8");
    const { err, output } = collectOutput();
    await runConnectCommand(["connect"], output, {
      fetch: pairingFetch() as unknown as typeof globalThis.fetch,
      sleep: async () => {},
    });
    expect(err.join("\n")).not.toMatch(/gitignored/);
  });

  it("never prints the token in --json output, because that lands in CI logs", async () => {
    const { out, output } = collectOutput();
    await runConnectCommand(["connect", "--json"], output, {
      fetch: pairingFetch() as unknown as typeof globalThis.fetch,
      sleep: async () => {},
    });
    expect(out.join("\n")).not.toContain("sajt_pub_realtoken");
    expect(out.join("\n")).toContain("\"tokenWritten\": true");
  });
});

describe("snabbsajt pull", () => {
  const originalCwd = process.cwd();
  let dir: string;

  beforeEach(() => {
    dir = tempProject();
    process.chdir(dir);
  });
  afterEach(() => {
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
  });

  function connected() {
    writeProjectConfig(dir, {
      siteId: "k17abcdefghijklmnopqrstuvwx",
      apiUrl: "https://example.convex.site",
      siteName: "Kvarterets Bistro",
    });
    writeDeliveryToken(dir, "sajt_pub_abc");
  }

  it("refuses before connect, and says which command to run", async () => {
    const { err, output } = collectOutput();
    expect(await runConnectCommand(["pull"], output)).toBe(1);
    expect(err.join("\n")).toMatch(/snabbsajt connect/);
  });

  it("refuses when the token is gone, without blaming the site", async () => {
    writeProjectConfig(dir, { siteId: "k17abc", apiUrl: "https://example.convex.site" });
    const { err, output } = collectOutput();
    expect(await runConnectCommand(["pull"], output)).toBe(1);
    expect(err.join("\n")).toMatch(/SNABBSAJT_DELIVERY_TOKEN/);
  });

  it("writes the published snapshot to disk and reports what it got", async () => {
    connected();
    const body = {
      version: 1,
      siteId: "k17abcdefghijklmnopqrstuvwx",
      versionId: "v42",
      publishedAt: 1_700_000_000_000,
      snapshot: { businessName: "Kvarterets Bistro", pages: [{ slug: "" }, { slug: "meny" }] },
    };
    const { out, output } = collectOutput();
    const code = await runConnectCommand(["pull"], output, {
      fetch: (async () => jsonResponse(body)) as unknown as typeof globalThis.fetch,
    });

    expect(code).toBe(0);
    const written = JSON.parse(
      readFileSync(join(dir, "snabbsajt/published.json"), "utf8"),
    );
    expect(written.versionId).toBe("v42");
    expect(out.join("\n")).toContain("Pulled 2 pages");
  });

  it("honours -o for the output path, creating the directory", async () => {
    connected();
    const { output } = collectOutput();
    await runConnectCommand(["pull", "-o", "content/site.json"], output, {
      fetch: (async () =>
        jsonResponse({
          version: 1,
          siteId: "k17abcdefghijklmnopqrstuvwx",
          versionId: "v1",
          publishedAt: 1,
          snapshot: { pages: [] },
        })) as unknown as typeof globalThis.fetch,
    });
    expect(readFileSync(join(dir, "content/site.json"), "utf8")).toContain("v1");
  });

  it("turns a never-published site into an instruction, not an error code", async () => {
    connected();
    const { err, output } = collectOutput();
    const code = await runConnectCommand(["pull"], output, {
      fetch: (async () =>
        jsonResponse({ error: "not_published" }, 404)) as unknown as typeof globalThis.fetch,
    });
    expect(code).toBe(1);
    expect(err.join("\n")).toMatch(/never been published/);
  });

  it("tells the developer to re-pair when the token was revoked", async () => {
    connected();
    const { err, output } = collectOutput();
    await runConnectCommand(["pull"], output, {
      fetch: (async () =>
        jsonResponse({ error: "unauthorized" }, 401)) as unknown as typeof globalThis.fetch,
    });
    expect(err.join("\n")).toMatch(/snabbsajt connect/);
  });
});
