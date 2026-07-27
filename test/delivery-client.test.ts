import { describe, expect, it, vi } from "vitest";
import {
  createDeliveryClient,
  DEFAULT_DELIVERY_BASE_URL,
  DeliveryError,
} from "../src/lib/delivery/client";

const SITE_ID = "k17abcdefghijklmnopqrstuvwx";
const TOKEN = "sajt_pub_testtoken";

/** The smallest body the endpoint can return that is still a real answer. */
function publishedBody(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    siteId: SITE_ID,
    versionId: "v123",
    publishedAt: 1_700_000_000_000,
    snapshot: { businessName: "Kvarterets Bistro", pages: [] },
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** The URL a mocked fetch was called with on its Nth call. Reaches through the
 *  mock's loose call typing so the assertions below stay readable. */
function calledUrl(fetchImpl: unknown, call = 0): string {
  const calls = (fetchImpl as { mock: { calls: unknown[][] } }).mock.calls;
  return String(calls[call]?.[0]);
}

function calledInit(fetchImpl: unknown, call = 0): RequestInit {
  const calls = (fetchImpl as { mock: { calls: unknown[][] } }).mock.calls;
  return calls[call]?.[1] as RequestInit;
}

function client(fetchImpl: typeof globalThis.fetch, extra = {}) {
  return createDeliveryClient({
    siteId: SITE_ID,
    token: TOKEN,
    baseUrl: "https://example.convex.site",
    fetch: fetchImpl,
    retryDelayMs: 0, // keep the retry tests instant
    ...extra,
  });
}

describe("delivery client — the request it sends", () => {
  it("calls the documented path with a bearer token", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(publishedBody()));
    await client(fetchImpl as unknown as typeof globalThis.fetch).getPublishedSite();

    expect(calledUrl(fetchImpl)).toBe(
      `https://example.convex.site/v1/sites/${SITE_ID}/published`,
    );
    const init = calledInit(fetchImpl);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TOKEN}`,
    );
  });

  it("passes a requested locale through as a query parameter", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(publishedBody()));
    await client(fetchImpl as unknown as typeof globalThis.fetch).getPublishedSite({
      locale: "sv",
    });
    expect(calledUrl(fetchImpl)).toContain("?locale=sv");
  });

  it("strips a trailing slash from baseUrl instead of doubling it", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(publishedBody()));
    await client(fetchImpl as unknown as typeof globalThis.fetch, {
      baseUrl: "https://example.convex.site/",
    }).getPublishedSite();
    expect(calledUrl(fetchImpl)).not.toContain("//v1/");
  });

  it("defaults to the production delivery host", () => {
    expect(DEFAULT_DELIVERY_BASE_URL).toMatch(/^https:\/\/[a-z0-9-]+\.convex\.site$/);
  });
});

describe("delivery client — failures a developer must be able to tell apart", () => {
  it("a refused token is `unauthorized` and is NOT retried", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: "unauthorized" }, 401),
    );
    const call = client(
      fetchImpl as unknown as typeof globalThis.fetch,
    ).getPublishedSite();

    await expect(call).rejects.toBeInstanceOf(DeliveryError);
    await expect(call).rejects.toMatchObject({ reason: "unauthorized", status: 401 });
    // A wrong token does not become right: retrying only burns rate limit.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("a never-published site is `not_published`, distinct from unauthorized", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: "not_published" }, 404),
    );
    await expect(
      client(fetchImpl as unknown as typeof globalThis.fetch).getPublishedSite(),
    ).rejects.toMatchObject({ reason: "not_published" });
  });

  it("retries a 429 and succeeds when the next attempt is allowed through", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "rate_limited" }, 429))
      .mockResolvedValueOnce(jsonResponse(publishedBody()));

    const result = await client(
      fetchImpl as unknown as typeof globalThis.fetch,
    ).getPublishedSite();

    expect(result.versionId).toBe("v123");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up with the last error once retries are exhausted", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: "rate_limited" }, 429),
    );
    await expect(
      client(fetchImpl as unknown as typeof globalThis.fetch, {
        retries: 1,
      }).getPublishedSite(),
    ).rejects.toMatchObject({ reason: "rate_limited" });
    expect(fetchImpl).toHaveBeenCalledTimes(2); // initial + one retry
  });

  it("retries a network error, then reports it as `network`", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    await expect(
      client(fetchImpl as unknown as typeof globalThis.fetch, {
        retries: 1,
      }).getPublishedSite(),
    ).rejects.toMatchObject({ reason: "network" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("a 200 without a snapshot is `malformed`, not a silently empty site", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ version: 1, siteId: SITE_ID }),
    );
    await expect(
      client(fetchImpl as unknown as typeof globalThis.fetch).getPublishedSite(),
    ).rejects.toMatchObject({ reason: "malformed" });
  });

  it("an aborted call rethrows the abort rather than retrying it", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("Aborted", "AbortError");
    });

    await expect(
      client(fetchImpl as unknown as typeof globalThis.fetch).getPublishedSite({
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("delivery client — construction", () => {
  it("refuses to be built without a site id or a token", () => {
    expect(() =>
      createDeliveryClient({ siteId: "", token: TOKEN }),
    ).toThrow(TypeError);
    expect(() =>
      createDeliveryClient({ siteId: SITE_ID, token: "" }),
    ).toThrow(TypeError);
  });

  it("exposes the endpoint it reads, for build logs", () => {
    const c = createDeliveryClient({
      siteId: SITE_ID,
      token: TOKEN,
      baseUrl: "https://example.convex.site",
      fetch: (async () => jsonResponse(publishedBody())) as typeof globalThis.fetch,
    });
    expect(c.endpoint).toBe(`https://example.convex.site/v1/sites/${SITE_ID}/published`);
  });
});
