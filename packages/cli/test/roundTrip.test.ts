/** The round trip the plan names: push, the client edits, pull, push again is a
 *  no-op (P0-2026-08-19 slice 2.5).
 *
 *  This is the property the whole agency programme rests on. The agency owns
 *  the repository, the client owns the editor, and both write to the same
 *  hemsida — so if a pull-then-push loses or reshuffles anything, the agency's
 *  next deploy silently deletes the page their client made, and neither of them
 *  finds out until a visitor does.
 *
 *  Writing it found that step four was impossible: `pull --format portable`
 *  writes a site file with an empty `pages` array beside a `pages/` folder, and
 *  nothing reassembled them, so pushing that directory would have sent a site
 *  with NO pages. `portableFromFiles` is that missing half, and this is the
 *  test that would have caught its absence.
 *
 *  The server's own merge is not simulated here — it is the server's claim, and
 *  `convex/portability` owns it. What is proved here is the CLI's half: what
 *  comes back out of the repository is exactly what went into it.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStarterSite, validateSitePackage } from "@snabbsajt/site-kit";
import { runPushCommand } from "../src/commands/push";
import { runPortablePull, portableFromFiles } from "../src/commands/pullPortable";
import { ADMIN_TOKEN_ENV_VAR } from "../src/commands/admin/adminProject";
import type { Output } from "../src/output";

const TOKEN = "sajt_live_deadbeefcafe";
const SITE_ID = "k17abcdefghijklmnopqrstuvwx";

function capture(): Output & { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, stdout: (m) => out.push(m), stderr: (m) => err.push(m) };
}

function sseResponse(body: unknown): Response {
  return new Response(`event: message\ndata: ${JSON.stringify(body)}\n\n`, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

/** initialize, then the tools/call answer. */
function pushFetch() {
  return vi
    .fn()
    .mockResolvedValueOnce(
      sseResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "snabbsajt", version: "1.0.0" },
        },
      }),
    )
    .mockResolvedValueOnce(
      sseResponse({
        jsonrpc: "2.0",
        id: 2,
        result: {
          content: [{ type: "text", text: "Completed successfully." }],
          structuredContent: {
            websiteId: SITE_ID,
            editorUrl: `https://example.test/dashboard/websites/${SITE_ID}/editor`,
            mode: "merge",
            pagesImported: 1,
            assetsSkipped: 0,
            merge: { pagesAdded: [], pagesMatched: ["/"], sections: [], restorePointId: "rp1" },
          },
        },
      }),
    );
}

/** What `import_site` was actually sent. */
function sitePushed(fetchImpl: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const init = fetchImpl.mock.calls[1]![1] as RequestInit;
  const body = JSON.parse(String(init.body)) as {
    params: { arguments: { site: Record<string, unknown> } };
  };
  return body.params.arguments.site;
}

function pairedProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "snabbsajt-roundtrip-"));
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
  mkdirSync(join(dir, "pkg"), { recursive: true });
  writeFileSync(join(dir, "pkg", "site.json"), JSON.stringify(createStarterSite("html")));
  return dir;
}

describe("push, edit, pull, push again", () => {
  const originalCwd = process.cwd();
  let dir: string;

  beforeEach(() => {
    dir = pairedProject();
    process.chdir(dir);
    vi.stubGlobal("fetch", () => {
      throw new Error("a test tried to use the real fetch");
    });
    vi.stubEnv("SNABBSAJT_APP_URL", undefined);
  });
  afterEach(() => {
    process.chdir(originalCwd);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("carries the client's own page back into the repository and pushes it unchanged", async () => {
    // 1. The agency pushes what its repository holds.
    const first = pushFetch();
    expect(
      await runPushCommand(["pkg"], capture(), {
        fetch: first as unknown as typeof globalThis.fetch,
      }),
    ).toBe(0);
    const pushed = sitePushed(first);
    expect((pushed.pages as unknown[]).length).toBe(1);

    // 2. The client adds a page in the editor. The server's export is what the
    //    agency sent plus that page — which is exactly what the round trip has
    //    to survive.
    const clientPage = {
      tmpId: "priser",
      slug: "priser",
      title: "Priser",
      order: 1,
      showInNav: true,
    };
    const exported = { ...pushed, pages: [...(pushed.pages as unknown[]), clientPage] };

    // 3. The agency pulls it.
    const pullOutput = capture();
    expect(
      await runPortablePull(["--site", SITE_ID, "--json"], true, pullOutput, {
        cwd: dir,
        client: {
          endpoint: "test",
          listTools: async () => [],
          callTool: async () => ({ isError: false, text: "", data: { site: exported } }),
        },
      }),
    ).toBe(0);
    expect(JSON.parse(pullOutput.out.at(-1)!).pages).toBe(2);

    // 4. …and pushes again. Nothing about the site changed on the way through
    //    the repository, so the second push carries the export byte for byte.
    const second = pushFetch();
    expect(
      await runPushCommand(["snabbsajt/content"], capture(), {
        fetch: second as unknown as typeof globalThis.fetch,
      }),
    ).toBe(0);
    expect(sitePushed(second)).toEqual(exported);
  });

  it("orders the reassembled pages by the site's own order, not by file name", () => {
    // `index.json` sorts before `priser.json`, and `a-page.json` before both.
    // If the directory listing decided the nav order, a client's page would
    // move every time a colleague pulled on a different machine.
    const dir2 = mkdtempSync(join(tmpdir(), "snabbsajt-order-"));
    mkdirSync(join(dir2, "pages"), { recursive: true });
    writeFileSync(join(dir2, "site.json"), JSON.stringify({ format: "sajt-site", pages: [] }));
    writeFileSync(
      join(dir2, "pages", "index.json"),
      JSON.stringify({ tmpId: "home", slug: "", title: "Hem", order: 2 }),
    );
    writeFileSync(
      join(dir2, "pages", "a-page.json"),
      JSON.stringify({ tmpId: "a", slug: "a-page", title: "A", order: 0 }),
    );

    const site = portableFromFiles(dir2)!;
    expect((site.pages as { slug: string }[]).map((page) => page.slug)).toEqual(["a-page", ""]);
  });

  it("leaves an ordinary package alone", () => {
    // A package whose site file already carries its pages is not a pulled
    // directory, even if it happens to have a `pages/` folder beside it.
    const dir3 = mkdtempSync(join(tmpdir(), "snabbsajt-plain-"));
    mkdirSync(join(dir3, "pages"), { recursive: true });
    writeFileSync(join(dir3, "site.json"), JSON.stringify(createStarterSite("html")));
    expect(portableFromFiles(dir3)).toBeNull();
  });

  it("reassembles into something the validator still accepts", () => {
    const starter = createStarterSite("html");
    const dir4 = mkdtempSync(join(tmpdir(), "snabbsajt-valid-"));
    mkdirSync(join(dir4, "pages"), { recursive: true });
    writeFileSync(join(dir4, "site.json"), JSON.stringify({ ...starter, pages: [] }));
    for (const page of starter.pages) {
      writeFileSync(join(dir4, "pages", `${page.slug || "index"}.json`), JSON.stringify(page));
    }
    expect(validateSitePackage(portableFromFiles(dir4)).ok).toBe(true);
  });
});
