#!/usr/bin/env node

import { runAdminCommand } from "./commands/admin";
import { runConnectCommand } from "./commands/connect";
import { cliVersion, runSiteCommand } from "./commands/site";
import { runSkillsCommand } from "./commands/skills";

function usage(): void {
  console.log(`SnabbSajt CLI

Usage:
  snabbsajt --version
  snabbsajt connect [--api-url <url>] [--json]
  snabbsajt pull [-o <file>] [--locale sv|en|pl] [--json]
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

connect and pull talk to a SnabbSajt site you already own, using a read-only,
single-site token they obtain for you — they cannot change anything. admin holds
the only credential in this CLI that can: a separate, capability-scoped token in
its own SNABBSAJT_ADMIN_TOKEN variable, so pull never holds write power. Every
site and skills command runs entirely locally and needs no credentials at all.
Skill installs are project-local unless you explicitly pass --global.`);
}

/** Commands that live at the top level rather than under a namespace, because
 *  they are the first thing a new developer types and `snabbsajt site connect`
 *  would put a word between them and the thing they want. */
const TOP_LEVEL = new Set(["connect", "pull"]);

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
      console.log(cliVersion());
    } catch {
      console.error("snabbsajt: could not resolve the installed CLI version");
      return 1;
    }
    return 0;
  }
  const [namespace, ...rest] = args;
  if (TOP_LEVEL.has(namespace!)) return runConnectCommand(args);
  // Routed before the shared "namespace with no subcommand" branch below, so a
  // bare `snabbsajt admin` prints the admin usage rather than the global one —
  // the credential rules are the thing a reader needs at that moment.
  if (namespace === "admin") return runAdminCommand(rest);
  if (namespace !== "site" && namespace !== "skills") {
    console.error(`snabbsajt: unknown command "${namespace}"`);
    return 1;
  }
  if (rest.length === 0 || ["help", "--help", "-h"].includes(rest[0])) {
    usage();
    return 0;
  }
  return namespace === "site" ? runSiteCommand(rest) : runSkillsCommand(rest);
}

process.exitCode = await main();
