/** The route that receives "a publish happened" from SnabbSajt.
 *
 *  Why this file exists: `convex/agencyPreview.ts:revalidateThenDeploy` has
 *  POSTed to `/api/snabbsajt/revalidate` since slice 2.4, and nothing in Site
 *  Kit answered it. Every publish 404'd onto the deploy hook, which is the slow
 *  and paid path. The handler is framework-free so the test can drive it with a
 *  plain `Request`.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createRevalidateHandler,
  snabbsajtSiteTag,
  SNABBSAJT_CACHE_TAG,
} from "../src/lib/delivery/revalidate";

/** Exactly the body `revalidateThenDeploy` sends. If this literal ever stops
 *  matching the caller, the fast path is dead again and this test is the place
 *  that says so. */
const PUBLISH_BODY = { source: "snabbsajt", event: "publish" };

function post(body: unknown, method = "POST"): Request {
  return new Request("https://agency.example/api/snabbsajt/revalidate", {
    method,
    headers: { "content-type": "application/json" },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}

describe("createRevalidateHandler", () => {
  it("drops the shared tag on the publish SnabbSajt actually sends", async () => {
    const revalidateTag = vi.fn();
    const res = await createRevalidateHandler({ revalidateTag })(post(PUBLISH_BODY));

    expect(res.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith(SNABBSAJT_CACHE_TAG);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      revalidated: { tags: [SNABBSAJT_CACHE_TAG], paths: [] },
    });
  });

  it("drops every configured tag and path", async () => {
    const revalidateTag = vi.fn();
    const revalidatePath = vi.fn();
    const tags = [snabbsajtSiteTag("k17site"), "menu"];
    const res = await createRevalidateHandler({
      revalidateTag,
      revalidatePath,
      tags,
      paths: ["/", "/kontakt"],
    })(post(PUBLISH_BODY));

    expect(res.status).toBe(200);
    expect(revalidateTag.mock.calls.flat()).toEqual(tags);
    expect(revalidatePath.mock.calls.flat()).toEqual(["/", "/kontakt"]);
  });

  it("awaits an async revalidator before answering", async () => {
    const seen: string[] = [];
    const res = await createRevalidateHandler({
      revalidateTag: async (tag) => {
        await Promise.resolve();
        seen.push(tag);
      },
    })(post(PUBLISH_BODY));

    expect(res.status).toBe(200);
    expect(seen).toEqual([SNABBSAJT_CACHE_TAG]);
  });

  it("refuses a body that did not come from SnabbSajt", async () => {
    const revalidateTag = vi.fn();
    const handler = createRevalidateHandler({ revalidateTag });

    expect((await handler(post({ source: "someone-else" }))).status).toBe(400);
    expect((await handler(post(null))).status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("refuses a body that is not JSON at all", async () => {
    const revalidateTag = vi.fn();
    const res = await createRevalidateHandler({ revalidateTag })(
      new Request("https://agency.example/api/snabbsajt/revalidate", {
        method: "POST",
        body: "not json",
      }),
    );

    expect(res.status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("answers 405 to anything but POST, so a crawler cannot bust the cache", async () => {
    const revalidateTag = vi.fn();
    const res = await createRevalidateHandler({ revalidateTag })(post(PUBLISH_BODY, "GET"));

    expect(res.status).toBe(405);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("never caches its own answer", async () => {
    const res = await createRevalidateHandler({ revalidateTag: vi.fn() })(post(PUBLISH_BODY));
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
