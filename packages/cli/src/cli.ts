#!/usr/bin/env node

import { runAdminCommand } from "./commands/admin";
import { runConnectCommand } from "./commands/connect";
import { runLinkCommand } from "./commands/link";
import { cliVersion, runSiteCommand } from "./commands/site";
import { runSkillsCommand } from "./commands/skills";
import { maybeNotifyUpdate, runUpgradeCommand } from "./update";
import { consoleOutput } from "./output";

function usage(): void {
  consoleOutput.stdout(`SnabbSajt CLI

Usage:
  snabbsajt --version
  snabbsajt link [--site <slug|id>] [--yes] [--relink] [--status] [--json]
  snabbsajt unlink [--json]
  snabbsajt pull [-o <file>] [--locale sv|en|pl] [--json]
  snabbsajt upgrade [--yes] [--json]
  snabbsajt connect [--api-url <url>] [--json]
  snabbsajt admin pair [--scopes a,b,c] [--api-url <url>] [--json]
  snabbsajt admin tools [--app-url <url>] [--json]
  snabbsajt admin run <tool> [--args '<json>'] [--app-url <url>] [--json]
  snabbsajt site init <dir> [--template nextjs|html] [--json]
  snabbsajt site import html <url|file.html|site.zip> [-o package-dir] [--json]
  snabbsajt site import wordpress --url <public-url> --wxr <export.xml> --out <package-dir> [--json]
  snabbsajt site import approve <package-dir> --yes [--json]
  snabbsajt site inspect <site.json|dir> [--json]
  snabbsajt site validate <site.json|dir> [--json]
  snabbsajt site pack <dir> [-o bundle.zip] [--review-draft] [--json]
  snabbsajt site doctor [--json]
  snabbsajt skills install --agent auto|codex|claude|all [--global] [--force] [--json]
  snabbsajt skills list --agent auto|codex|claude|all [--global] [--json]
  snabbsajt skills doctor --agent auto|codex|claude|all [--global] [--json]

link is where most people start: it connects this directory to one of your sites,
which you pick right here with the arrow keys. connect is the older flow that
picks the site in the browser instead; both end with the same read-only,
single-site token and neither can change anything. admin holds the only
credential in this CLI that can: a separate, capability-scoped token in its own
SNABBSAJT_ADMIN_TOKEN variable, so pull never holds write power.
Every site and skills command runs entirely locally and needs no credentials at all.
Skill installs are project-local unless you explicitly pass --global.`);
}

/** Commands that live at the top level rather than under a namespace, because
 *  they are the first thing a new developer types and `snabbsajt site link`
 *  would put a word between them and the thing they want. */
const CONNECT_COMMANDS = new Set(["connect", "pull"]);
const LINK_COMMANDS = new Set(["link", "unlink"]);

/** Commands after which it is fair to ask "want to upgrade?" — the human just
 *  answered a prompt, so one more question is not an ambush. Everything else
 *  gets the passive notice. */
const INTERACTIVE_COMMANDS = new Set(["link", "connect"]);

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.length === 0 || ["help", "--help", "-h"].includes(args[0])) {
    usage();
    return 0;
  }
  // clig.dev expects --version to exist even though `site doctor` reports more.
  // Only the CLI's own version is needed here, so a missing peer install must
  // not turn a version check into an error.
  if (["--version", "-v", "version"].includes(args[0]!)) {
    try {
      consoleOutput.stdout(cliVersion());
    } catch {
      consoleOutput.stderr("snabbsajt: could not resolve the installed CLI version");
      return 1;
    }
    return 0;
  }
  const [namespace, ...rest] = args;
  if (namespace === "upgrade") {
    return runUpgradeCommand(rest, safeVersion(), consoleOutput);
  }
  if (LINK_COMMANDS.has(namespace!)) {
    return runLinkCommand(args, consoleOutput, { version: safeVersion() });
  }
  if (CONNECT_COMMANDS.has(namespace!)) return runConnectCommand(args);
  // Routed before the shared "namespace with no subcommand" branch below, so a
  // bare `snabbsajt admin` prints the admin usage rather than the global one —
  // the credential rules are the thing a reader needs at that moment.
  if (namespace === "admin") return runAdminCommand(rest);
  if (namespace !== "site" && namespace !== "skills") {
    consoleOutput.stderr(`snabbsajt: unknown command "${namespace}"`);
    return 1;
  }
  if (rest.length === 0 || ["help", "--help", "-h"].includes(rest[0])) {
    usage();
    return 0;
  }
  return namespace === "site" ? runSiteCommand(rest) : runSkillsCommand(rest);
}

/** The version, or a floor that makes every comparison say "you are old". A
 *  broken install must not crash a command over a cosmetic banner. */
function safeVersion(): string {
  try {
    return cliVersion();
  } catch {
    return "0.0.0";
  }
}

const code = await main();
// AFTER the command, never before, and never on stdout. The check is cached for
// a day, times out in 1.5s, and swallows every error - it can slow a command
// down by at most that, and can never fail one.
await maybeNotifyUpdate(safeVersion(), {
  asJson: process.argv.includes("--json"),
  failed: code !== 0,
  offer: INTERACTIVE_COMMANDS.has(process.argv[2] ?? ""),
  now: Date.now(),
});
process.exitCode = code;
