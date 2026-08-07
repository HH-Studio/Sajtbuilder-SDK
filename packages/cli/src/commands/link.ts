import { homedir } from "node:os";
import { relative } from "node:path";
import {
  baseUrl,
  clampNumber,
  postJson,
  DEFAULT_API_URL,
  type DeviceAuthOptions,
} from "./connect/deviceAuth";
import {
  ENV_FILE,
  PROJECT_FILE,
  TOKEN_ENV_VAR,
  findAncestorProjectConfig,
  readDeliveryToken,
  readProjectConfig,
  removeEnvVar,
  removeProjectConfig,
  writeDeliveryToken,
  writeProjectConfig,
} from "./connect/project";
import {
  PromptCancelled,
  canPromptInteractively,
  relativeTime,
  select,
} from "../prompt";
import { consoleOutput, type Output } from "../output";

// ---------------------------------------------------------------------------
// `snabbsajt link` — pair a directory with one of YOUR sites, picked in the
// terminal.
//
// The difference from `connect` is where the choice happens. `connect` sends you
// to the browser to pick a site; `link` sends you to the browser to approve the
// TERMINAL, then lists your sites right here and lets you arrow through them.
// That is the whole feature, and it is the shape every developer already knows
// from `vercel link`.
//
// The credential story is unchanged, which is the point. The pairing row on the
// server is a single-use ticket that lives ten minutes and can mint exactly one
// read-only, single-site delivery token — the same token `connect` has always
// produced. Nothing account-scoped is stored on this machine, and the only files
// written are the two `connect` already writes:
//
//   .snabbsajt.json  siteId + apiUrl. Not a secret. Commit it.
//   .env.local       SNABBSAJT_DELIVERY_TOKEN. A secret. Gitignore it.
//
// Two rules this file is built around:
//   • It writes ONLY to the directory you ran it in, and it says so first.
//   • `--json` never prompts. Agents call us that way, and a prompt in a pipe
//     is a hang, so an ambiguous non-interactive run fails with a code instead.
// ---------------------------------------------------------------------------

/** Machine-readable failure. `code` is the contract; `message` is for a human
 *  and may be reworded at any time. */
export class LinkError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export type LinkableSite = {
  siteId: string;
  name: string;
  slug: string;
  workspaceName: string;
  lastPublishedAt: number | null;
};

type LinkStart = {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
  interval: number;
};

type LinkApproved = {
  approvedBy: string | null;
  sites: LinkableSite[];
  sharedNotOwnedCount: number;
  truncated: boolean;
};

function optionValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new LinkError("bad_flag", `${flag} requires a value`);
  }
  return value;
}

function clientHint(version: string): string {
  return `@snabbsajt/cli ${version} (${process.platform})`;
}

/** `~/code/acme` rather than `/Users/ludvig/code/acme`. The path is echoed
 *  before anything is written, so it has to be readable at a glance. */
function displayPath(cwd: string): string {
  const home = homedir();
  if (cwd === home) return "~";
  if (cwd.startsWith(`${home}/`)) return `~/${relative(home, cwd)}`;
  return cwd;
}

async function startLink(
  apiUrl: string | undefined,
  version: string,
  deps: DeviceAuthOptions,
): Promise<LinkStart> {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const { status, body } = await postJson(
    fetchImpl,
    `${baseUrl(apiUrl)}/v1/cli/link/start`,
    { client: clientHint(version) },
  );
  if (status === 429) {
    throw new LinkError(
      "rate_limited",
      "Too many pairing attempts from this network. Wait a minute and run `snabbsajt link` again.",
    );
  }
  const value = body as Partial<LinkStart> | undefined;
  if (status !== 200 || !value?.deviceCode || !value.userCode || !value.verificationUrl) {
    throw new LinkError(
      "start_failed",
      `Could not start pairing (HTTP ${status}). Check the API URL and try again.`,
    );
  }
  return {
    deviceCode: value.deviceCode,
    userCode: value.userCode,
    verificationUrl: value.verificationUrl,
    // Both drive how long we wait and both come from the server, so both are
    // bounded here — an unbounded "interval" is a hung terminal.
    expiresIn: clampNumber(value.expiresIn, 600, 30, 1800),
    interval: clampNumber(value.interval, 2, 1, 30),
  };
}

