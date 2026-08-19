import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createDeliveryClient, DeliveryError } from "@snabbsajt/site-kit";
import {
  ConnectError,
  DEFAULT_API_URL,
  startDeviceAuth,
  waitForApproval,
  type DeviceAuthOptions,
} from "./connect/deviceAuth";
import {
  ENV_FILE,
  PROJECT_FILE,
  TOKEN_ENV_VAR,
  readDeliveryToken,
  readProjectConfig,
  writeDeliveryToken,
  writeProjectConfig,
} from "./connect/project";
import { openBrowser, shouldAutoOpen } from "./openBrowser";
import { consoleOutput, type Output } from "../output";

// ---------------------------------------------------------------------------
// `snabbsajt connect` and `snabbsajt pull`.
//
// connect: pair this directory with one SnabbSajt site. The developer runs one
//          command, approves it in a browser, and the project is wired.
// pull:    fetch that site's published content to disk, so a build can render
//          it without a network call and a developer can read what they got.
//
// Neither command can change the customer's site. The credential involved is
// read-only and single-site by construction — there is no write path here.
// ---------------------------------------------------------------------------

const DEFAULT_PULL_TARGET = "snabbsajt/published.json";

function json(output: Output, payload: unknown): void {
  output.stdout(JSON.stringify(payload, null, 2));
}

function optionValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new ConnectError(`${flag} requires a value`);
  }
  return value;
}

function clientHint(): string {
  return `@snabbsajt/cli (${process.platform})`;
}

async function runConnect(
  args: string[],
  asJson: boolean,
  output: Output,
  deps: DeviceAuthOptions = {},
): Promise<number> {
  const cwd = process.cwd();
  const apiUrl = optionValue(args, "--api-url") ?? deps.apiUrl;

  const start = await startDeviceAuth({ ...deps, apiUrl, client: clientHint() });

  if (asJson) {
    // A machine caller (an agent, a script) gets the code immediately so it can
    // surface the URL its own way, then we block on the same wait below.
    json(output, {
      ok: true,
      command: "connect",
      stage: "awaiting-approval",
      userCode: start.userCode,
      verificationUrl: start.verificationUrl,
    });
  } else {
    // Same rule as `admin pair`: open it for a human who is watching, but print
    // the URL first and always, because the browser we open may be the wrong
    // one — or on the wrong machine, over SSH.
    const opened =
      !args.includes("--no-open") &&
      shouldAutoOpen(deps.browser) &&
      openBrowser(start.verificationUrl, deps.browser);

    output.stdout("");
    output.stdout(`  Open   ${start.verificationUrl}`);
    output.stdout(`  Code   ${start.userCode}`);
    output.stdout("");
    if (opened) output.stdout("  Opened that page in your browser.");
    output.stdout("  Waiting for you to approve this terminal…");
  }

  const approved = await waitForApproval(start, { ...deps, apiUrl });

  writeProjectConfig(cwd, {
    siteId: approved.websiteId,
    apiUrl: apiUrl || process.env.SNABBSAJT_API_URL || DEFAULT_API_URL,
    ...(approved.siteName ? { siteName: approved.siteName } : {}),
    ...(approved.slug ? { slug: approved.slug } : {}),
  });
  const tokenWrite = writeDeliveryToken(cwd, approved.token);

  if (asJson) {
    json(output, {
      ok: true,
      command: "connect",
      stage: "connected",
      siteId: approved.websiteId,
      siteName: approved.siteName,
      projectFile: PROJECT_FILE,
      envFile: ENV_FILE,
      envAction: tokenWrite.action,
      // Never the token itself: --json output lands in CI logs.
      tokenWritten: true,
      warning: tokenWrite.unignored ? "env-file-not-gitignored" : undefined,
    });
  } else {
    output.stdout("");
    output.stdout(`  Connected to ${approved.siteName ?? approved.websiteId}.`);
    output.stdout(`  ${PROJECT_FILE} written (safe to commit).`);
    output.stdout(`  ${TOKEN_ENV_VAR} ${tokenWrite.action} in ${ENV_FILE}.`);
    output.stdout("");
    output.stdout("  Next:  snabbsajt pull");
  }

  if (tokenWrite.unignored) {
    // stderr, always, in both modes. A token in a tracked file is the one
    // mistake here that cannot be undone by editing a file afterwards.
    output.stderr(
      `warning: ${ENV_FILE} does not appear to be gitignored. Add it to .gitignore before you commit — ${TOKEN_ENV_VAR} is a credential.`,
    );
  }
  return 0;
}

