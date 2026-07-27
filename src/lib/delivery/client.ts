import type { SiteSnapshot } from "../../convex/model/snapshot";

// ---------------------------------------------------------------------------
// Headless delivery client — read one site's PUBLISHED content from your own
// app, on your own host.
//
// The whole surface is one call. You hold a read-only, single-site token; you
// get back the immutable snapshot of the last publish. There is no write path
// here and there never will be: content is edited in SnabbSajt, by the person
// who owns the words. See docs `publishing.md` for the endpoint contract.
//
//   const sajt = createDeliveryClient({ siteId, token });
//   const { snapshot } = await sajt.getPublishedSite();
//
// Designed for build-time use (SSG/ISR) as much as request-time: a published
// snapshot only changes when someone publishes, and publishing can fire your
// deploy hook, so refetching per request buys nothing.
// ---------------------------------------------------------------------------

/** The production delivery host. Overridable for a staging deployment via the
 *  `baseUrl` option or the `SNABBSAJT_API_URL` environment variable — in that
 *  order, so an explicit option always wins over ambient config. */
export const DEFAULT_DELIVERY_BASE_URL = "https://tangible-echidna-118.convex.site";

/** Locales a site can be published in. Mirrors the app's locale union. */
export type DeliveryLocale = "sv" | "en" | "pl";

/** Every way a delivery read can fail, as a discriminated reason.
 *
 *  `unauthorized` is deliberately broad on the server side: a wrong token, a
 *  revoked token, a token for a DIFFERENT site, a deleted site and a suspended
 *  site all answer identically, so a caller cannot probe which site ids exist.
 *  Do not write code that tries to tell those apart — it cannot. */
export type DeliveryErrorReason =
  | "unauthorized"
  | "not_published"
  | "rate_limited"
  | "network"
  | "malformed";

export class DeliveryError extends Error {
  readonly reason: DeliveryErrorReason;
  /** HTTP status, when the failure got far enough to have one. */
  readonly status?: number;

  constructor(reason: DeliveryErrorReason, message: string, status?: number) {
    super(message);
    this.name = "DeliveryError";
    this.reason = reason;
    this.status = status;
  }
}

/** A successful read: the frozen snapshot plus the identity of the publish it
 *  came from. `versionId` is stable per publish, which makes it the right
 *  cache key and the right thing to log when a build looks wrong. */
export type PublishedSite = {
  version: 1;
  siteId: string;
  versionId: string;
  publishedAt: number;
  snapshot: SiteSnapshot;
};

export type DeliveryClientOptions = {
  /** The site's id, shown next to its delivery token in SnabbSajt. */
  siteId: string;
  /** A delivery token (`sajt_pub_…`). Read-only and scoped to this one site —
   *  but still a credential: keep it in your CI secret store, not in client
   *  bundles. It grants the published content of one site to whoever holds it. */
  token: string;
  baseUrl?: string;
  /** Injectable for tests and for runtimes with a non-global fetch. */
  fetch?: typeof globalThis.fetch;
  /** Retries for the failures that are worth retrying — 429 and 5xx — with
   *  exponential backoff. Network errors are retried too. 4xx other than 429 is
   *  never retried: a wrong token does not become right. Default 2. */
  retries?: number;
  /** Base backoff in ms; attempt N waits `retryDelayMs * 2 ** N`. Default 250. */
  retryDelayMs?: number;
};

export type GetPublishedSiteOptions = {
  /** Ask for a specific published language. Falls back to the site's primary
   *  language when that locale was never published — you always get a site. */
  locale?: DeliveryLocale;
  /** Abort a slow build step without leaking the request. */
  signal?: AbortSignal;
};

/** Resolve and VET the host we will send the token to.
 *
 *  This is a credential-bearing request, and the base URL can arrive from
 *  `.snabbsajt.json` — a file the CLI tells you to commit, so a pull request
 *  can change it. A plain `http://` host would put a live delivery token on the
 *  wire in clear text, addressed wherever that PR said. https is therefore not
 *  a nicety here, it is the whole protection, and an insecure base URL is
 *  refused rather than downgraded. */
function resolveBaseUrl(explicit?: string): string {
  const fromEnv =
    typeof process !== "undefined" ? process.env?.SNABBSAJT_API_URL : undefined;
  const raw = explicit || fromEnv || DEFAULT_DELIVERY_BASE_URL;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new DeliveryError(
      "unauthorized",
      `Delivery base URL is not a valid URL: ${raw}`,
    );
  }
  if (parsed.protocol !== "https:") {
    throw new DeliveryError(
      "unauthorized",
      `Delivery base URL must use https — refusing to send a token to ${raw}.`,
    );
  }
  return raw.replace(/\/+$/, "");
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Map a non-2xx response onto the typed reason. The server sends a small
 *  `{ error }` body; we trust the STATUS first so a truncated or proxied body
 *  cannot turn a 401 into something softer. */