/** Poll until the human approves. Resolves with the site list — never a
 *  credential; nothing secret crosses this call. */
async function waitForLinkApproval(
  start: LinkStart,
  apiUrl: string | undefined,
  deps: DeviceAuthOptions,
): Promise<LinkApproved> {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let intervalMs = Math.max(1, start.interval) * 1000;
  const deadline = start.expiresIn * 1000;
  let waited = 0;

  while (waited <= deadline) {
    const { status, body } = await postJson(
      fetchImpl,
      `${baseUrl(apiUrl)}/v1/cli/link/poll`,
      { deviceCode: start.deviceCode },
    );
    const result = (status === 429 ? { status: "rate_limited" } : body) as
      | ({ status: string } & Partial<LinkApproved>)
      | undefined;

    switch (result?.status) {
      case "approved":
        return {
          approvedBy: result.approvedBy ?? null,
          sites: Array.isArray(result.sites) ? result.sites : [],
          sharedNotOwnedCount: result.sharedNotOwnedCount ?? 0,
          truncated: result.truncated ?? false,
        };
      case "denied":
        throw new LinkError(
          "denied",
          "The pairing was declined in the browser. Nothing was connected.",
        );
      case "expired":
        throw new LinkError(
          "ticket_expired",
          "The pairing code expired before it was approved. Run `snabbsajt link` again.",
        );
      case "claimed":
        throw new LinkError(
          "ticket_expired",
          "That pairing was already used. Run `snabbsajt link` again for a fresh one.",
        );
      case "unknown":
        throw new LinkError(
          "not_approved",
          "The server did not recognise this pairing. Run `snabbsajt link` again.",
        );
      case "rate_limited":
        // Back off rather than give up: the server is asking us to slow down,
        // not saying the pairing failed.
        intervalMs = Math.min(intervalMs * 2, 30_000);
        break;
      default:
        break; // pending
    }
    await sleep(intervalMs);
    waited += intervalMs;
  }
  throw new LinkError(
    "ticket_expired",
    "Timed out waiting for approval. Run `snabbsajt link` again when you are at the browser.",
  );
}

async function selectSite(
  deviceCode: string,
  siteId: string,
  apiUrl: string | undefined,
  deps: DeviceAuthOptions,
): Promise<{ token: string; siteId: string; siteName: string; slug: string }> {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const { status, body } = await postJson(
    fetchImpl,
    `${baseUrl(apiUrl)}/v1/cli/link/select`,
    { deviceCode, siteId },
  );
  const value = body as
    | { ok?: boolean; reason?: string; token?: string; siteName?: string; slug?: string }
    | undefined;
  if (status === 200 && value?.ok && value.token) {
    return {
      token: value.token,
      siteId,
      siteName: value.siteName ?? siteId,
      slug: value.slug ?? "",
    };
  }
  const advice: Record<string, [string, string]> = {
    rate_limited: ["rate_limited", "Rate limited by the server. Wait a moment and try again."],
    ticket_expired: [
      "ticket_expired",
      "The approval expired or was already used. Run `snabbsajt link` again.",
    ],
    not_approved: [
      "not_approved",
      "This pairing has not been approved. Run `snabbsajt link` again.",
    ],
    site_not_found: [
      "site_not_found",
      "That site does not exist, or you are not its owner. Only a site's owner can connect it to a terminal.",
    ],
    token_limit: [
      "token_limit",
      "This site already has the maximum number of active read keys. Revoke one in SnabbSajt under Inställningar → Leverans, then try again.",
    ],
  };
  const [code, message] = advice[value?.reason ?? ""] ?? [
    "select_failed",
    `Could not connect the site (HTTP ${status}).`,
  ];
  throw new LinkError(code, message);
}

/** Resolve which site to link, from a flag, from a single obvious answer, or
 *  from the human. Throws with a machine-readable code when it cannot. */
