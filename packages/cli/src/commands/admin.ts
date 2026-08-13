import { ConnectError, DEFAULT_API_URL } from "./connect/deviceAuth";
import {
  ADMIN_PROJECT_FILE,
  ADMIN_TOKEN_ENV_VAR,
  ENV_FILE,
  adminTokenIsMalformed,
  readAdminConfig,
  readAdminToken,
  writeAdminConfig,
  writeAdminToken,
} from "./admin/adminProject";
import {
  DEFAULT_APP_URL,
  type McpClient,
  createMcpClient,
} from "./admin/mcpClient";
import {
  DEFAULT_ADMIN_SCOPES,
  parseScopes,
  startScopedPairing,
  waitForScopedApproval,
  type ScopedPairOptions,
} from "./admin/scopedPairing";
import { cliVersion } from "./site";
import { openBrowser, shouldAutoOpen, type OpenBrowserEnv } from "./openBrowser";
import { consoleOutput, type Output } from "../output";

// ---------------------------------------------------------------------------
// `snabbsajt admin` — the one namespace in this CLI that holds a credential with
// write power.
//
// It is separate from `snabbsajt site *` on purpose. `site *` is local-first and
// keyless, and the sentence "no API key is required, it runs locally" has to stay
// literally true of it. So the write capability lives behind its own noun, with
// its own token variable, and `site *` is never given either.
//
// `pair` obtains a capability-scoped token by device-code approval. `tools` and
// `run` then speak plain MCP JSON-RPC to `<appOrigin>/api/mcp` — the SAME
// endpoint an AI assistant uses. `run` is generic on purpose: it exposes the
// whole tool layer instead of hardcoding ~45 verbs, so a capability the app gains
// tomorrow is reachable today with no CLI change.
// ---------------------------------------------------------------------------

export type AdminDeps = ScopedPairOptions & {
  /** Overrides the app origin the MCP client talks to. */
  appUrl?: string;
  /** Injected in tests so pairing never really spawns a browser. */
  browser?: OpenBrowserEnv;
};

function json(output: Output, payload: unknown): void {
  output.stdout(JSON.stringify(payload, null, 2));
}

function optionValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || (value.startsWith("-") && value !== "-")) {
    throw new ConnectError(`${flag} requires a value`);
  }
  return value;
}

function clientHint(): string {
  return `@snabbsajt/cli admin (${process.platform})`;
}

function version(): string {
  try {
    return cliVersion();
  } catch {
    return "0.0.0";
  }
}

