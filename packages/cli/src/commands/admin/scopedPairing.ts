import {
  ConnectError,
  baseUrl,
  clampNumber,
  postJson,
} from "../connect/deviceAuth";

// ---------------------------------------------------------------------------
// Device-code pairing for the `admin` namespace — `POST /v1/cli/pair/{start,poll}`.
//
// The same shape as `snabbsajt connect`, deliberately a different endpoint pair
// and a different credential. `connect` mints a read-only, single-site delivery
// token; this mints a CAPABILITY-SCOPED token that can also write, and the owner
// approves it scope by scope in a browser they are already signed in to.
//
// Two consequences the caller must respect:
//   • `start` answers with the NORMALISED scope set, not the one we asked for
//     (an unknown scope string is dropped, `site:read` is always added). Print
//     the server's set, never the request.
//   • `poll` answers with the GRANTED set, which the owner may narrow further by
//     unticking a scope on the approval page. Print that too — a developer who
//     thinks they hold `publish` and does not will otherwise read the resulting
//     denial as a bug.
// ---------------------------------------------------------------------------

/** Enough to read a site and edit its draft. Nothing that publishes, spends
 *  credits, or touches customer data — those are opt-in via `--scopes`. */
export const DEFAULT_ADMIN_SCOPES = ["site:read", "content:write"] as const;

export type ScopedPairStart = {
  deviceCode: string;
  userCode: string;
  /** What the server will actually ask the owner to approve. */
  scopes: string[];
  verificationUrl: string;
  /** Seconds until the pairing expires. */
  expiresIn: number;
  /** Seconds the server asks us to wait between polls; its rate limit assumes
   *  this cadence, so polling faster gets you 429ed, not paired sooner. */
  interval: number;
};

export type ScopedPairApproved = {
  status: "approved";
  token: string;
  websiteId: string;
  /** The scopes the owner actually granted — possibly narrower than requested. */
  scopes: string[];
  siteName: string | null;
  slug: string | null;
};

export type ScopedPairPoll =
  | { status: "pending"; userCode?: string }
  | ScopedPairApproved
  | { status: "denied" }
  | { status: "expired" }
  | { status: "claimed" }
  | { status: "unknown" }
  | { status: "rate_limited" };

export type ScopedPairOptions = {
  apiUrl?: string;
  fetch?: typeof globalThis.fetch;
  /** Injected in tests so the polling loop does not really wait. */
  sleep?: (ms: number) => Promise<void>;
  /** Free-text hint shown to the human on the approval page. */
  client?: string;
};

function resolveFetch(injected?: typeof globalThis.fetch): typeof globalThis.fetch {
  const impl = injected ?? globalThis.fetch;
  if (typeof impl !== "function") {
    throw new ConnectError(
      "No global fetch available. Node 20+ is required to run `snabbsajt admin pair`.",
    );
  }
  return impl;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((s): s is string => typeof s === "string") : [];
}

/** Split a `--scopes a,b,c` value. Empty entries are dropped rather than sent as
 *  `""`, which the server would silently discard anyway. */
export function parseScopes(raw: string | undefined): string[] {
  if (raw === undefined) return [...DEFAULT_ADMIN_SCOPES];
  const scopes = raw
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
  if (scopes.length === 0) {
    throw new ConnectError(
      "--scopes was empty. Pass a comma-separated list, or omit the flag for site:read,content:write.",
    );
  }
  return scopes;
}

/** Begin a scoped pairing. Unauthenticated by construction — there is nothing to
 *  authenticate with yet, which is the whole point of a device-code flow. */