async function resolveSite(
  sites: LinkableSite[],
  wanted: string | undefined,
  autoYes: boolean,
  interactive: boolean,
  sharedNotOwnedCount: number,
  output: Output,
): Promise<LinkableSite | null> {
  if (sites.length === 0) {
    // The one case where "you have no sites, create one" is wrong advice: an
    // editor on someone else's sites owns none, and the fix is a conversation,
    // not a signup.
    if (sharedNotOwnedCount > 0) {
      throw new LinkError(
        "no_sites",
        `You have access to ${sharedNotOwnedCount} site${sharedNotOwnedCount === 1 ? "" : "s"}, but only a site's owner can connect it to a terminal. Ask the owner to run \`snabbsajt link\` — or to make you the owner.`,
      );
    }
    throw new LinkError(
      "no_sites",
      "You do not own any sites yet. Create one at https://snabbsajt.com/create, then run `snabbsajt link` again.",
    );
  }

  if (wanted) {
    const match = sites.find((s) => s.siteId === wanted || s.slug === wanted);
    if (!match) {
      throw new LinkError(
        "site_not_found",
        `No site matching "${wanted}". Yours: ${sites.map((s) => s.slug || s.siteId).join(", ")}`,
      );
    }
    return match;
  }

  if (sites.length === 1 && (autoYes || !interactive)) return sites[0]!;

  if (!interactive) {
    throw new LinkError(
      "ambiguous_site",
      `More than one site matched. Re-run with --site <slug|id>. Yours: ${sites.map((s) => s.slug || s.siteId).join(", ")}`,
    );
  }

  const now = Date.now();
  const choice = await select<LinkableSite | null>(
    "? Which site? (Use arrow keys)",
    [
      ...sites.map((site) => ({
        value: site as LinkableSite | null,
        label: `${site.workspaceName} / ${site.slug || site.name}`,
        hint: relativeTime(site.lastPublishedAt, now),
      })),
      { value: null, label: "Not one of these sites" },
    ],
    output,
  );
  return choice;
}

function json(output: Output, payload: unknown): void {
  output.stdout(JSON.stringify(payload, null, 2));
}

// --- the command ------------------------------------------------------------

type LinkDeps = DeviceAuthOptions & { version?: string };