async function runPair(
  args: string[],
  asJson: boolean,
  output: Output,
  deps: AdminDeps,
): Promise<number> {
  const cwd = process.cwd();
  const apiUrl = optionValue(args, "--api-url") ?? deps.apiUrl;
  const requested = parseScopes(optionValue(args, "--scopes"));

  const start = await startScopedPairing(requested, {
    ...deps,
    apiUrl,
    client: clientHint(),
  });

  if (asJson) {
    // A machine caller (an agent, a script) gets the code immediately so it can
    // surface the URL its own way, then blocks on the same wait below.
    json(output, {
      ok: true,
      command: "admin pair",
      stage: "awaiting-approval",
      userCode: start.userCode,
      verificationUrl: start.verificationUrl,
      // The server's normalised set, not what we asked for.
      scopes: start.scopes,
    });
  } else {
    // Open the approval page ourselves when a human is obviously watching. The
    // URL is still printed first and always: the browser may be the wrong one,
    // may not exist, or may be on another machine over SSH, and in every one of
    // those cases the developer needs the line they can copy.
    const noOpenFlag = args.includes("--no-open");
    const opened =
      !noOpenFlag &&
      shouldAutoOpen(deps.browser) &&
      openBrowser(start.verificationUrl, deps.browser);

    output.stdout("");
    output.stdout(`  Open      ${start.verificationUrl}`);
    output.stdout(`  Code      ${start.userCode}`);
    output.stdout(`  Asking    ${start.scopes.join(", ")}`);
    output.stdout("");
    if (opened) output.stdout("  Opened that page in your browser.");
    output.stdout("  Waiting for you to approve this terminal…");
    output.stdout("  You can untick any of those scopes before approving.");
    if (opened) output.stdout("  (--no-open next time if you would rather it did not.)");
  }

  const approved = await waitForScopedApproval(start, { ...deps, apiUrl });

  const appUrl = appUrlFromVerification(start.verificationUrl, deps);
  writeAdminConfig(cwd, {
    appUrl,
    apiUrl: apiUrl || process.env.SNABBSAJT_API_URL || DEFAULT_API_URL,
    siteId: approved.websiteId,
    scopes: approved.scopes,
    ...(approved.siteName ? { siteName: approved.siteName } : {}),
    ...(approved.slug ? { slug: approved.slug } : {}),
    pairedAt: new Date().toISOString(),
  });
  const tokenWrite = writeAdminToken(cwd, approved.token);

  if (asJson) {
    json(output, {
      ok: true,
      command: "admin pair",
      stage: "paired",
      siteId: approved.websiteId,
      siteName: approved.siteName,
      appUrl,
      // The GRANTED set — the owner may have unticked something.
      scopes: approved.scopes,
      projectFile: ADMIN_PROJECT_FILE,
      envFile: ENV_FILE,
      envVar: ADMIN_TOKEN_ENV_VAR,
      envAction: tokenWrite.action,
      // Never the token itself: --json output lands in CI logs.
      tokenWritten: true,
      warning: tokenWrite.unignored ? "env-file-not-gitignored" : undefined,
    });
  } else {
    output.stdout("");
    output.stdout(`  Paired with ${approved.siteName ?? approved.websiteId}.`);
    output.stdout(`  Granted   ${approved.scopes.join(", ")}`);
    if (!coversRequest(requested, approved.scopes)) {
      output.stdout("  (narrower than requested — the owner unticked something)");
    }
    output.stdout(`  ${ADMIN_PROJECT_FILE} written (safe to commit).`);
    output.stdout(`  ${ADMIN_TOKEN_ENV_VAR} ${tokenWrite.action} in ${ENV_FILE}.`);
    output.stdout("");
    output.stdout("  Next:  snabbsajt admin tools");
  }

  if (tokenWrite.unignored) {
    // stderr, always, in both modes. A token in a tracked file is the one
    // mistake here that cannot be undone by editing a file afterwards.
    output.stderr(
      `warning: ${ENV_FILE} does not appear to be gitignored. Add it to .gitignore before you commit — ${ADMIN_TOKEN_ENV_VAR} is a credential that can edit the site.`,
    );
  }
  return 0;
}

/** The approval page lives on the app origin, and the MCP endpoint is on that
 *  same origin — so the pairing response tells us where to talk without asking
 *  the developer to name it twice. An explicit override still wins. */
function appUrlFromVerification(verificationUrl: string, deps: AdminDeps): string {
  if (deps.appUrl) return deps.appUrl;
  if (process.env.SNABBSAJT_APP_URL) return process.env.SNABBSAJT_APP_URL;
  try {
    return new URL(verificationUrl).origin;
  } catch {
    return DEFAULT_APP_URL;
  }
}

function coversRequest(requested: string[], granted: string[]): boolean {
  return requested.every((scope) => granted.includes(scope));
}

/** Resolve the endpoint + credential for `tools`/`run`. Explicit flag beats the
 *  environment beats the paired file beats the production default. */
function connectedClient(args: string[], deps: AdminDeps): McpClient {
  const cwd = process.cwd();
  const token = readAdminToken(cwd);
  if (!token) {
    if (adminTokenIsMalformed(cwd)) {
      throw new ConnectError(
        `${ADMIN_TOKEN_ENV_VAR} does not look like a SnabbSajt admin token (they start with sajt_live_). Run \`snabbsajt admin pair\` to get one.`,
      );
    }
    throw new ConnectError(
      `No ${ADMIN_TOKEN_ENV_VAR} found in the environment or ${ENV_FILE}. Run \`snabbsajt admin pair\` first, or set it from your secret store.`,
    );
  }
  const config = readAdminConfig(cwd);
  const appUrl =
    optionValue(args, "--app-url") ??
    deps.appUrl ??
    process.env.SNABBSAJT_APP_URL ??
    config?.appUrl ??
    DEFAULT_APP_URL;

  return createMcpClient({
    appUrl,
    token,
    version: version(),
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
  });
}

async function runTools(
  args: string[],
  asJson: boolean,
  output: Output,
  deps: AdminDeps,
): Promise<number> {
  const client = connectedClient(args, deps);
  const tools = await client.listTools();

  if (asJson) {
    json(output, { ok: true, command: "admin tools", endpoint: client.endpoint, tools });
    return 0;
  }
  if (tools.length === 0) {
    output.stdout("This grant exposes no tools.");
    return 0;
  }
  const width = Math.max(...tools.map((tool) => tool.name.length));
  for (const tool of tools) {
    output.stdout(`${tool.name.padEnd(width)}  ${tool.title}`);
  }
  output.stdout("");
  output.stdout(`${tools.length} tools. Call one with: snabbsajt admin run <tool> --args '{}'`);
  return 0;
}

