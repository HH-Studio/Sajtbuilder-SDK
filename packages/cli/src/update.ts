import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { confirm } from "./prompt";
import { consoleOutput, type Output } from "./output";

// ---------------------------------------------------------------------------
// "There is a newer version" — the notice, and the upgrade.
//
// Deliberately two separate things. The NOTICE is passive, cached and
// unskippable-in-a-good-way: it costs the user nothing and it is the only
// reason anybody ever upgrades a CLI. The UPGRADE runs a package manager on
// their machine, so it never happens without an explicit yes and it defaults
// to no.
//
// Five rules, each one a bug some other tool shipped:
//
//   1. The check can never delay or fail a command. 1.5s timeout, every error
//      swallowed, and the result is only ever printed AFTER the real work.
//   2. Never on stdout. A version notice that lands in a pipe corrupts the
//      output of the command the user actually ran.
//   3. Silent under --json, without a TTY, in CI, when SNABBSAJT_NO_UPDATE_CHECK
//      is set, and when the command already failed. Nobody wants a version
//      nudge stacked on top of an error.
//   4. Compare semver, not strings. "0.10.0" < "0.9.0" is how a CLI ends up
//      telling people to downgrade.
//   5. Send nothing. It is a plain GET of a public registry document — no id,
//      no telemetry, no ping.
// ---------------------------------------------------------------------------

const REGISTRY_URL = "https://registry.npmjs.org/@snabbsajt/cli/latest";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 1500;

function cacheDir(): string {
  return join(homedir(), ".snabbsajt");
}

function cachePath(): string {
  return join(cacheDir(), "update-check.json");
}

type Cache = { checkedAt: number; latest: string };

function readCache(): Cache | undefined {
  try {
    const raw = JSON.parse(readFileSync(cachePath(), "utf8")) as Partial<Cache>;
    if (typeof raw.checkedAt !== "number" || typeof raw.latest !== "string") return undefined;
    return { checkedAt: raw.checkedAt, latest: raw.latest };
  } catch {
    return undefined;
  }
}

function writeCache(cache: Cache): void {
  try {
    // 0700 on the directory, not just the file: this is the same directory any
    // future per-machine state would live in, and a world-readable dot-dir is
    // the kind of default nobody revisits.
    mkdirSync(cacheDir(), { recursive: true, mode: 0o700 });
    writeFileSync(cachePath(), `${JSON.stringify(cache)}\n`, { encoding: "utf8", mode: 0o600 });
  } catch {
    // A read-only or missing HOME must not break a command. Worst case we check
    // the registry again next time.
  }
}

/** -1, 0 or 1. Numeric per component, so 0.10.0 sorts above 0.9.0. A
 *  prerelease suffix ("1.0.0-beta.2") is ignored for ordering and only breaks a
 *  tie towards the release, which is the conservative direction: we would
 *  rather stay quiet than nag someone running a prerelease. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/, "")
      .split("-")[0]!
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l !== r) return l < r ? -1 : 1;
  }
  const aPre = a.includes("-");
  const bPre = b.includes("-");
  if (aPre !== bPre) return aPre ? -1 : 1;
  return 0;
}

/** True when we may print a notice at all. */
export function updateChecksEnabled(asJson: boolean): boolean {
  if (asJson) return false;
  if (process.env.SNABBSAJT_NO_UPDATE_CHECK) return false;
  if (process.env.CI) return false;
  return Boolean(process.stderr.isTTY);
}

async function fetchLatest(
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<string | undefined> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetchImpl(REGISTRY_URL, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return undefined;
      const body = (await response.json()) as { version?: string };
      return typeof body.version === "string" ? body.version : undefined;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Offline, blocked, slow, rate limited, malformed — all the same answer:
    // say nothing. This function's contract is that it cannot fail loudly.
    return undefined;
  }
}

/** The newest published version, from cache when fresh. `undefined` when we do
 *  not know and could not find out. */
export async function latestVersion(
  now: number,
  deps: { fetch?: typeof globalThis.fetch } = {},
): Promise<string | undefined> {
  const cached = readCache();
  if (cached && now - cached.checkedAt < CACHE_TTL_MS) return cached.latest;
  const latest = await fetchLatest(deps.fetch);
  if (latest) writeCache({ checkedAt: now, latest });
  return latest ?? cached?.latest;
}