async function runLink(
  args: string[],
  asJson: boolean,
  output: Output,
  deps: LinkDeps,
): Promise<number> {
  const cwd = process.cwd();
  // The pairing host is NEVER read from `.snabbsajt.json`: that file is meant to
  // be committed, so a pull request could otherwise point a colleague's
  // credential exchange at somebody else's server.
  const apiUrl = optionValue(args, "--api-url") ?? deps.apiUrl;
  const version = deps.version ?? "0.0.0";
  const wantedSite = optionValue(args, "--site");
  const autoYes = args.includes("--yes");
  const relink = args.includes("--relink");
  const interactive = !asJson && canPromptInteractively();
  const existing = readProjectConfig(cwd);

  if (args.includes("--status")) {
    if (asJson) {
      json(output, existing ? { ok: true, linked: true, ...existing } : { ok: true, linked: false });
    } else if (existing) {
      output.stdout(`  Directory   ${displayPath(cwd)}`);
      output.stdout(`  Linked to   ${existing.siteName ?? existing.siteId}`);
      output.stdout(`  Server      ${existing.apiUrl}`);
      output.stdout(
        `  Token       ${readDeliveryToken(cwd) ? `found (${TOKEN_ENV_VAR})` : `MISSING — run \`snabbsajt link\``}`,
      );
    } else {
      output.stdout(`  Directory   ${displayPath(cwd)}`);
      output.stdout("  Not linked. Run `snabbsajt link` to connect a site.");
    }
    return existing ? 0 : 1;
  }

  if (!asJson) {
    output.stdout("");
    output.stdout(`  SnabbSajt CLI ${version}`);
    // Announced BEFORE any pairing starts. A tool that edits a monorepo without
    // saying where loses trust permanently, and by the time the token arrives
    // it is too late to be told.
    output.stdout(`  Directory   ${displayPath(cwd)}`);
  }

  // Already linked, and the human is here to decide what to do about it.
  if (existing && !relink && !wantedSite) {
    if (!interactive) {
      if (asJson) {
        json(output, { ok: true, linked: true, changed: false, ...existing });
      } else {
        output.stdout(`  Linked to   ${existing.siteName ?? existing.siteId}`);
        output.stdout("  Already linked. Use --relink to choose a different site.");
      }
      return 0;
    }
    output.stdout(`  Linked to   ${existing.siteName ?? existing.siteId}`);
    output.stdout("");
    const action = await select<"keep" | "switch" | "unlink">(
      "? What now? (Use arrow keys)",
      [
        { value: "keep", label: "Keep this link" },
        { value: "switch", label: "Choose a different site" },
        { value: "unlink", label: "Unlink this directory" },
      ],
      output,
    );
    if (action === "keep") {
      output.stdout("  Nothing changed.");
      return 0;
    }
    if (action === "unlink") return runUnlink([], asJson, output, deps);
  }

  const ancestor = findAncestorProjectConfig(cwd);
  if (ancestor && !existing) {
    // Not a refusal and not a root-walk: just the sentence that stops someone
    // creating a second config three levels down without meaning to.
    output.stderr(
      `note: a ${PROJECT_FILE} already exists in ${displayPath(ancestor)}. Linking here creates a second, separate link.`,
    );
  }

  const start = await startLink(apiUrl, version, deps);
  if (asJson) {
    json(output, {
      ok: true,
      command: "link",
      stage: "awaiting-approval",
      userCode: start.userCode,
      verificationUrl: start.verificationUrl,
    });
  } else {
    output.stdout("");
    output.stdout(`  Open   ${start.verificationUrl}?code=${start.userCode}`);
    output.stdout(`  Code   ${start.userCode}`);
    output.stdout("");
    output.stdout("  Waiting for you to approve this terminal…");
  }

  const approved = await waitForLinkApproval(start, apiUrl, deps);

  if (!asJson) {
    output.stdout("");
    if (approved.approvedBy) output.stdout(`✓ Approved     ${approved.approvedBy}`);
    const workspaces = new Set(approved.sites.map((s) => s.workspaceName)).size;
    // Saying the search was COMPLETE is what makes a short list — or an empty
    // one — readable instead of alarming.
    output.stdout(`  Searched ${workspaces} workspace${workspaces === 1 ? "" : "s"}`);
    output.stdout(
      `  Sites          ${approved.sites.length} match${approved.sites.length === 1 ? "" : "es"}${approved.truncated ? " (list truncated)" : ""}`,
    );
    output.stdout("");
  }

  const chosen = await resolveSite(
    approved.sites,
    wantedSite,
    autoYes,
    interactive,
    approved.sharedNotOwnedCount,
    output,
  );
  if (chosen === null) {
    // "Not one of these sites" is not an error — the human answered the
    // question honestly and there is nothing to fix.
    output.stdout("");
    output.stdout("  Nothing linked. Create a site at https://snabbsajt.com/create,");
    output.stdout("  then run `snabbsajt link` again.");
    return 0;
  }

  const result = await selectSite(start.deviceCode, chosen.siteId, apiUrl, deps);

  writeProjectConfig(cwd, {
    siteId: result.siteId,
    apiUrl: apiUrl || process.env.SNABBSAJT_API_URL || DEFAULT_API_URL,
    ...(result.siteName ? { siteName: result.siteName } : {}),
    ...(result.slug ? { slug: result.slug } : {}),
  });
  const tokenWrite = writeDeliveryToken(cwd, result.token);

  if (asJson) {
    json(output, {
      ok: true,
      command: "link",
      stage: "linked",
      siteId: result.siteId,
      siteName: result.siteName,
      slug: result.slug,
      projectFile: PROJECT_FILE,
      envFile: ENV_FILE,
      envAction: tokenWrite.action,
      // Never the token itself: --json output lands in CI logs.
      tokenWritten: true,
      warning: tokenWrite.unignored ? "env-file-not-gitignored" : undefined,
    });
  } else {
    output.stdout("");
    output.stdout(`✓ Linked       ${chosen.workspaceName} / ${result.slug || result.siteName}`);
    output.stdout(`✓ Updated      ${PROJECT_FILE}      (safe to commit)`);
    output.stdout(`✓ Updated      ${ENV_FILE}           ${TOKEN_ENV_VAR}`);
    output.stdout("");
    output.stdout("  Next:  snabbsajt pull");
  }

  if (tokenWrite.unignored) {
    output.stderr(
      `warning: ${ENV_FILE} does not appear to be gitignored. Add it to .gitignore before you commit — ${TOKEN_ENV_VAR} is a credential.`,
    );
  }
  return 0;
}

async function runUnlink(
  args: string[],
  asJson: boolean,
  output: Output,
  deps: LinkDeps,
): Promise<number> {
  const cwd = process.cwd();
  const config = readProjectConfig(cwd);
  const token = readDeliveryToken(cwd);
  if (!config && !token) {
    throw new LinkError("no_link", `Nothing to unlink — no ${PROJECT_FILE} in this directory.`);
  }

  // Revoke BEFORE deleting the local copy. The other order leaves a live
  // credential behind with nothing left on disk that could ever revoke it,
  // which is the exact state someone runs `unlink` to avoid.
  let revoked = false;
  if (token) {
    const fetchImpl = deps.fetch ?? globalThis.fetch;
    try {
      const { status } = await postJson(
        fetchImpl,
        `${baseUrl(optionValue(args, "--api-url") ?? config?.apiUrl ?? deps.apiUrl)}/v1/cli/tokens/revoke`,
        {},
        { Authorization: `Bearer ${token}` },
      );
      revoked = status === 200;
    } catch {
      revoked = false;
    }
  }

  const configRemoved = removeProjectConfig(cwd);
  const envRemoved = removeEnvVar(cwd, TOKEN_ENV_VAR);

  if (asJson) {
    json(output, { ok: true, command: "unlink", revoked, configRemoved, envRemoved });
  } else {
    output.stdout(`✓ Unlinked     ${displayPath(cwd)}`);
    if (configRemoved) output.stdout(`  Removed      ${PROJECT_FILE}`);
    if (envRemoved) output.stdout(`  Removed      ${TOKEN_ENV_VAR} from ${ENV_FILE}`);
    output.stdout(
      revoked
        ? "  The read key was revoked — it no longer works anywhere."
        : "  Could not reach the server, so the read key may still be active. Revoke it in SnabbSajt under Inställningar → Leverans.",
    );
  }
  // Local state is gone either way; a failed revoke is reported, not fatal,
  // because leaving the files behind would be worse.
  return 0;
}

function usage(output: Output): void {
  output.stdout(`Usage:
  snabbsajt link [--site <slug|id>] [--yes] [--relink] [--status] [--api-url <url>] [--json]
  snabbsajt unlink [--json]

link connects THIS directory to one of your sites. It prints a code, you approve
the terminal once in the browser, and then you pick the site here with the arrow
keys. It writes ${PROJECT_FILE} (safe to commit) and ${TOKEN_ENV_VAR}
into ${ENV_FILE} (a secret — gitignore it), and nothing outside this directory.

The approval is single-use, expires in 10 minutes, and can only ever produce a
read-only key for one site you own. unlink revokes that key and removes both.

  --site   pick without the prompt, by slug or id
  --yes    accept the only match; fails when there is more than one
  --relink skip the menu and go straight to the picker
  --status print the current link and exit (writes nothing)
  --json   machine output; never prompts, and requires --site when ambiguous`);
}

export async function runLinkCommand(
  rawArgs: string[],
  output: Output = consoleOutput,
  deps: LinkDeps = {},
): Promise<number> {
  const asJson = rawArgs.includes("--json");
  const args = rawArgs.filter((arg) => arg !== "--json");
  const [command, ...rest] = args;
  try {
    if (!command || ["help", "--help", "-h"].includes(command)) {
      usage(output);
      return 0;
    }
    if (command === "link") return await runLink(rest, asJson, output, deps);
    if (command === "unlink") return await runUnlink(rest, asJson, output, deps);
    throw new LinkError("unknown_command", `unknown command "${command}"`);
  } catch (error) {
    if (error instanceof PromptCancelled) {
      // 130 is what a shell reports for SIGINT, and nothing has been written by
      // the time a prompt can be cancelled.
      if (!asJson) output.stderr("");
      return 130;
    }
    if (error instanceof LinkError) {
      // `code` is the stable contract for agents; `error` is prose that may be
      // reworded. Branch on the first, show the second.
      if (asJson) json(output, { ok: false, code: error.code, error: error.message });
      else output.stderr(`snabbsajt: ${error.message}`);
      return 1;
    }
    throw error;
  }
}