/** `--args` must be a JSON object because that is what `tools/call` takes. A
 *  bare array or scalar is a mistake worth naming rather than forwarding. */
function parseToolArgs(raw: string | undefined): Record<string, unknown> {
  if (raw === undefined) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new ConnectError(
      `--args is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ConnectError(
      `--args must be a JSON object, for example --args '{"websiteId":"..."}'`,
    );
  }
  return parsed as Record<string, unknown>;
}

async function runTool(
  args: string[],
  asJson: boolean,
  output: Output,
  deps: AdminDeps,
): Promise<number> {
  const [name] = args;
  if (!name || name.startsWith("-")) {
    throw new ConnectError(
      "snabbsajt admin run needs a tool name. Run `snabbsajt admin tools` to see them.",
    );
  }
  const toolArgs = parseToolArgs(optionValue(args, "--args"));
  const client = connectedClient(args, deps);
  const result = await client.callTool(name, toolArgs);

  if (result.isError) {
    // The tool ran and refused — a missing scope, a stale review, a bad
    // argument. Not a transport failure, so it reports the tool's own words.
    if (asJson) {
      json(output, {
        ok: false,
        command: "admin run",
        tool: name,
        error: result.text || "The tool reported an error without a message.",
      });
    } else {
      output.stderr(`snabbsajt: ${result.text || `${name} reported an error.`}`);
    }
    return 1;
  }

  if (asJson) {
    json(output, {
      ok: true,
      command: "admin run",
      tool: name,
      text: result.text,
      ...(result.data !== undefined ? { data: result.data } : {}),
    });
    return 0;
  }
  if (result.text) output.stdout(result.text);
  if (result.data !== undefined) output.stdout(JSON.stringify(result.data, null, 2));
  if (result.data === undefined && !result.text) output.stdout(`${name} returned nothing.`);
  return 0;
}

function usage(output: Output): void {
  output.stdout(`Usage:
  snabbsajt admin pair  [--scopes a,b,c] [--api-url <url>] [--no-open] [--json]
  snabbsajt admin tools [--app-url <url>] [--json]
  snabbsajt admin run <tool> [--args '<json>'] [--app-url <url>] [--json]

admin is the only namespace in this CLI that holds a credential able to CHANGE a
site. \`snabbsajt site ...\` stays local-first and keyless, and never sees a token.

pair opens the approval page in your browser (--no-open, CI, or a non-terminal
keeps it to the printed URL), prints a code, and once you approve it writes
${ADMIN_PROJECT_FILE} (safe to commit) plus ${ADMIN_TOKEN_ENV_VAR} into
${ENV_FILE} (a secret — gitignore it). The owner approves scope by scope and may
grant fewer than you asked for, so pair prints what you actually got.

Default scopes are ${DEFAULT_ADMIN_SCOPES.join(",")}: read a site and edit its
draft, nothing that publishes, spends credits or reads customer data.

tools and run speak MCP to <appOrigin>/api/mcp, the same endpoint an AI assistant
uses. run passes --args straight through as the tool's arguments, so every
capability the app gains is reachable without a CLI change.

Actions that are public or irreversible — publishing, emailing a customer a
document, granting someone access — still require the owner to approve them in
the browser at the moment they happen. A paired terminal cannot do them
unattended, whatever scopes it holds.`);
}

export async function runAdminCommand(
  rawArgs: string[],
  output: Output = consoleOutput,
  deps: AdminDeps = {},
): Promise<number> {
  const asJson = rawArgs.includes("--json");
  const args = rawArgs.filter((arg) => arg !== "--json");
  const [command, ...rest] = args;
  try {
    if (!command || ["help", "--help", "-h"].includes(command)) {
      usage(output);
      return 0;
    }
    if (command === "pair") return await runPair(rest, asJson, output, deps);
    if (command === "tools") return await runTools(rest, asJson, output, deps);
    if (command === "run") return await runTool(rest, asJson, output, deps);
    throw new ConnectError(`unknown admin command "${command}"`);
  } catch (error) {
    // McpError extends ConnectError, so one check covers pairing, transport and
    // tool-layer failures. Anything else is a bug and should surface as a crash.
    if (error instanceof ConnectError) {
      if (asJson) json(output, { ok: false, error: error.message });
      else output.stderr(`snabbsajt: ${error.message}`);
      return 1;
    }
    throw error;
  }
}