export type InstallKind = "npx" | "npm" | "pnpm" | "yarn" | "bun" | "local" | "unknown";

/** How this CLI got onto the machine, which decides what "upgrade" even means.
 *
 *  `npm_config_user_agent` alone is not enough — it is empty under `npx` in
 *  several shells — so the install PATH is the primary signal and the user
 *  agent only breaks ties between the global managers. */
export function detectInstall(
  execPath: string = process.argv[1] ?? "",
  userAgent: string = process.env.npm_config_user_agent ?? "",
): InstallKind {
  const path = execPath.replace(/\\/g, "/");
  if (path.includes("/_npx/") || path.includes("/.npm/_npx")) return "npx";
  if (path.includes("/.bun/install/cache/")) return "npx";
  if (path.includes("/node_modules/.bin/") && !path.includes("/lib/node_modules/")) {
    // Inside a project's own node_modules: this is a dependency of their repo,
    // and bumping it is a package.json edit that belongs to them, not to us.
    return "local";
  }
  // PATH BEFORE USER AGENT, always. The user agent describes whichever tool is
  // running the process right now — `bunx snabbsajt …` reports "bun" for a CLI
  // that npm installed globally — so trusting it first prints the wrong upgrade
  // command for the most common setup there is.
  if (path.includes("/pnpm/")) return "pnpm";
  if (path.includes("/.bun/bin/")) return "bun";
  if (path.includes("/lib/node_modules/") || path.includes("/npm/")) return "npm";
  // Only now, as a tiebreak for a layout none of the above recognised.
  if (userAgent.startsWith("pnpm")) return "pnpm";
  if (userAgent.startsWith("yarn")) return "yarn";
  if (userAgent.startsWith("bun")) return "bun";
  return "unknown";
}

/** The exact command to type, or null when there is nothing to type. */
export function upgradeCommand(kind: InstallKind): string | null {
  switch (kind) {
    case "npm":
      return "npm install -g @snabbsajt/cli@latest";
    case "pnpm":
      return "pnpm add -g @snabbsajt/cli@latest";
    case "yarn":
      return "yarn global add @snabbsajt/cli@latest";
    case "bun":
      return "bun add -g @snabbsajt/cli@latest";
    case "local":
      return "npm install --save-dev @snabbsajt/cli@latest";
    case "npx":
      return null;
    default:
      return "npm install -g @snabbsajt/cli@latest";
  }
}

/** Print the notice, if there is one to print. Never throws. */
export async function maybeNotifyUpdate(
  currentVersion: string,
  options: {
    asJson: boolean;
    failed: boolean;
    now: number;
    /** Offer to upgrade right here. Only true after a command that already had
     *  the human's attention and their hands on the keyboard (`link`,
     *  `connect`) — never after one they piped somewhere. */
    offer?: boolean;
    output?: Output;
    fetch?: typeof globalThis.fetch;
    confirm?: (question: string, defaultYes: boolean, output: Output) => Promise<boolean>;
    run?: (command: string) => number;
  },
): Promise<string | undefined> {
  const output = options.output ?? consoleOutput;
  if (options.failed || !updateChecksEnabled(options.asJson)) return undefined;
  let latest: string | undefined;
  try {
    latest = await latestVersion(options.now, { ...(options.fetch ? { fetch: options.fetch } : {}) });
  } catch {
    return undefined;
  }
  if (!latest || compareVersions(currentVersion, latest) >= 0) return undefined;

  output.stderr("");
  output.stderr(`Update available for SnabbSajt CLI (v${currentVersion} → v${latest})`);
  output.stderr(
    `Changelog: https://github.com/HH-Studio/Sajtbuilder-SDK/releases/tag/v${latest}`,
  );
  const command = upgradeCommand(detectInstall());
  if (!command) {
    output.stderr("You are running it through npx — the next run fetches the new version.");
    return latest;
  }
  // The prompt only appears where a human is already answering questions. A
  // notice is free; a question in the wrong place is an interruption, and one
  // that runs a package manager is worse than an interruption.
  if (options.offer && process.stdin.isTTY) {
    output.stderr("");
    await offerUpgrade(command, output, {
      ...(options.confirm ? { confirm: options.confirm } : {}),
      ...(options.run ? { run: options.run } : {}),
    });
  } else {
    output.stderr(`Upgrade:   ${command}`);
  }
  return latest;
}