function errorForStatus(status: number, body: unknown): DeliveryError {
  const code =
    body && typeof body === "object" && "error" in body
      ? String((body as { error: unknown }).error)
      : undefined;
  if (status === 401 || status === 403) {
    return new DeliveryError(
      "unauthorized",
      "The delivery token was refused. It may be wrong, revoked, or issued for a different site.",
      status,
    );
  }
  if (status === 404) {
    return new DeliveryError(
      "not_published",
      code === "not_published"
        ? "This site has never been published. Publish it once in SnabbSajt and this call starts returning content."
        : "Not found.",
      status,
    );
  }
  if (status === 429) {
    return new DeliveryError(
      "rate_limited",
      "Rate limited. Cache the snapshot between builds rather than fetching per request.",
      status,
    );
  }
  return new DeliveryError("network", `Delivery request failed (${status}).`, status);
}

function assertPublishedSite(value: unknown): asserts value is PublishedSite {
  const body = value as Partial<PublishedSite> | null | undefined;
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    typeof body.snapshot !== "object" ||
    body.snapshot === null ||
    Array.isArray(body.snapshot) ||
    // Checked because callers print and cache these. A `versionId` that is not
    // a string reaches a build log as "[object Object]" and a cache key as
    // nonsense, which is a worse failure than refusing the response.
    typeof body.versionId !== "string" ||
    typeof body.siteId !== "string" ||
    typeof body.publishedAt !== "number"
  ) {
    throw new DeliveryError(
      "malformed",
      "Delivery response did not contain a published snapshot.",
    );
  }
}

export type DeliveryClient = {
  /** Fetch the site's published snapshot. Throws `DeliveryError` on failure. */
  getPublishedSite(options?: GetPublishedSiteOptions): Promise<PublishedSite>;
  /** The URL this client reads, useful in build logs and error reports. */
  readonly endpoint: string;
};

export function createDeliveryClient(
  options: DeliveryClientOptions,
): DeliveryClient {
  const { siteId, token } = options;
  if (!siteId) throw new TypeError("createDeliveryClient: `siteId` is required.");
  if (!token) throw new TypeError("createDeliveryClient: `token` is required.");

  const baseUrl = resolveBaseUrl(options.baseUrl);
  const endpoint = `${baseUrl}/v1/sites/${encodeURIComponent(siteId)}/published`;
  const doFetch = options.fetch ?? globalThis.fetch;
  if (typeof doFetch !== "function") {
    throw new TypeError(
      "createDeliveryClient: no global fetch available — pass `fetch` explicitly.",
    );
  }
  const retries = Math.max(0, options.retries ?? 2);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 250);

  async function getPublishedSite(
    call: GetPublishedSiteOptions = {},
  ): Promise<PublishedSite> {
    const url = call.locale
      ? `${endpoint}?locale=${encodeURIComponent(call.locale)}`
      : endpoint;

    let lastError: DeliveryError | undefined;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        // Check before sleeping AND after: an abort during backoff should not
        // have to wait out the full delay before anyone notices.
        if (call.signal?.aborted) throw new DeliveryError("network", "Aborted.");
        await sleep(retryDelayMs * 2 ** (attempt - 1));
        if (call.signal?.aborted) throw new DeliveryError("network", "Aborted.");
      }

      let response: Response;
      try {
        response = await doFetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          ...(call.signal ? { signal: call.signal } : {}),
        });
      } catch (cause) {
        // An aborted request is the caller's own decision, not a fault to
        // retry — rethrow it untouched so `AbortError` stays recognisable.
        if (call.signal?.aborted) throw cause;
        lastError = new DeliveryError(
          "network",
          `Could not reach ${baseUrl}: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
        continue;
      }

      if (response.ok) {
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          throw new DeliveryError(
            "malformed",
            "Delivery response was not valid JSON.",
            response.status,
          );
        }
        assertPublishedSite(body);
        return body;
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }
      const error = errorForStatus(response.status, body);
      if (!isRetryable(response.status)) throw error;
      lastError = error;
    }

    throw (
      lastError ??
      new DeliveryError("network", "Delivery request failed after retries.")
    );
  }

  return { getPublishedSite, endpoint };
}
