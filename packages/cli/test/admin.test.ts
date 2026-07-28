import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAdminCommand } from "../src/commands/admin";
import {
  ADMIN_PROJECT_FILE,
  ADMIN_TOKEN_ENV_VAR,
  readAdminConfig,
  readAdminToken,
} from "../src/commands/admin/adminProject";
import { parseRpcMessage } from "../src/commands/admin/mcpClient";
import { readDeliveryToken } from "../src/commands/connect/project";

// Every test here stubs `fetch`. Nothing in this file may reach the network: the
// endpoints under test mint a live write credential, and a test that quietly
// talks to production is worse than no test.

const repoRoot = resolve(import.meta.dirname, "../../..");
const sourceCli = join(repoRoot, "packages/cli/src/cli.ts");

/** The one thing that must never appear in output, in any mode. */
const TOKEN = "sajt_live_deadbeefcafe";

// Belt and braces: every case below injects its own fetch, and the global one is
// replaced by a thrower so a path that forgets to would fail loudly instead of
// quietly pairing against production.
beforeEach(() => {
  vi.stubGlobal("fetch", () => {
    throw new Error("a test tried to use the real fetch");
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function tempProject(): string {
  return mkdtempSync(join(tmpdir(), "snabbsajt-admin-"));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** How the app's MCP endpoint actually answers: a one-event SSE stream. */
function sseResponse(body: unknown, status = 200): Response {
  return new Response(`event: message\ndata: ${JSON.stringify(body)}\n\n`, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function rpcResult(id: number, result: unknown): Response {
  return sseResponse({ jsonrpc: "2.0", id, result });
}

const INITIALIZE_RESULT = {
  protocolVersion: "2025-06-18",
  capabilities: { tools: {} },
  serverInfo: { name: "snabbsajt", version: "1.0.0" },
};

const PAIR_START = {
  deviceCode: "dc_pair_secret",
  userCode: "ABCD-7788",
  // Normalised by the server: `publish` was dropped as unknown here, and
  // `site:read` is always on.
  scopes: ["site:read", "content:write"],
  verificationUrl: "https://example.test/dashboard/connect",
  expiresIn: 600,
  interval: 2,
};

const PAIR_APPROVED = {
  status: "approved",
  token: TOKEN,
  websiteId: "k17abcdefghijklmnopqrstuvwx",
  scopes: ["site:read", "content:write"],
  siteName: "Kvarterets Bistro",
  slug: "kvarterets-bistro",
};

function collectOutput() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    all: () => [...out, ...err].join("\n"),
    output: { stdout: (m: string) => out.push(m), stderr: (m: string) => err.push(m) },
  };
}

describe("snabbsajt admin pair", () => {
  const originalCwd = process.cwd();
  let dir: string;

  beforeEach(() => {
    dir = tempProject();
    process.chdir(dir);
    // A developer's own exported overrides must not decide what these assert.
    vi.stubEnv("SNABBSAJT_APP_URL", undefined);
    vi.stubEnv("SNABBSAJT_API_URL", undefined);
    vi.stubEnv(ADMIN_TOKEN_ENV_VAR, undefined);
    vi.stubEnv("SNABBSAJT_DELIVERY_TOKEN", undefined);
  });
  afterEach(() => {
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
  });

  function pairingFetch(approved: unknown = PAIR_APPROVED, start: unknown = PAIR_START) {
    return vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(start))
      .mockResolvedValueOnce(jsonResponse(approved));
  }

  it("writes SNABBSAJT_ADMIN_TOKEN and leaves the read-only token alone", async () => {
    const { out, output } = collectOutput();
    const fetchImpl = pairingFetch();
    const code = await runAdminCommand(["pair"], output, {
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
      sleep: async () => {},
      apiUrl: "https://example.convex.site",
    });

    expect(code).toBe(0);
    expect(readAdminToken(dir)).toBe(TOKEN);
    // The whole reason for a second variable: pairing must not escalate what
    // `pull` holds.
    expect(readDeliveryToken(dir)).toBeUndefined();
    expect(readFileSync(join(dir, ".env.local"), "utf8")).toContain(
      `${ADMIN_TOKEN_ENV_VAR}=`,
    );
    expect(readAdminConfig(dir)).toMatchObject({
      siteId: PAIR_APPROVED.websiteId,
      siteName: "Kvarterets Bistro",
      // Derived from the approval URL, so `admin tools` needs no flag after this.
      appUrl: "https://example.test",
      scopes: ["site:read", "content:write"],
    });
    expect(out.join("\n")).toContain("snabbsajt admin tools");

    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toBe(
      "https://example.convex.site/v1/cli/pair/start",
    );
    expect(String((fetchImpl.mock.calls[1] as unknown[])[0])).toBe(
      "https://example.convex.site/v1/cli/pair/poll",
    );
  });

  it("asks for site:read,content:write when --scopes is omitted", async () => {
    const fetchImpl = pairingFetch();
    const { output } = collectOutput();
    await runAdminCommand(["pair"], output, {
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
      sleep: async () => {},
    });
    const body = JSON.parse(
      String((fetchImpl.mock.calls[0] as [string, { body: string }])[1].body),
    );
    expect(body.scopes).toEqual(["site:read", "content:write"]);
  });

  it("prints the server's normalised ask, not the raw --scopes value", async () => {
    const { out, output } = collectOutput();
    await runAdminCommand(["pair", "--scopes", "content:write,not-a-scope"], output, {
      fetch: pairingFetch() as unknown as typeof globalThis.fetch,
      sleep: async () => {},
    });
    expect(out.join("\n")).toContain("site:read, content:write");
    expect(out.join("\n")).not.toContain("not-a-scope");
  });

  it("prints the GRANTED scopes when the owner unticked one", async () => {
    const { out, output } = collectOutput();
    await runAdminCommand(["pair", "--scopes", "site:read,content:write,publish"], output, {
      fetch: pairingFetch(
        { ...PAIR_APPROVED, scopes: ["site:read"] },
        { ...PAIR_START, scopes: ["site:read", "content:write", "publish"] },
      ) as unknown as typeof globalThis.fetch,
      sleep: async () => {},
    });
    const printed = out.join("\n");
    expect(printed).toContain("Granted   site:read");
    expect(printed).toContain("narrower than requested");
    expect(readAdminConfig(dir)?.scopes).toEqual(["site:read"]);
  });

  it("never prints the token, in either output mode", async () => {
    const plain = collectOutput();
    await runAdminCommand(["pair"], plain.output, {
      fetch: pairingFetch() as unknown as typeof globalThis.fetch,
      sleep: async () => {},
    });
    expect(plain.all()).not.toContain(TOKEN);
    expect(plain.all()).not.toContain("sajt_live_");

    const machine = collectOutput();
    await runAdminCommand(["pair", "--json"], machine.output, {
      fetch: pairingFetch() as unknown as typeof globalThis.fetch,
      sleep: async () => {},
    });
    expect(machine.all()).not.toContain(TOKEN);
    expect(machine.all()).not.toContain("sajt_live_");
    expect(machine.out.join("\n")).toContain('"tokenWritten": true');
  });

  it("warns on stderr when the token landed in a file git would track", async () => {
    const { err, output } = collectOutput();
    await runAdminCommand(["pair"], output, {
      fetch: pairingFetch() as unknown as typeof globalThis.fetch,
      sleep: async () => {},
    });
    expect(err.join("\n")).toMatch(/does not appear to be gitignored/);

    const ignored = tempProject();
    process.chdir(ignored);
    writeFileSync(join(ignored, ".gitignore"), ".env.local\n", "utf8");
    const quiet = collectOutput();
    await runAdminCommand(["pair"], quiet.output, {
      fetch: pairingFetch() as unknown as typeof globalThis.fetch,
      sleep: async () => {},
    });
    expect(quiet.err.join("\n")).not.toMatch(/gitignored/);
  });

  it("exits non-zero with a clear message when the owner declines", async () => {
    const { err, output } = collectOutput();
    const code = await runAdminCommand(["pair"], output, {
      fetch: vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(PAIR_START))
        .mockResolvedValueOnce(jsonResponse({ status: "denied" })) as unknown as typeof globalThis.fetch,
      sleep: async () => {},
    });
    expect(code).toBe(1);
    expect(err.join("\n")).toMatch(/declined in the browser/);
    expect(readAdminToken(dir)).toBeUndefined();
  });

  it("exits non-zero with a clear message when the code expires", async () => {
    const { err, output } = collectOutput();
    const code = await runAdminCommand(["pair"], output, {
      fetch: vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(PAIR_START))
        .mockResolvedValueOnce(jsonResponse({ status: "expired" })) as unknown as typeof globalThis.fetch,
      sleep: async () => {},
    });
    expect(code).toBe(1);
    expect(err.join("\n")).toMatch(/expired before it was approved/);
    expect(readAdminToken(dir)).toBeUndefined();
  });

  it("reports a refused pairing as valid JSON when --json is set", async () => {
    const { out, output } = collectOutput();
    const code = await runAdminCommand(["pair", "--json"], output, {
      fetch: vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(PAIR_START))
        .mockResolvedValueOnce(jsonResponse({ status: "denied" })) as unknown as typeof globalThis.fetch,
      sleep: async () => {},
    });
    expect(code).toBe(1);
    // Both stages are separate JSON documents; the failure is the last one.
    const failure = JSON.parse(out[out.length - 1]!);
    expect(failure).toMatchObject({ ok: false });
    expect(failure.error).toMatch(/declined/);
  });
});

describe("snabbsajt admin tools / run", () => {
  const originalCwd = process.cwd();
  let dir: string;

  beforeEach(() => {
    dir = tempProject();
    process.chdir(dir);
    vi.stubEnv("SNABBSAJT_APP_URL", undefined);
    vi.stubEnv(ADMIN_TOKEN_ENV_VAR, TOKEN);
  });
  afterEach(() => {
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
  });

  function paired() {
    writeFileSync(
      join(dir, ADMIN_PROJECT_FILE),
      JSON.stringify({
        appUrl: "https://example.test",
        apiUrl: "https://example.convex.site",
        siteId: "k17abcdefghijklmnopqrstuvwx",
        scopes: ["site:read", "content:write"],
        pairedAt: new Date().toISOString(),
      }),
      "utf8",
    );
  }

  it("lists tool names with titles, and hits /api/mcp with the right headers", async () => {
    paired();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(rpcResult(1, INITIALIZE_RESULT))
      .mockResolvedValueOnce(
        rpcResult(2, {
          tools: [
            { name: "get_site_overview", title: "Get site overview" },
            { name: "list_pages", description: "List the website's pages. And more." },
          ],
        }),
      );
    const { out, output } = collectOutput();
    const code = await runAdminCommand(["tools"], output, {
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
    });

    expect(code).toBe(0);
    expect(out.join("\n")).toContain("get_site_overview  Get site overview");
    // A tool with no title falls back to the first sentence of its description.
    expect(out.join("\n")).toContain("List the website's pages.");

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("https://example.test/api/mcp");
    const headers = init.headers as Record<string, string>;
    // The transport answers 406 unless BOTH types are accepted.
    expect(headers.Accept).toContain("application/json");
    expect(headers.Accept).toContain("text/event-stream");
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(String(init.body)).method).toBe("initialize");
    expect(
      JSON.parse(String((fetchImpl.mock.calls[1] as [string, RequestInit])[1].body!)).method,
    ).toBe("tools/list");
  });

  it("passes --args through as the tool's arguments and prints the result", async () => {
    paired();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(rpcResult(1, INITIALIZE_RESULT))
      .mockResolvedValueOnce(
        rpcResult(2, {
          content: [{ type: "text", text: "Completed successfully." }],
          structuredContent: { pageCount: 4 },
        }),
      );
    const { out, output } = collectOutput();
    const code = await runAdminCommand(
      ["run", "get_site_overview", "--args", '{"websiteId":"k17abc"}'],
      output,
      { fetch: fetchImpl as unknown as typeof globalThis.fetch },
    );

    expect(code).toBe(0);
    const call = JSON.parse(String((fetchImpl.mock.calls[1] as [string, RequestInit])[1].body!));
    expect(call.method).toBe("tools/call");
    expect(call.params).toEqual({
      name: "get_site_overview",
      arguments: { websiteId: "k17abc" },
    });
    expect(out.join("\n")).toContain('"pageCount": 4');
  });

  it("tells the developer to pair when there is no admin token", async () => {
    // Explicitly absent, not merely un-stubbed: this must fail the same way on a
    // machine that happens to export a real admin token.
    vi.stubEnv(ADMIN_TOKEN_ENV_VAR, undefined);
    const { err, output } = collectOutput();
    const code = await runAdminCommand(["tools"], output, {
      fetch: (() => {
        throw new Error("must not be called");
      }) as unknown as typeof globalThis.fetch,
    });
    expect(code).toBe(1);
    expect(err.join("\n")).toMatch(/snabbsajt admin pair/);
    expect(err.join("\n")).toContain(ADMIN_TOKEN_ENV_VAR);
  });

  it("does not mistake a read-only delivery token for an admin token", async () => {
    vi.stubEnv(ADMIN_TOKEN_ENV_VAR, "sajt_pub_readonly");
    const { err, output } = collectOutput();
    expect(
      await runAdminCommand(["tools"], output, {
        fetch: (() => {
          throw new Error("must not be called");
        }) as unknown as typeof globalThis.fetch,
      }),
    ).toBe(1);
    expect(err.join("\n")).toMatch(/start with sajt_live_/);
    // The rejected value is never echoed back.
    expect(err.join("\n")).not.toContain("sajt_pub_readonly");
  });

  it("says to pair again when the token is rejected", async () => {
    paired();
    const { err, output } = collectOutput();
    const code = await runAdminCommand(["tools"], output, {
      fetch: (async () =>
        jsonResponse({ error: "unauthorized" }, 401)) as unknown as typeof globalThis.fetch,
    });
    expect(code).toBe(1);
    expect(err.join("\n")).toMatch(/revoked or expired/);
    expect(err.join("\n")).toMatch(/snabbsajt admin pair/);
    expect(err.join("\n")).not.toContain(TOKEN);
  });

  it("surfaces a tool that returned isError, and exits non-zero", async () => {
    paired();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(rpcResult(1, INITIALIZE_RESULT))
      .mockResolvedValueOnce(
        rpcResult(2, {
          content: [{ type: "text", text: "This connection cannot publish." }],
          isError: true,
        }),
      );
    const { err, output } = collectOutput();
    const code = await runAdminCommand(["run", "publish_site"], output, {
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
    });
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("This connection cannot publish.");
  });

  it("keeps --json valid on both success and failure", async () => {
    paired();
    const ok = collectOutput();
    await runAdminCommand(["tools", "--json"], ok.output, {
      fetch: vi
        .fn()
        .mockResolvedValueOnce(rpcResult(1, INITIALIZE_RESULT))
        .mockResolvedValueOnce(
          rpcResult(2, { tools: [{ name: "list_pages", title: "List pages" }] }),
        ) as unknown as typeof globalThis.fetch,
    });
    expect(JSON.parse(ok.out.join("\n"))).toMatchObject({
      ok: true,
      command: "admin tools",
      endpoint: "https://example.test/api/mcp",
      tools: [{ name: "list_pages", title: "List pages" }],
    });
    expect(ok.all()).not.toContain(TOKEN);

    const bad = collectOutput();
    const code = await runAdminCommand(["run", "publish_site", "--json"], bad.output, {
      fetch: vi
        .fn()
        .mockResolvedValueOnce(rpcResult(1, INITIALIZE_RESULT))
        .mockResolvedValueOnce(
          rpcResult(2, {
            content: [{ type: "text", text: "This connection cannot publish." }],
            isError: true,
          }),
        ) as unknown as typeof globalThis.fetch,
    });
    expect(code).toBe(1);
    expect(JSON.parse(bad.out.join("\n"))).toMatchObject({
      ok: false,
      command: "admin run",
      tool: "publish_site",
      error: "This connection cannot publish.",
    });
    expect(bad.all()).not.toContain(TOKEN);
  });

  it("reports a transport failure as valid JSON too", async () => {
    paired();
    const { out, output } = collectOutput();
    const code = await runAdminCommand(["tools", "--json"], output, {
      fetch: (async () =>
        jsonResponse({ error: "unauthorized" }, 401)) as unknown as typeof globalThis.fetch,
    });
    expect(code).toBe(1);
    expect(JSON.parse(out.join("\n"))).toMatchObject({ ok: false });
  });

  it("refuses a non-https app URL rather than sending the token to it", async () => {
    paired();
    const { err, output } = collectOutput();
    expect(
      await runAdminCommand(["tools", "--app-url", "http://example.test"], output, {
        fetch: (() => {
          throw new Error("must not be called");
        }) as unknown as typeof globalThis.fetch,
      }),
    ).toBe(1);
    expect(err.join("\n")).toMatch(/must use https/);
  });

  it("rejects --args that is not a JSON object", async () => {
    paired();
    const { err, output } = collectOutput();
    expect(
      await runAdminCommand(["run", "list_pages", "--args", "[1,2]"], output, {
        fetch: (() => {
          throw new Error("must not be called");
        }) as unknown as typeof globalThis.fetch,
      }),
    ).toBe(1);
    expect(err.join("\n")).toMatch(/must be a JSON object/);
  });

  it("needs a tool name for run", async () => {
    paired();
    const { err, output } = collectOutput();
    expect(await runAdminCommand(["run"], output)).toBe(1);
    expect(err.join("\n")).toMatch(/needs a tool name/);
  });
});

