import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStarterSite } from "@snabbsajt/site-kit";
import { runPushCommand } from "../src/commands/push";
import { ADMIN_TOKEN_ENV_VAR } from "../src/commands/admin/adminProject";

// Every test stubs `fetch`. `push` carries a live write credential to a live
// endpoint; a test that quietly talks to production is worse than no test.

const TOKEN = "sajt_live_deadbeefcafe";
const SITE_ID = "k17abcdefghijklmnopqrstuvwx";

beforeEach(() => {
  vi.stubGlobal("fetch", () => {
    throw new Error("a test tried to use the real fetch");
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

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

function sseResponse(body: unknown, status = 200): Response {
  return new Response(`event: message\ndata: ${JSON.stringify(body)}\n\n`, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

const INITIALIZE_RESULT = {
  protocolVersion: "2025-06-18",
  capabilities: { tools: {} },
  serverInfo: { name: "snabbsajt", version: "1.0.0" },
};

const MERGE_DATA = {
  websiteId: SITE_ID,
  editorUrl: `https://example.test/dashboard/websites/${SITE_ID}/editor`,
  mode: "merge",
  pagesImported: 1,
  assetsSkipped: 0,
  merge: {
    pagesAdded: [],
    pagesMatched: ["/"],
    sections: [
      { externalKey: "hero-1", type: "hero", action: "updated" },
      { externalKey: "about-1", type: "textMedia", action: "added" },
      {
        externalKey: "faq-1",
        type: "faq",
        action: "conflict",
        conflictPreview: {
          theirs: ["Vi har oppet till 18 pa fredagar"],
          ours: ["Vi har oppet till 17"],
        },
      },
    ],
    restorePointId: "rp1",
  },
};

function toolResult(id: number, data: unknown): Response {
  return sseResponse({
    jsonrpc: "2.0",
    id,
    result: {
      content: [{ type: "text", text: "Completed successfully." }],
      structuredContent: data,
    },
  });
}

/** initialize, then tools/call. */
function pushFetch(callResponse: Response) {
  return vi
    .fn()
    .mockResolvedValueOnce(sseResponse({ jsonrpc: "2.0", id: 1, result: INITIALIZE_RESULT }))
    .mockResolvedValueOnce(callResponse);
}

/** A paired project directory holding a valid starter package under pkg/. */
function pairedProject(): { dir: string; pkg: string } {
  const dir = mkdtempSync(join(tmpdir(), "snabbsajt-push-"));
  writeFileSync(join(dir, ".env.local"), `${ADMIN_TOKEN_ENV_VAR}=${TOKEN}\n`);
  writeFileSync(
    join(dir, ".snabbsajt-admin.json"),
    JSON.stringify({
      appUrl: "https://example.test",
      apiUrl: "https://example.convex.site",
      siteId: SITE_ID,
      scopes: ["site:read", "content:write"],
      pairedAt: "2026-08-12T00:00:00.000Z",
    }),
  );
  const pkg = join(dir, "pkg");
  mkdirSync(join(pkg, "assets"), { recursive: true });
  mkdirSync(join(pkg, "fonts"), { recursive: true });
  writeFileSync(join(pkg, "site.json"), JSON.stringify(createStarterSite("html")));
  return { dir, pkg };
}

async function callBody(fetchImpl: ReturnType<typeof vi.fn>, callIndex: number) {
  const init = fetchImpl.mock.calls[callIndex]![1] as RequestInit;
  return JSON.parse(String(init.body)) as {
    method: string;
    params: { name?: string; arguments?: Record<string, unknown> };
  };
}

describe("snabbsajt push", () => {
  const originalCwd = process.cwd();
  let project: { dir: string; pkg: string };

  beforeEach(() => {
    project = pairedProject();
    process.chdir(project.dir);
    vi.stubEnv("SNABBSAJT_APP_URL", undefined);
    vi.stubEnv(ADMIN_TOKEN_ENV_VAR, undefined);
    vi.stubEnv("SNABBSAJT_DELIVERY_TOKEN", undefined);
  });
  afterEach(() => {
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
  });

  it("validates, calls import_site with the paired site, and prints the merge report", async () => {
    const { out, all, output } = collectOutput();
    const fetchImpl = pushFetch(toolResult(2, MERGE_DATA));

    const code = await runPushCommand(["pkg"], output, {
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
    });

    expect(code).toBe(0);
    // The request went to the paired app origin's MCP endpoint with the token.
    expect(String((fetchImpl.mock.calls[1] as unknown[])[0])).toBe(
      "https://example.test/api/mcp",
    );
    const headers = (fetchImpl.mock.calls[1]![1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    const body = await callBody(fetchImpl, 1);
    expect(body.method).toBe("tools/call");
    expect(body.params.name).toBe("import_site");
    expect(body.params.arguments?.mergeIntoWebsiteId).toBe(SITE_ID);
    expect(body.params.arguments?.site).toMatchObject({ version: expect.anything() });
    expect(body.params.arguments?.dryRun).toBeUndefined();
    expect(body.params.arguments?.forceKeys).toBeUndefined();
    // The report is honest: every action bucket plus the conflict by name.
    expect(all()).toContain("1 added, 1 updated, 0 unchanged, 1 conflict(s)");
    expect(all()).toContain("faq-1");
    expect(all()).toContain("--force-key");
    expect(out.join("\n")).toContain(`Pushed to ${SITE_ID}.`);
    expect(all()).not.toContain(TOKEN);
  });

  it("--create makes a new website instead of merging into the paired one", async () => {
    // `snabbsajt init` printed `snabbsajt push . --create` as step 3 and the
    // parser threw on it, so the one-command story ended at the third command.
    // `import_site` has always read a missing merge target as "create"; this is
    // the CLI learning the word.
    const { out, all, output } = collectOutput();
    const created = "kd7newsite000000000000000000000";
    const fetchImpl = pushFetch(
      toolResult(2, {
        websiteId: created,
        editorUrl: `https://example.test/dashboard/websites/${created}/editor`,
        mode: "create",
        pagesImported: 1,
        assetsSkipped: 0,
      }),
    );

    const code = await runPushCommand(["pkg", "--create"], output, {
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
    });

    expect(code).toBe(0);
    const body = await callBody(fetchImpl, 1);
    expect(body.params.name).toBe("import_site");
    // The paired site is deliberately ignored: --create makes a SECOND site
    // from the same repository, and sending the pairing would merge into the
    // first one instead.
    expect(body.params.arguments?.mergeIntoWebsiteId).toBeUndefined();
    expect(out.join("\n")).toContain(`Created ${created}`);
    expect(all()).toContain("1 imported");
    // No merge counts: nothing was matched, so "0 conflicts" would be a claim
    // about a website that had nothing to conflict with.
    expect(all()).not.toContain("conflict(s)");
  });

  it("refuses --create beside --site or --dry-run, before anything is sent", async () => {
    const { output } = collectOutput();
    const fetchImpl = pushFetch(toolResult(2, MERGE_DATA));

    expect(
      await runPushCommand(["pkg", "--create", "--site", SITE_ID], output, {
        fetch: fetchImpl as unknown as typeof globalThis.fetch,
      }),
    ).toBe(1);
    expect(
      await runPushCommand(["pkg", "--create", "--dry-run"], output, {
        fetch: fetchImpl as unknown as typeof globalThis.fetch,
      }),
    ).toBe(1);
    // Nothing left the machine either time.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports the branch preview after the import, and only then", async () => {
    // Order is the claim: an address for content that failed to land would put
    // a stale page on the client's card (plan P0-2026-08-19 slice 2.4).
    const { out, output } = collectOutput();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(sseResponse({ jsonrpc: "2.0", id: 1, result: INITIALIZE_RESULT }))
      .mockResolvedValueOnce(toolResult(2, MERGE_DATA))
      .mockResolvedValueOnce(toolResult(3, { branch: "staging", count: 1 }));

    const code = await runPushCommand(
      ["pkg", "--branch", "staging", "--preview-url", "https://acme-git-staging.vercel.app"],
      output,
      { fetch: fetchImpl as unknown as typeof globalThis.fetch },
    );

    expect(code).toBe(0);
    expect((await callBody(fetchImpl, 1)).params.name).toBe("import_site");
    const second = await callBody(fetchImpl, 2);
    expect(second.params.name).toBe("record_branch_preview");
    expect(second.params.arguments?.branch).toBe("staging");
    expect(out.join("\n")).toContain("staging");
  });

  it("does not report a branch preview on a dry run", async () => {
    const { output } = collectOutput();
    const fetchImpl = pushFetch(toolResult(2, { ...MERGE_DATA, preview: true }));

    const code = await runPushCommand(
      [
        "pkg",
        "--dry-run",
        "--branch",
        "staging",
        "--preview-url",
        "https://acme-git-staging.vercel.app",
      ],
      output,
      { fetch: fetchImpl as unknown as typeof globalThis.fetch },
    );

    expect(code).toBe(0);
    expect(fetchImpl.mock.calls.length).toBe(2);
  });

  it("refuses half a pair", async () => {
    const { err, output } = collectOutput();
    const code = await runPushCommand(["pkg", "--branch", "staging"], output, {
      fetch: (() => {
        throw new Error("no request should be made");
      }) as unknown as typeof globalThis.fetch,
    });
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("--preview-url");
  });

  it("passes --dry-run and --force-key through, and marks the preview", async () => {
    const { all, output } = collectOutput();
    const fetchImpl = pushFetch(toolResult(2, { ...MERGE_DATA, preview: true }));

    const code = await runPushCommand(
      ["pkg", "--dry-run", "--force-key", "faq-1", "--force-key", "hero-1"],
      output,
      { fetch: fetchImpl as unknown as typeof globalThis.fetch },
    );

    expect(code).toBe(0);
    const body = await callBody(fetchImpl, 1);
    expect(body.params.arguments?.dryRun).toBe(true);
    expect(body.params.arguments?.forceKeys).toEqual(["faq-1", "hero-1"]);
    expect(all()).toContain("DRY RUN");
  });

  it("refuses to send an invalid package and never touches the network", async () => {
    const { all, output } = collectOutput();
    writeFileSync(join(project.pkg, "site.json"), JSON.stringify({ not: "a site" }));
    const fetchImpl = vi.fn();

    const code = await runPushCommand(["pkg"], output, {
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
    });

    expect(code).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(all()).toContain("nothing was sent");
  });

  it("names SNABBSAJT_ADMIN_TOKEN when no token is present", async () => {
    const { all, output } = collectOutput();
    writeFileSync(join(project.dir, ".env.local"), "");
    const fetchImpl = vi.fn();

    const code = await runPushCommand(["pkg"], output, {
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
    });

    expect(code).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(all()).toContain(ADMIN_TOKEN_ENV_VAR);
    expect(all()).toContain("admin pair");
  });

  it("rejects a read-only delivery token with its own message", async () => {
    const { all, output } = collectOutput();
    writeFileSync(
      join(project.dir, ".env.local"),
      `${ADMIN_TOKEN_ENV_VAR}=sajt_pub_readonly123\n`,
    );
    const fetchImpl = vi.fn();

    const code = await runPushCommand(["pkg"], output, {
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
    });

    expect(code).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(all()).toContain("read-only");
    expect(all()).toContain("admin pair");
  });

  it("surfaces a tool-layer error and exits non-zero", async () => {
    const { all, output } = collectOutput();
    const fetchImpl = pushFetch(
      sseResponse({
        jsonrpc: "2.0",
        id: 2,
        result: {
          content: [{ type: "text", text: "Import failed: IMPORT_TOO_LARGE" }],
          isError: true,
        },
      }),
    );

    const code = await runPushCommand(["pkg"], output, {
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
    });

    expect(code).toBe(1);
    expect(all()).toContain("IMPORT_TOO_LARGE");
  });

  it("--site overrides the paired site id, and --json reports the counts", async () => {
    const { out, output } = collectOutput();
    const fetchImpl = pushFetch(toolResult(2, MERGE_DATA));

    const code = await runPushCommand(["pkg", "--site", "other-site-id", "--json"], output, {
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
    });

    expect(code).toBe(0);
    const body = await callBody(fetchImpl, 1);
    expect(body.params.arguments?.mergeIntoWebsiteId).toBe("other-site-id");
    const parsed = JSON.parse(out.join("\n")) as {
      ok: boolean;
      siteId: string;
      sectionCounts: Record<string, number>;
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.siteId).toBe("other-site-id");
    expect(parsed.sectionCounts).toEqual({ updated: 1, added: 1, conflict: 1 });
  });

  it("prints what each side says under the conflicted section", async () => {
    const { all, output } = collectOutput();
    const fetchImpl = pushFetch(toolResult(2, MERGE_DATA));

    await runPushCommand(["pkg"], output, {
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
    });

    // The point of the whole feature: the builder can read the client's words
    // without opening the editor, and tell them apart from their own.
    expect(all()).toContain("in the app:  Vi har oppet till 18 pa fredagar");
    expect(all()).toContain("your push:   Vi har oppet till 17");
  });

  it("says so when the edit was not in the text", async () => {
    const { all, output } = collectOutput();
    const fetchImpl = pushFetch(
      toolResult(2, {
        ...MERGE_DATA,
        merge: {
          ...MERGE_DATA.merge,
          sections: [
            {
              externalKey: "faq-1",
              type: "faq",
              action: "conflict",
              conflictPreview: { theirs: [], ours: [] },
            },
          ],
        },
      }),
    );

    await runPushCommand(["pkg"], output, {
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
    });

    expect(all()).toContain("(the change is not in the text)");
  });

  it("prints nothing extra when the server did not send a preview", async () => {
    // The CLI is installed independently of the deployment it talks to. An
    // older server omits the field entirely, and the difference between "no
    // preview" and "no text changed" must stay visible.
    const { all, output } = collectOutput();
    const fetchImpl = pushFetch(
      toolResult(2, {
        ...MERGE_DATA,
        merge: {
          ...MERGE_DATA.merge,
          sections: [{ externalKey: "faq-1", type: "faq", action: "conflict" }],
        },
      }),
    );

    await runPushCommand(["pkg"], output, {
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
    });

    expect(all()).toContain("faq-1");
    expect(all()).not.toContain("in the app:");
    expect(all()).not.toContain("(the change is not in the text)");
  });
});
