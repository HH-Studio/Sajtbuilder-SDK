import { describe, expect, it, vi } from "vitest";
import {
  safeFetch,
  type SafeFetchResolver,
  type SafeFetchTransport,
  type SafeTransportResponse,
} from "../src/import/net/safeFetch";

function response(
  status: number,
  body = "",
  headers: Record<string, string> = {},
  dispose?: () => void,
): SafeTransportResponse {
  return {
    status,
    headers,
    body: (async function* () {
      yield new TextEncoder().encode(body);
    })(),
    dispose,
  };
}

function resolver(
  answers: Record<string, string | string[]>,
): SafeFetchResolver {
  return async (hostname) => {
    const answer = answers[hostname];
    if (!answer) throw new Error(`No DNS fixture for ${hostname}`);
    return (Array.isArray(answer) ? answer : [answer]).map((address) => ({
      address,
      family: address.includes(":") ? 6 : 4,
    }));
  };
}

describe("safeFetch", () => {
  it("pins a public DNS answer while preserving Host and TLS SNI", async () => {
    const dispose = vi.fn();
    const transport = vi.fn<SafeFetchTransport>(async () =>
      response(200, "hello", { "content-type": "text/plain" }, dispose),
    );

    const result = await safeFetch("https://public.example/path?q=1", {
      resolver: resolver({ "public.example": "93.184.216.34" }),
      transport,
    });

    expect(new TextDecoder().decode(result.body)).toBe("hello");
    expect(result.finalUrl).toBe("https://public.example/path?q=1");
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "93.184.216.34",
        hostname: "public.example",
        serverName: "public.example",
        headers: {
          Accept: "text/html,application/xhtml+xml,text/css;q=0.9,*/*;q=0.8",
          "Accept-Encoding": "identity",
          Connection: "close",
          Host: "public.example",
          "User-Agent": "SnabbSajt-Importer/1.0",
        },
      }),
    );
    const sentHeaders = transport.mock.calls[0][0].headers;
    expect(Object.keys(sentHeaders).map((key) => key.toLowerCase())).not.toContain("cookie");
    expect(Object.keys(sentHeaders).map((key) => key.toLowerCase())).not.toContain("authorization");
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it.each([
    "https://user:secret@public.example/",
    "http://localhost/",
    "http://localhost./",
    "http://localhost.localdomain/",
    "http://127.0.0.1/",
    "http://10.0.0.1/",
    "http://100.64.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://172.16.0.1/",
    "http://192.168.0.1/",
    "http://192.0.2.1/",
    "http://192.88.99.1/",
    "http://198.18.0.1/",
    "http://198.51.100.1/",
    "http://203.0.113.1/",
    "http://224.0.0.1/",
    "http://[::1]/",
    "http://[::]/",
    "http://[fe80::1]/",
    "http://[fc00::1]/",
    "http://[2001:db8::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:8.8.8.8]/",
  ])("rejects non-public target %s before transport", async (url) => {
    const transport = vi.fn<SafeFetchTransport>();
    await expect(
      safeFetch(url, {
        resolver: resolver({ "public.example": "93.184.216.34" }),
        transport,
      }),
    ).rejects.toMatchObject({ code: "UNSAFE_DESTINATION" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("rejects a hostname if any DNS answer is non-public", async () => {
    const transport = vi.fn<SafeFetchTransport>();
    await expect(
      safeFetch("https://mixed.example", {
        resolver: resolver({
          "mixed.example": ["93.184.216.34", "10.0.0.7"],
        }),
        transport,
      }),
    ).rejects.toMatchObject({ code: "UNSAFE_DESTINATION" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("rejects IPv4-mapped IPv6 returned by DNS", async () => {
    const transport = vi.fn<SafeFetchTransport>();
    await expect(
      safeFetch("https://mapped.example", {
        resolver: resolver({ "mapped.example": "::ffff:8.8.8.8" }),
        transport,
      }),
    ).rejects.toMatchObject({ code: "UNSAFE_DESTINATION" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("allows and pins a global-unicast IPv6 DNS answer", async () => {
    const transport = vi.fn<SafeFetchTransport>(async () => response(200, "ok"));
    await safeFetch("https://v6.example", {
      resolver: resolver({ "v6.example": "2606:4700:4700::1111" }),
      transport,
    });
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({ address: "2606:4700:4700::1111" }),
    );
  });

  it("re-resolves redirects and blocks a public-to-private hop", async () => {
    const dispose = vi.fn();
    const transport = vi.fn<SafeFetchTransport>(async () =>
      response(302, "", { location: "http://private.example/secret" }, dispose),
    );
    await expect(
      safeFetch("https://public.example", {
        resolver: resolver({
          "public.example": "93.184.216.34",
          "private.example": "169.254.169.254",
        }),
        transport,
      }),
    ).rejects.toMatchObject({ code: "UNSAFE_DESTINATION" });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes each redirect and final response exactly once", async () => {
    const firstDispose = vi.fn();
    const finalDispose = vi.fn();
    const transport = vi.fn<SafeFetchTransport>(async ({ path }) =>
      path === "/start"
        ? response(302, "", { location: "/final" }, firstDispose)
        : response(200, "done", {}, finalDispose),
    );

    const result = await safeFetch("https://public.example/start", {
      resolver: resolver({ "public.example": "93.184.216.34" }),
      transport,
    });

    expect(new TextDecoder().decode(result.body)).toBe("done");
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(finalDispose).toHaveBeenCalledTimes(1);
  });

  it("detects a DNS answer changing to private on a same-host redirect", async () => {
    let resolution = 0;
    const changingResolver: SafeFetchResolver = async () => [
      {
        address: resolution++ === 0 ? "93.184.216.34" : "127.0.0.1",
        family: 4,
      },
    ];
    const transport = vi.fn<SafeFetchTransport>(async () =>
      response(302, "", { location: "/next" }),
    );

    await expect(
      safeFetch("https://public.example", {
        resolver: changingResolver,
        transport,
      }),
    ).rejects.toMatchObject({ code: "UNSAFE_DESTINATION" });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("rejects a cross-origin redirect before connecting when an origin boundary is set", async () => {
    const transport = vi.fn<SafeFetchTransport>(async () =>
      response(302, "", { location: "https://cdn.example/asset" }),
    );
    await expect(
      safeFetch("https://public.example/start", {
        allowedOrigin: "https://public.example",
        resolver: resolver({
          "public.example": "93.184.216.34",
          "cdn.example": "8.8.8.8",
        }),
        transport,
      }),
    ).rejects.toMatchObject({ code: "UNSAFE_DESTINATION" });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("enforces the response byte cap while streaming", async () => {
    const dispose = vi.fn();
    const transport: SafeFetchTransport = async () => ({
      status: 200,
      headers: {},
      body: (async function* () {
        yield new Uint8Array(4);
        yield new Uint8Array(4);
      })(),
      dispose,
    });
    await expect(
      safeFetch("https://public.example", {
        resolver: resolver({ "public.example": "93.184.216.34" }),
        transport,
        maxBytes: 7,
      }),
    ).rejects.toMatchObject({ code: "BYTE_LIMIT" });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes a response rejected by content-length exactly once", async () => {
    const dispose = vi.fn();
    await expect(
      safeFetch("https://public.example", {
        resolver: resolver({ "public.example": "93.184.216.34" }),
        transport: async () => response(200, "", { "content-length": "8" }, dispose),
        maxBytes: 7,
      }),
    ).rejects.toMatchObject({ code: "BYTE_LIMIT" });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes a response exactly once when its body fails", async () => {
    const dispose = vi.fn();
    const transport: SafeFetchTransport = async () => ({
      status: 200,
      headers: {},
      body: (async function* () {
        yield new Uint8Array(1);
        throw new Error("body failed");
      })(),
      dispose,
    });
    await expect(
      safeFetch("https://public.example", {
        resolver: resolver({ "public.example": "93.184.216.34" }),
        transport,
      }),
    ).rejects.toMatchObject({ code: "HTTP_ERROR" });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("enforces one total timeout across DNS and transport", async () => {
    const transport: SafeFetchTransport = async ({ signal }) => {
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
      return response(200);
    };
    await expect(
      safeFetch("https://public.example", {
        resolver: resolver({ "public.example": "93.184.216.34" }),
        transport,
        timeoutMs: 10,
      }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("enforces the timeout while a response body stalls", async () => {
    const dispose = vi.fn();
    const transport: SafeFetchTransport = async () => ({
      status: 200,
      headers: {},
      body: {
        [Symbol.asyncIterator]() {
          return {
            next: () => new Promise<IteratorResult<Uint8Array>>(() => undefined),
          };
        },
      },
      dispose,
    });
    await expect(
      safeFetch("https://public.example", {
        resolver: resolver({ "public.example": "93.184.216.34" }),
        transport,
        timeoutMs: 10,
      }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("enforces the redirect cap", async () => {
    const transport: SafeFetchTransport = async ({ path }) =>
      response(302, "", { location: path === "/" ? "/one" : "/two" });
    await expect(
      safeFetch("https://public.example/", {
        resolver: resolver({ "public.example": "93.184.216.34" }),
        transport,
        maxRedirects: 1,
      }),
    ).rejects.toMatchObject({ code: "REDIRECT_LIMIT" });
  });
});
