import { ConnectError } from "../connect/deviceAuth";

// ---------------------------------------------------------------------------
// A minimal MCP client over Streamable HTTP — three calls, no SDK.
//
// The paired admin token authenticates against the SAME endpoint an AI assistant
// uses: `POST <appOrigin>/api/mcp`, ordinary JSON-RPC 2.0. There is no
// REST-per-verb API and we must not invent one — the point of the design is that
// the CLI is another client of one tool layer, so every capability the app gains
// is reachable with no CLI change.
//
// Three things about that transport are load-bearing and easy to get wrong:
//   • the POST is refused (406) unless Accept lists BOTH application/json and
//     text/event-stream;
//   • the answer usually arrives as a one-event SSE stream, not a JSON body, so
//     the parser has to accept either;
//   • `initialize` comes first, and if the server hands back a session id we
//     have to echo it. The deployment is stateless today and does not, but
//     honouring it costs one header and stops this breaking if that changes.
// ---------------------------------------------------------------------------

/** An expected, message-worthy failure — same contract as ConnectError, and a
 *  subclass so the command layer catches both with one check. */
export class McpError extends ConnectError {}

export const DEFAULT_APP_URL = "https://snabbsajt.com";

const MCP_PATH = "/api/mcp";
/** A version this SDK's server supports. If a server negotiates a different one
 *  we use its answer for subsequent requests rather than insisting on ours. */
const PROTOCOL_VERSION = "2025-06-18";

/** What `tools/list` needs to tell a developer: the verb, and one line of what
 *  it is for. The full input schema stays on the server — printing it here would
 *  bury the answer to "what can my grant actually do". */
export type McpTool = { name: string; title: string };

export type McpCallResult = {
  /** True when the tool itself reported a failure. Not a transport error. */
  isError: boolean;
  /** The tool's text content, joined. Empty when it only returned structure. */
  text: string;
  /** `structuredContent`, when the tool declares an output schema. */
  data?: unknown;
};

export type McpClientOptions = {
  /** App origin (not the Convex site origin `connect` talks to). */
  appUrl?: string;
  token: string;
  /** Version reported as clientInfo; the server logs it. */
  version?: string;
  fetch?: typeof globalThis.fetch;
};

/** Vet the app origin before a live write credential crosses to it. `appUrl` can
 *  come from a file the CLI tells you to commit, so a pull request can change
 *  it — the same reason `connect` vets its own API URL. */
export function appBaseUrl(appUrl?: string): string {
  const raw = appUrl || process.env.SNABBSAJT_APP_URL || DEFAULT_APP_URL;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new McpError(`${raw} is not a valid URL.`);
  }
  if (parsed.protocol !== "https:") {
    throw new McpError(
      `Refusing to send an admin token over ${parsed.protocol}// — the app URL must use https (${raw}).`,
    );
  }
  return raw.replace(/\/+$/, "");
}

type RpcMessage = {
  result?: unknown;
  error?: { code?: number; message?: string };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Accept either a plain JSON body or a Streamable-HTTP SSE stream. The server
 *  chooses; both are legal, and the SSE form may be preceded by a priming event
 *  with an empty `data:` line that must be skipped rather than parsed. */
export function parseRpcMessage(body: string): RpcMessage | undefined {
  const trimmed = body.trim();
  if (!trimmed) return undefined;
  const candidates: string[] = [];
  if (trimmed.startsWith("{")) candidates.push(trimmed);
  for (const block of trimmed.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .join("\n");
    if (data) candidates.push(data);
  }
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (isRecord(parsed) && ("result" in parsed || "error" in parsed)) {
        return parsed as RpcMessage;
      }
    } catch {
      // Not this block — a priming or keep-alive event. Keep looking.
    }
  }
  return undefined;
}