export async function startScopedPairing(
  scopes: string[],
  options: ScopedPairOptions = {},
): Promise<ScopedPairStart> {
  const fetchImpl = resolveFetch(options.fetch);
  const { status, body } = await postJson(
    fetchImpl,
    `${baseUrl(options.apiUrl)}/v1/cli/pair/start`,
    { scopes, ...(options.client ? { client: options.client } : {}) },
  );
  if (status === 429) {
    throw new ConnectError(
      "Too many pairing attempts from this network. Wait a minute and run `snabbsajt admin pair` again.",
    );
  }
  const value = body as Partial<ScopedPairStart> | undefined;
  if (status !== 200 || !value?.deviceCode || !value.userCode || !value.verificationUrl) {
    throw new ConnectError(
      `Could not start pairing (HTTP ${status}). Check the API URL and try again.`,
    );
  }
  return {
    deviceCode: value.deviceCode,
    userCode: value.userCode,
    // The server's normalised set when it sends one; falling back to the request
    // is only so the display is never empty, and it is corrected on approval.
    scopes: stringList(value.scopes).length > 0 ? stringList(value.scopes) : scopes,
    verificationUrl: value.verificationUrl,
    // Both numbers drive how long we wait, so both are bounded. Without a
    // ceiling a hostile or broken `start` ("interval": 100000) turns pairing
    // into a sleep that never usefully polls, and the terminal just hangs.
    expiresIn: clampNumber(value.expiresIn, 600, 30, 1800),
    interval: clampNumber(value.interval, 2, 1, 30),
  };
}

/** One poll. Never throws on `pending` — that is the normal answer. */
export async function pollScopedPairing(
  deviceCode: string,
  options: ScopedPairOptions = {},
): Promise<ScopedPairPoll> {
  const fetchImpl = resolveFetch(options.fetch);
  const { status, body } = await postJson(
    fetchImpl,
    `${baseUrl(options.apiUrl)}/v1/cli/pair/poll`,
    { deviceCode },
  );
  if (status === 429) return { status: "rate_limited" };
  const value = body as ScopedPairPoll | undefined;
  if (!value || typeof value.status !== "string") return { status: "unknown" };
  return value;
}

/** Poll until the human answers, the pairing expires, or the deadline passes.
 *
 *  Resolves ONLY on approval; every other terminal state throws with a message
 *  that says what happened, because "it didn't work" is useless when the answer
 *  is "you clicked Deny". */
export async function waitForScopedApproval(
  start: ScopedPairStart,
  options: ScopedPairOptions = {},
): Promise<ScopedPairApproved> {
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let intervalMs = Math.max(1, start.interval) * 1000;
  const deadline = start.expiresIn * 1000;
  let waited = 0;

  while (waited <= deadline) {
    const result = await pollScopedPairing(start.deviceCode, options);
    switch (result.status) {
      case "approved":
        // "Approved" without a token is not an approval. Accepting it writes the
        // literal string "undefined" into .env.local and reports success.
        if (!result.token || !result.websiteId) {
          throw new ConnectError(
            "The server approved the pairing but returned no token. Run `snabbsajt admin pair` again.",
          );
        }
        return { ...result, scopes: stringList(result.scopes) };
      case "denied":
        throw new ConnectError(
          "The pairing was declined in the browser. Nothing was connected.",
        );
      case "expired":
        throw new ConnectError(
          "The pairing code expired before it was approved. Run `snabbsajt admin pair` again.",
        );
      case "claimed":
        throw new ConnectError(
          "That pairing code was already used. Run `snabbsajt admin pair` again for a fresh one.",
        );
      case "rate_limited":
        // Back off rather than give up: the server is asking us to slow down,
        // not telling us the pairing failed.
        intervalMs = Math.min(intervalMs * 2, 30_000);
        break;
      case "unknown":
        throw new ConnectError(
          "The server did not recognise this pairing. Run `snabbsajt admin pair` again.",
        );
      default:
        break; // pending — keep waiting
    }
    await sleep(intervalMs);
    waited += intervalMs;
  }

  throw new ConnectError(
    "Timed out waiting for approval. Run `snabbsajt admin pair` again when you are at the browser.",
  );
}