async function runPull(
  args: string[],
  asJson: boolean,
  output: Output,
  deps: { fetch?: typeof globalThis.fetch } = {},
): Promise<number> {
  const cwd = process.cwd();
  const config = readProjectConfig(cwd);
  if (!config) {
    throw new ConnectError(
      `No ${PROJECT_FILE} in this directory. Run \`snabbsajt connect\` first.`,
    );
  }
  const token = readDeliveryToken(cwd);
  if (!token) {
    throw new ConnectError(
      `No ${TOKEN_ENV_VAR} found in the environment or ${ENV_FILE}. Run \`snabbsajt connect\` again, or set it in your secret store.`,
    );
  }

  const target = resolve(cwd, optionValue(args, "-o") ?? DEFAULT_PULL_TARGET);
  const locale = optionValue(args, "--locale");

  // `--stage draft` pulls the UNPUBLISHED draft: staging, for a preview
  // deployment. Anything that is not exactly "draft" is production, including a
  // typo, because a stage flag must never fail open towards the more powerful
  // read. It is refused up front when the token in hand is a production one:
  // the server answers that case with a bare 401 on purpose (it must not tell a
  // token holder that a stronger credential exists), which would otherwise
  // reach the developer as "your token was revoked".
  const stageArg = optionValue(args, "--stage");
  if (stageArg !== undefined && stageArg !== "draft" && stageArg !== "published") {
    throw new ConnectError(
      `Unknown --stage "${stageArg}". Use \`--stage draft\` for the unpublished version, or leave it out for the published one.`,
    );
  }
  const stage = stageArg === "draft" ? ("draft" as const) : ("published" as const);
  if (stage === "draft" && !token.startsWith("sajt_draft_")) {
    throw new ConnectError(
      `${TOKEN_ENV_VAR} is a published-content key, so it cannot read the unpublished version. Create a test-version key in SnabbSajt (Settings > AI integrations > keys) and put it in your preview environment.`,
    );
  }

  const client = createDeliveryClient({
    siteId: config.siteId,
    token,
    baseUrl: config.apiUrl,
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
  });

  let published;
  try {
    published = await client.getPublishedSite({
      ...(locale && stage === "published"
        ? { locale: locale as "sv" | "en" | "pl" }
        : {}),
      ...(stage === "draft" ? { stage } : {}),
    });
  } catch (error) {
    if (error instanceof DeliveryError) {
      // Translate the reason into the sentence that tells a developer what to
      // DO. The raw reason is still available on --json for tooling.
      const advice: Record<string, string> = {
        unauthorized:
          stage === "draft"
            ? `The test-version key was refused. It may have been revoked, or it belongs to a different site.`
            : `The delivery token was refused. It may have been revoked, or it belongs to a different site. Run \`snabbsajt connect\` again.`,
        not_published:
          stage === "draft"
            ? `This site has more pages than one snapshot can hold, so neither the test version nor a publish can be built. Open it in SnabbSajt to see which pages to remove.`
            : `This site has never been published. Publish it once in SnabbSajt, then run \`snabbsajt pull\` again.`,
        rate_limited: `Rate limited by the server. Wait a moment and try again.`,
        network: `Could not reach ${config.apiUrl}.`,
        malformed: `The server's answer was not a published snapshot.`,
      };
      throw new ConnectError(advice[error.reason] ?? error.message);
    }
    throw error;
  }

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(published, null, 2)}\n`, "utf8");

  const pageCount = Array.isArray(published.snapshot?.pages)
    ? published.snapshot.pages.length
    : 0;
  // A draft carries no version, by design. Reporting one anyway - even an
  // "unknown" placeholder in a build log - is how a staging artefact gets
  // mistaken for a production one later.
  const versionId =
    "versionId" in published ? (published.versionId as string) : undefined;
  const publishedAt =
    "publishedAt" in published ? (published.publishedAt as number) : undefined;

  if (asJson) {
    json(output, {
      ok: true,
      command: "pull",
      siteId: published.siteId,
      stage,
      ...(versionId ? { versionId } : {}),
      ...(publishedAt ? { publishedAt } : {}),
      pages: pageCount,
      file: target,
    });
  } else {
    const site = config.siteName ?? config.siteId;
    const plural = pageCount === 1 ? "" : "s";
    output.stdout(
      stage === "draft"
        ? `Pulled ${pageCount} page${plural} from ${site} (unpublished version).`
        : `Pulled ${pageCount} page${plural} from ${site} (version ${versionId}).`,
    );
    output.stdout(`Written to ${target}`);
  }
  return 0;
}

function usage(output: Output): void {
  output.stdout(`Usage:
  snabbsajt connect [--api-url <url>] [--json]
  snabbsajt pull [-o <file>] [--locale sv|en|pl] [--stage draft] [--json]

connect pairs this directory with one SnabbSajt site: it prints a code, you
approve it in the browser, and it writes ${PROJECT_FILE} (safe to commit) plus
${TOKEN_ENV_VAR} into ${ENV_FILE} (a secret — gitignore it).

pull fetches that site's published content to ${DEFAULT_PULL_TARGET}. The token
is read-only and scoped to one site; neither command can change the site.

--stage draft fetches the UNPUBLISHED version instead, for a preview
deployment. It needs a separate test-version key (sajt_draft_…), created in
SnabbSajt: the ordinary key cannot read unpublished work.`);
}

export async function runConnectCommand(
  rawArgs: string[],
  output: Output = consoleOutput,
  deps: DeviceAuthOptions & { fetch?: typeof globalThis.fetch } = {},
): Promise<number> {
  const asJson = rawArgs.includes("--json");
  const args = rawArgs.filter((arg) => arg !== "--json");
  const [command, ...rest] = args;
  try {
    if (!command || ["help", "--help", "-h"].includes(command)) {
      usage(output);
      return 0;
    }
    if (command === "connect") return await runConnect(rest, asJson, output, deps);
    if (command === "pull") return await runPull(rest, asJson, output, deps);
    throw new ConnectError(`unknown command "${command}"`);
  } catch (error) {
    if (error instanceof ConnectError) {
      if (asJson) json(output, { ok: false, error: error.message });
      else output.stderr(`snabbsajt: ${error.message}`);
      return 1;
    }
    throw error;
  }
}