function resolveFetch(injected?: typeof globalThis.fetch): typeof globalThis.fetch {
  const impl = injected ?? globalThis.fetch;
  if (typeof impl !== "function") {
    throw new McpError(
      "No global fetch available. Node 20+ is required to run `snabbsajt admin`.",
    );
  }
  return impl;
}

export type McpClient = {
  /** The endpoint being talked to — printed so a wrong `--app-url` is visible. */
  endpoint: string;
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<McpCallResult>;
};

export function createMcpClient(options: McpClientOptions): McpClient {
  const endpoint = `${appBaseUrl(options.appUrl)}${MCP_PATH}`;
  const fetchImpl = resolveFetch(options.fetch);
  let nextId = 1;
  let sessionId: string | undefined;
  let negotiatedVersion: string | undefined;
  let initialized = false;

  async function rpc(
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      // Both, or the transport answers 406 before the server sees the request.
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${options.token}`,
    };
    if (negotiatedVersion) headers["MCP-Protocol-Version"] = negotiatedVersion;
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;

    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
      });
    } catch (cause) {
      throw new McpError(
        `Could not reach ${endpoint}: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }

    const returnedSession = response.headers.get("mcp-session-id");
    if (returnedSession) sessionId = returnedSession;

    if (response.status === 401 || response.status === 403) {
      // The one failure a developer will hit repeatedly, so it names the fix
      // rather than the status code. Never echo the token that was refused.
      throw new McpError(
        "The admin token was refused. It may have been revoked or expired — run `snabbsajt admin pair` again.",
      );
    }
    if (response.status === 429) {
      throw new McpError("Rate limited by the server. Wait a moment and try again.");
    }

    const body = await response.text().catch(() => "");
    const message = parseRpcMessage(body);

    if (!message) {
      if (response.status === 404) {
        throw new McpError(
          `${endpoint} returned 404. Check the app URL — it is the SnabbSajt app origin, not the API URL that \`connect\` uses.`,
        );
      }
      throw new McpError(
        `${endpoint} answered HTTP ${response.status} without a JSON-RPC response.`,
      );
    }
    if (message.error) {
      throw new McpError(
        message.error.message ?? `The server rejected ${method} (HTTP ${response.status}).`,
      );
    }
    if (!isRecord(message.result)) {
      throw new McpError(`The server's answer to ${method} had no result object.`);
    }
    return message.result;
  }

  async function initialize(): Promise<void> {
    if (initialized) return;
    const result = await rpc("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "@snabbsajt/cli", version: options.version ?? "0.0.0" },
    });
    negotiatedVersion =
      typeof result.protocolVersion === "string" ? result.protocolVersion : PROTOCOL_VERSION;
    initialized = true;
  }

  return {
    endpoint,
    async listTools(): Promise<McpTool[]> {
      await initialize();
      const result = await rpc("tools/list", {});
      const tools = Array.isArray(result.tools) ? result.tools : [];
      return tools.flatMap((entry): McpTool[] => {
        if (!isRecord(entry) || typeof entry.name !== "string") return [];
        const annotations = isRecord(entry.annotations) ? entry.annotations : {};
        const title =
          (typeof entry.title === "string" && entry.title) ||
          (typeof annotations.title === "string" && annotations.title) ||
          (typeof entry.description === "string"
            ? (entry.description.split(/(?<=\.)\s|\n/)[0] ?? "")
            : "");
        return [{ name: entry.name, title: title.trim() }];
      });
    },
    async callTool(name: string, args: Record<string, unknown>): Promise<McpCallResult> {
      await initialize();
      const result = await rpc("tools/call", { name, arguments: args });
      const content = Array.isArray(result.content) ? result.content : [];
      const text = content
        .flatMap((block) =>
          isRecord(block) && block.type === "text" && typeof block.text === "string"
            ? [block.text]
            : [],
        )
        .join("\n")
        .trim();
      return {
        isError: result.isError === true,
        text,
        ...(result.structuredContent !== undefined
          ? { data: result.structuredContent }
          : {}),
      };
    },
  };
}