describe("the SSE/JSON response parser", () => {
  it("reads a JSON-RPC message out of an SSE stream, skipping a priming event", () => {
    const body = `id: 1\nretry: 3000\ndata: \n\nevent: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n`;
    expect(parseRpcMessage(body)).toMatchObject({ result: { ok: true } });
  });

  it("reads a plain JSON body too, because the server may enable that mode", () => {
    expect(parseRpcMessage('{"jsonrpc":"2.0","id":1,"result":{"ok":true}}')).toMatchObject({
      result: { ok: true },
    });
  });

  it("returns undefined for a body with no JSON-RPC message in it", () => {
    expect(parseRpcMessage("Internal Server Error")).toBeUndefined();
    expect(parseRpcMessage("")).toBeUndefined();
  });
});

describe("admin help", () => {
  it("documents the three commands and that site stays keyless", () => {
    const result = spawnSync("bun", [sourceCli, "admin", "--help"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("snabbsajt admin pair");
    expect(result.stdout).toContain("snabbsajt admin tools");
    expect(result.stdout).toContain("snabbsajt admin run <tool>");
    expect(result.stdout).toContain("stays local-first and keyless");
    expect(result.stdout).toContain("site:read,content:write");
    // The claim the docs make, made here too: a paired terminal cannot publish
    // or email a customer unattended.
    expect(result.stdout).toContain("approve them in\nthe browser at the moment they happen");
  });

  it("rejects an unknown admin subcommand with a non-zero exit", () => {
    const result = spawnSync("bun", [sourceCli, "admin", "deploy"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unknown admin command "deploy"');
  });
});
