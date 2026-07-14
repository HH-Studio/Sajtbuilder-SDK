#!/usr/bin/env node

import { runSiteCommand } from "./commands/site";
import { runSkillsCommand } from "./commands/skills";

function usage(): void {
  console.log(`SnabbSajt CLI

Usage:
  snabbsajt site init <dir> [--template nextjs|html] [--json]
  snabbsajt site import html <url|file.html|site.zip> [-o package-dir] [--json]
  snabbsajt site import approve <package-dir> --yes [--json]
  snabbsajt site inspect <site.json|dir> [--json]
  snabbsajt site validate <site.json|dir> [--json]
  snabbsajt site pack <dir> [-o bundle.zip] [--review-draft] [--json]
  snabbsajt site doctor [--json]
  snabbsajt skills install --agent auto|codex|claude|all [--global] [--force] [--json]
  snabbsajt skills list --agent auto|codex|claude|all [--global] [--json]
  snabbsajt skills doctor --agent auto|codex|claude|all [--global] [--json]

No API key is required. Commands run locally. Skill installs are project-local
unless you explicitly pass --global.`);
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.length === 0 || ["help", "--help", "-h"].includes(args[0])) {
    usage();
    return 0;
  }
  const [namespace, ...rest] = args;
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