/** Ask, then actually upgrade. Returns the exit code of the package manager, or
 *  0 when the human said no.
 *
 *  The prompt defaults to NO. Vercel's defaults to yes and gets away with it
 *  because its CLI is self-installed; ours is usually run through npx, where
 *  the question is meaningless, and running a package manager against someone's
 *  carefully pinned global toolchain because they hit Enter is not a thing to
 *  do by default. The command is printed either way, so a "no" still leaves
 *  them with something to paste. */
export async function offerUpgrade(
  command: string,
  output: Output,
  deps: {
    confirm?: (question: string, defaultYes: boolean, output: Output) => Promise<boolean>;
    run?: (command: string) => number;
    assumeYes?: boolean;
  } = {},
): Promise<number> {
  const ask = deps.confirm ?? confirm;
  const yes = deps.assumeYes || (await ask("? Would you like to upgrade now?", false, output));
  if (!yes) {
    output.stdout(`To upgrade later:  ${command}`);
    return 0;
  }
  const run =
    deps.run ??
    ((cmd: string) => {
      // `shell: true` is safe here and only here: `cmd` is one of OUR five
      // constant strings from `upgradeCommand`, never anything derived from
      // user input, a config file or the network.
      const result = spawnSync(cmd, { stdio: "inherit", shell: true });
      return result.status ?? 1;
    });
  output.stdout(`Running:  ${command}`);
  return run(command);
}

/** `snabbsajt upgrade`. */
export async function runUpgradeCommand(
  rawArgs: string[],
  currentVersion: string,
  output: Output = consoleOutput,
  deps: {
    fetch?: typeof globalThis.fetch;
    now?: number;
    confirm?: (question: string, defaultYes: boolean, output: Output) => Promise<boolean>;
    run?: (command: string) => number;
  } = {},
): Promise<number> {
  const asJson = rawArgs.includes("--json");
  const assumeYes = rawArgs.includes("--yes") || rawArgs.includes("-y");
  const now = deps.now ?? Date.now();
  const kind = detectInstall();
  const command = upgradeCommand(kind);
  const latest = await latestVersion(now, { ...(deps.fetch ? { fetch: deps.fetch } : {}) });

  if (asJson) {
    output.stdout(
      JSON.stringify(
        {
          ok: true,
          current: currentVersion,
          latest: latest ?? null,
          install: kind,
          command,
          upToDate: latest ? compareVersions(currentVersion, latest) >= 0 : null,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  if (!latest) {
    output.stderr("Could not reach the npm registry, so I cannot tell you what is newest.");
    if (command) output.stdout(`To upgrade anyway:  ${command}`);
    return 1;
  }
  if (compareVersions(currentVersion, latest) >= 0) {
    output.stdout(`Already on the newest version (v${currentVersion}).`);
    return 0;
  }

  output.stdout(`SnabbSajt CLI v${currentVersion} → v${latest}`);
  if (!command) {
    output.stdout("");
    output.stdout("You are running it through npx, so there is nothing to upgrade —");
    output.stdout("the next `npx @snabbsajt/cli` fetches the new version by itself.");
    return 0;
  }
  if (kind === "local") {
    // Never offer to run this one. It edits THEIR package.json, and a version
    // bump in a repo is a commit somebody reviews, not a side effect of asking
    // a CLI about itself.
    output.stdout("");
    output.stdout("It is a dependency of this repository, so the bump belongs in its");
    output.stdout("package.json. Run:");
    output.stdout(`  ${command}`);
    return 0;
  }
  output.stdout("");
  return await offerUpgrade(command, output, {
    ...(deps.confirm ? { confirm: deps.confirm } : {}),
    ...(deps.run ? { run: deps.run } : {}),
    assumeYes,
  });
}
