import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runLinkCommand } from "../src/commands/link";
import {
  findAncestorProjectConfig,
  readDeliveryToken,
  readProjectConfig,
  removeEnvVar,
  removeProjectConfig,
  writeDeliveryToken,
  writeProjectConfig,
} from "../src/commands/connect/project";
import { relativeTime } from "../src/prompt";

function tempProject(): string {
  return mkdtempSync(join(tmpdir(), "snabbsajt-link-"));
}

/** Collect what a command printed, split by stream, with no ANSI stripping —
 *  the point of several of these tests is that there is nothing to strip. */
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

const TOKEN = `sajt_pub_${"a".repeat(43)}`;
const DEVICE = `sajt_pub_${"b".repeat(43)}`;

/** A fetch that answers the three link routes from a script. */
function linkFetch(script: {
  poll: unknown;
  select?: unknown;
  selectStatus?: number;
}): typeof globalThis.fetch {
  return (async (url: string | URL) => {
    const href = typeof url === "string" ? url : url.toString();
    if (href.endsWith("/v1/cli/link/start")) {
      return new Response(
        JSON.stringify({
          deviceCode: DEVICE,
          userCode: "WXYZ-1234",
          verificationUrl: "https://snabbsajt.com/dashboard/connect",
          expiresIn: 600,
          interval: 1,
        }),
        { status: 200 },
      );
    }
    if (href.endsWith("/v1/cli/link/poll")) {
      return new Response(JSON.stringify(script.poll), { status: 200 });
    }
    if (href.endsWith("/v1/cli/link/select")) {
      return new Response(JSON.stringify(script.select ?? { ok: false, reason: "not_approved" }), {
        status: script.selectStatus ?? 200,
      });
    }
    if (href.endsWith("/v1/cli/tokens/revoke")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${href}`);
  }) as unknown as typeof globalThis.fetch;
}

const TWO_SITES = {
  status: "approved",
  approvedBy: "ludvig@example.com",
  sharedNotOwnedCount: 0,
  truncated: false,
  sites: [
    {
      siteId: "site_a",
      name: "Acme AB",
      slug: "acme",
      workspaceName: "Acme AB",
      lastPublishedAt: null,
    },
    {
      siteId: "site_b",
      name: "Kampanj",
      slug: "kampanj",
      workspaceName: "Acme AB",
      lastPublishedAt: null,
    },
  ],
};

describe("link", () => {
  let dir: string;
  let previousCwd: string;

  beforeEach(() => {
    previousCwd = process.cwd();
    dir = tempProject();
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(previousCwd);
    vi.restoreAllMocks();
  });

  it("writes both files and never prints the token", async () => {
    const cap = capture();
    const code = await runLinkCommand(["link", "--site", "acme"], cap.output, {
      apiUrl: "https://example.convex.site",
      fetch: linkFetch({
        poll: TWO_SITES,
        select: { ok: true, token: TOKEN, siteName: "Acme AB", slug: "acme" },
      }),
      sleep: async () => {},
      version: "0.4.0",
    });

    expect(code).toBe(0);
    expect(readProjectConfig(dir)?.siteId).toBe("site_a");
    expect(readDeliveryToken(dir)).toBe(TOKEN);
    // The credential must never reach the terminal, where it lands in
    // scrollback, in a screenshot and in an agent transcript.
    expect(cap.stdoutText()).not.toContain(TOKEN);
    expect(cap.stderrText()).not.toContain(TOKEN);
  });

  it("--json is ambiguous-safe: no prompt, an exit code and a stable `code`", async () => {
    const cap = capture();
    const code = await runLinkCommand(["link", "--json"], cap.output, {
      apiUrl: "https://example.convex.site",
      fetch: linkFetch({ poll: TWO_SITES }),
      sleep: async () => {},
    });

    expect(code).toBe(1);
    const lines = cap.stdoutText().split("\n{").length;
    expect(lines).toBeGreaterThan(0);
    const last = JSON.parse(cap.out[cap.out.length - 1]!) as { ok: boolean; code: string };
    expect(last.ok).toBe(false);
    // Agents branch on `code`, never on the prose.
    expect(last.code).toBe("ambiguous_site");
    expect(existsSync(join(dir, ".snabbsajt.json"))).toBe(false);
  });

  it("emits no ANSI escape bytes under --json", async () => {
    const cap = capture();
    await runLinkCommand(["link", "--json"], cap.output, {
      apiUrl: "https://example.convex.site",
      fetch: linkFetch({ poll: TWO_SITES }),
      sleep: async () => {},
    });
    // The 0.3.0 changelog records a real bug where a colouring writer broke
    // --json for its only audience. Assert the absence of escapes, not the
    // presence of parseable output, so a future colour helper cannot sneak in.
    // eslint-disable-next-line no-control-regex
    expect(cap.stdoutText()).not.toMatch(/\u001b\[/);
    // eslint-disable-next-line no-control-regex
    expect(cap.stderrText()).not.toMatch(/\u001b\[/);
  });

  it("a single site with --yes needs no picker", async () => {
    const cap = capture();
    const code = await runLinkCommand(["link", "--yes"], cap.output, {
      apiUrl: "https://example.convex.site",
      fetch: linkFetch({
        poll: { ...TWO_SITES, sites: [TWO_SITES.sites[0]] },
        select: { ok: true, token: TOKEN, siteName: "Acme AB", slug: "acme" },
      }),
      sleep: async () => {},
    });
    expect(code).toBe(0);
    expect(readProjectConfig(dir)?.slug).toBe("acme");
  });

  it("owning nothing while sharing something says who to ask, not 'create a site'", async () => {
    const cap = capture();
    const code = await runLinkCommand(["link", "--json"], cap.output, {
      apiUrl: "https://example.convex.site",
      fetch: linkFetch({
        poll: { status: "approved", approvedBy: null, sites: [], sharedNotOwnedCount: 3, truncated: false },
      }),
      sleep: async () => {},
    });
    expect(code).toBe(1);
    const last = JSON.parse(cap.out[cap.out.length - 1]!) as { code: string; error: string };
    expect(last.code).toBe("no_sites");
    expect(last.error).toContain("owner");
    expect(last.error).not.toContain("Create one");
  });

  it("owning nothing and sharing nothing points at /create", async () => {
    const cap = capture();
    await runLinkCommand(["link", "--json"], cap.output, {
      apiUrl: "https://example.convex.site",
      fetch: linkFetch({
        poll: { status: "approved", approvedBy: null, sites: [], sharedNotOwnedCount: 0, truncated: false },
      }),
      sleep: async () => {},
    });
    const last = JSON.parse(cap.out[cap.out.length - 1]!) as { error: string };
    expect(last.error).toContain("snabbsajt.com/create");
  });

  it("a refused select is reported with its own code and writes nothing", async () => {
    const cap = capture();
    const code = await runLinkCommand(["link", "--site", "acme", "--json"], cap.output, {
      apiUrl: "https://example.convex.site",
      fetch: linkFetch({
        poll: TWO_SITES,
        select: { ok: false, reason: "token_limit" },
        selectStatus: 400,
      }),
      sleep: async () => {},
    });
    expect(code).toBe(1);
    const last = JSON.parse(cap.out[cap.out.length - 1]!) as { code: string };
    expect(last.code).toBe("token_limit");
    expect(existsSync(join(dir, ".snabbsajt.json"))).toBe(false);
    expect(readDeliveryToken(dir)).toBeUndefined();
  });

  it("a denied approval never writes", async () => {
    const cap = capture();
    const code = await runLinkCommand(["link", "--site", "acme", "--json"], cap.output, {
      apiUrl: "https://example.convex.site",
      fetch: linkFetch({ poll: { status: "denied" } }),
      sleep: async () => {},
    });
    expect(code).toBe(1);
    expect(JSON.parse(cap.out[cap.out.length - 1]!).code).toBe("denied");
    expect(existsSync(join(dir, ".snabbsajt.json"))).toBe(false);
  });

  it("--status writes nothing and reports both states", async () => {
    const unlinked = capture();
    expect(await runLinkCommand(["link", "--status"], unlinked.output, {})).toBe(1);
    expect(existsSync(join(dir, ".snabbsajt.json"))).toBe(false);

    writeProjectConfig(dir, {
      siteId: "site_a",
      apiUrl: "https://example.convex.site",
      siteName: "Acme AB",
    });
    const linked = capture();
    expect(await runLinkCommand(["link", "--status"], linked.output, {})).toBe(0);
    expect(linked.stdoutText()).toContain("Acme AB");
    // A config without its token is a real state (a fresh clone), and it must
    // read as an instruction rather than as success.
    expect(linked.stdoutText()).toContain("MISSING");
  });

  it("an already-linked directory is a no-op without a TTY", async () => {
    writeProjectConfig(dir, {
      siteId: "site_a",
      apiUrl: "https://example.convex.site",
      siteName: "Acme AB",
    });
    const cap = capture();
    const code = await runLinkCommand(["link"], cap.output, {
      apiUrl: "https://example.convex.site",
      // No fetch: reaching the network here would itself be the failure.
      fetch: (async () => {
        throw new Error("should not pair");
      }) as unknown as typeof globalThis.fetch,
    });
    expect(code).toBe(0);
    expect(cap.stdoutText()).toContain("Already linked");
  });
});

describe("unlink", () => {
  let dir: string;
  let previousCwd: string;

  beforeEach(() => {
    previousCwd = process.cwd();
    dir = tempProject();
    process.chdir(dir);
  });
  afterEach(() => process.chdir(previousCwd));

  it("revokes the token, then removes both files", async () => {
    writeProjectConfig(dir, { siteId: "site_a", apiUrl: "https://example.convex.site" });
    writeFileSync(join(dir, ".env.local"), `OTHER=keepme\nSNABBSAJT_DELIVERY_TOKEN=${TOKEN}\n`);

    const seen: string[] = [];
    const cap = capture();
    const code = await runLinkCommand(["unlink", "--json"], cap.output, {
      fetch: (async (url: string) => {
        seen.push(url);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }) as unknown as typeof globalThis.fetch,
    });

    expect(code).toBe(0);
    expect(seen.some((u) => u.endsWith("/v1/cli/tokens/revoke"))).toBe(true);
    expect(existsSync(join(dir, ".snabbsajt.json"))).toBe(false);
    // Only OUR line goes. Rewriting .env.local wholesale would take the
    // developer's other secrets with it.
    expect(readFileSync(join(dir, ".env.local"), "utf8")).toBe("OTHER=keepme\n");
  });

  it("still removes local state when the revoke call fails", async () => {
    writeProjectConfig(dir, { siteId: "site_a", apiUrl: "https://example.convex.site" });
    writeDeliveryToken(dir, TOKEN);
    const cap = capture();
    const code = await runLinkCommand(["unlink"], cap.output, {
      fetch: (async () => {
        throw new Error("offline");
      }) as unknown as typeof globalThis.fetch,
    });
    expect(code).toBe(0);
    expect(existsSync(join(dir, ".snabbsajt.json"))).toBe(false);
    // And says so, rather than implying the key is dead.
    expect(cap.stdoutText()).toContain("may still be active");
  });

  it("nothing to unlink is an error, not a silent success", async () => {
    const cap = capture();
    expect(await runLinkCommand(["unlink", "--json"], cap.output, {})).toBe(1);
    expect(JSON.parse(cap.out[cap.out.length - 1]!).code).toBe("no_link");
  });
});

describe("project file helpers", () => {
  it("removeEnvVar leaves other lines and reports whether it did anything", () => {
    const dir = tempProject();
    writeFileSync(join(dir, ".env.local"), "A=1\nSNABBSAJT_DELIVERY_TOKEN=x\nB=2\n");
    expect(removeEnvVar(dir, "SNABBSAJT_DELIVERY_TOKEN")).toBe(true);
    expect(readFileSync(join(dir, ".env.local"), "utf8")).toBe("A=1\nB=2\n");
    expect(removeEnvVar(dir, "SNABBSAJT_DELIVERY_TOKEN")).toBe(false);
  });

  it("removeProjectConfig is idempotent", () => {
    const dir = tempProject();
    writeProjectConfig(dir, { siteId: "s", apiUrl: "https://example.convex.site" });
    expect(removeProjectConfig(dir)).toBe(true);
    expect(removeProjectConfig(dir)).toBe(false);
  });

  it("findAncestorProjectConfig stops at a repo boundary", () => {
    const root = tempProject();
    const nested = join(root, "apps", "web");
    mkdirSync(nested, { recursive: true });
    writeProjectConfig(root, { siteId: "s", apiUrl: "https://example.convex.site" });
    expect(findAncestorProjectConfig(nested)).toBe(root);

    // A `.git` between them means the outer config belongs to a different repo,
    // and mentioning it would be noise at best and wrong at worst.
    mkdirSync(join(root, "apps", ".git"), { recursive: true });
    expect(findAncestorProjectConfig(nested)).toBeUndefined();
  });
});

describe("relativeTime", () => {
  const now = Date.UTC(2026, 7, 7, 12, 0, 0);
  it("says what the picker needs and nothing more", () => {
    expect(relativeTime(null, now)).toBe("never published");
    expect(relativeTime(now - 10_000, now)).toBe("published just now");
    expect(relativeTime(now - 2 * 24 * 3600_000, now)).toBe("published 2 days ago");
    expect(relativeTime(now - 3600_000, now)).toBe("published 1 hour ago");
  });
});
