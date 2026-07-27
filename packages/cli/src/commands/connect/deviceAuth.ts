// ---------------------------------------------------------------------------
// Device-code pairing — the CLI half of `snabbsajt connect`.
//
// A developer will run one command. They will not go and create an API key in a
// settings tab first. So the terminal starts a pairing, shows a short code and
// a URL, the human approves it in a browser they are already signed in to, and
// the terminal receives a delivery token exactly once.
//
// The CLI never sees a password and never handles the user's session: the only
// thing that crosses back is a read-only, single-site delivery token. The
// server endpoints are `POST /v1/cli/device/{start,poll}`.
// ---------------------------------------------------------------------------

export const DEFAULT_API_URL = "https://tangible-echidna-118.convex.site";

export type DeviceStart = {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  /** Seconds until the pairing expires. */
  expiresIn: number;
  /** Seconds the server asks us to wait between polls. Its rate limit assumes
   *  this cadence, so polling faster gets you 429ed, not paired sooner. */
  interval: number;
};

export type DevicePoll =
  | { status: "pending"; userCode?: string }
  | {
      status: "approved";
      token: string;
      websiteId: string;
      siteName: string | null;
      slug: string | null;
    }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "claimed" }
  | { status: "unknown" }
  | { status: "rate_limited" };

export class ConnectError extends Error {}

/** Keep a server-supplied number inside a range we are willing to wait for. */
function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

export type DeviceAuthOptions = {
  apiUrl?: string;
  fetch?: typeof globalThis.fetch;
  /** Injected in tests so the polling loop does not really wait. */
  sleep?: (ms: number) => Promise<void>;
  /** Free-text hint shown to the human on the approval page. */
  client?: string;
};

/** The pairing exchange ends with a live credential crossing the wire, so the
 *  host is vetted rather than accepted. `apiUrl` can come from a file the CLI
 *  tells you to commit, which means a pull request can change it. */
function baseUrl(apiUrl?: string): string {
  const raw = apiUrl || process.env.SNABBSAJT_API_URL || DEFAULT_API_URL;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ConnectError(`${raw} is not a valid URL.`);
  }
  if (parsed.protocol !== "https:") {
    throw new ConnectError(
      `Refusing to pair over ${parsed.protocol}// — the API URL must use https (${raw}).`,
    );
  }
  return raw.replace(/\/+$/, "");
}

function resolveFetch(injected?: typeof globalThis.fetch): typeof globalThis.fetch {
  const impl = injected ?? globalThis.fetch;
  if (typeof impl !== "function") {
    throw new ConnectError(
      "No global fetch available. Node 18+ is required to run `snabbsajt connect`.",
    );
  }
  return impl;
}

async function postJson(
  fetchImpl: typeof globalThis.fetch,
  url: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    throw new ConnectError(
      `Could not reach ${url}: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    parsed = undefined;
  }
  return { status: response.status, body: parsed };
}

/** Begin a pairing. Deliberately unauthenticated — there is nothing to
 *  authenticate with yet, which is the whole point of the flow. */
export async function startDeviceAuth(
  options: DeviceAuthOptions = {},
): Promise<DeviceStart> {
  const fetchImpl = resolveFetch(options.fetch);
  const { status, body } = await postJson(
    fetchImpl,
    `${baseUrl(options.apiUrl)}/v1/cli/device/start`,
    options.client ? { client: options.client } : {},
  );
  if (status === 429) {
    throw new ConnectError(
      "Too many pairing attempts from this network. Wait a minute and run `snabbsajt connect` again.",
    );
  }
  const value = body as Partial<DeviceStart> | undefined;
  if (
    status !== 200 ||
    !value?.deviceCode ||
    !value.userCode ||
    !value.verificationUrl
  ) {
    throw new ConnectError(
      `Could not start pairing (HTTP ${status}). Check the API URL and try again.`,
    );
  }
  return {
    deviceCode: value.deviceCode,
    userCode: value.userCode,
    verificationUrl: value.verificationUrl,
    // Both are server-supplied numbers that drive how long we wait, so both are
    // bounded here. Without a ceiling a hostile or broken `start` response
    // ("interval": 100000) turns the pairing into a sleep that never usefully
    // polls, and the developer just sees a hung terminal.
    expiresIn: clampNumber(value.expiresIn, 600, 30, 1800),
    interval: clampNumber(value.interval, 2, 1, 30),
  };
}

/** One poll. Never throws on a `pending` — that is the normal answer. */
export async function pollDeviceAuth(
  deviceCode: string,
  options: DeviceAuthOptions = {},
): Promise<DevicePoll> {
  const fetchImpl = resolveFetch(options.fetch);
  const { status, body } = await postJson(
    fetchImpl,
    `${baseUrl(options.apiUrl)}/v1/cli/device/poll`,
    { deviceCode },
  );
  if (status === 429) return { status: "rate_limited" };
  const value = body as DevicePoll | undefined;
  if (!value || typeof value.status !== "string") return { status: "unknown" };
  return value;
}

export type WaitOptions = DeviceAuthOptions & {
  /** Called once per poll so a caller can show progress. */
  onTick?: (elapsedSeconds: number) => void;
};

/** Poll until the human answers, the pairing expires, or the deadline passes.
 *
 *  Resolves ONLY on approval; every other terminal state throws with a message
 *  that says what the human did, because "it didn't work" is useless when the
 *  answer is "you clicked Deny". */
export async function waitForApproval(
  start: DeviceStart,
  options: WaitOptions = {},
): Promise<Extract<DevicePoll, { status: "approved" }>> {
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let intervalMs = Math.max(1, start.interval) * 1000;
  const deadline = start.expiresIn * 1000;
  let waited = 0;

  while (waited <= deadline) {
    const result = await pollDeviceAuth(start.deviceCode, options);
    switch (result.status) {
      case "approved":
        // "Approved" without a token is not an approval. Accepting it writes
        // the literal string "undefined" into .env.local and reports success.
        if (!result.token || !result.websiteId) {
          throw new ConnectError(
            "The server approved the pairing but returned no token. Run `snabbsajt connect` again.",
          );
        }
        return result;
      case "denied":
        throw new ConnectError(
          "The pairing was declined in the browser. Nothing was connected.",
        );
      case "expired":
        throw new ConnectError(
          "The pairing code expired before it was approved. Run `snabbsajt connect` again.",
        );
      case "claimed":
        throw new ConnectError(
          "That pairing code was already used. Run `snabbsajt connect` again for a fresh one.",
        );
      case "rate_limited":
        // Back off rather than give up: the server is asking us to slow down,
        // not telling us the pairing failed.
        intervalMs = Math.min(intervalMs * 2, 30_000);
        break;
      case "unknown":
        throw new ConnectError(
          "The server did not recognise this pairing. Run `snabbsajt connect` again.",
        );
      default:
        break; // pending — keep waiting
    }
    await sleep(intervalMs);
    waited += intervalMs;
    options.onTick?.(Math.round(waited / 1000));
  }

  throw new ConnectError(
    "Timed out waiting for approval. Run `snabbsajt connect` again when you are at the browser.",
  );
}
