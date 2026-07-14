#!/usr/bin/env node

import { runSiteCommand } from "./commands/site";

function usage(): void {
  console.log(`SnabbSajt CLI

Usage:
  snabbsajt site init <dir> [--template nextjs|html] [--json]
  snabbsajt site inspect <site.json|dir> [--json]
  snabbsajt site validate <site.json|dir> [--json]
  snabbsajt site pack <dir> [-o bundle.zip] [--json]
  snabbsajt site doctor [--json]

No API key is required. These commands run locally.`);
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.length === 0 || ["help", "--help", "-h"].includes(args[0])) {
    usage();
    return 0;
  }
  const [namespace, ...rest] = args;
  if (namespace !== "site") {
    console.error(`snabbsajt: unknown command "${namespace}"`);
    return 1;
  }
  if (rest.length === 0 || ["help", "--help", "-h"].includes(rest[0])) {
    usage();
    return 0;
  }
  return runSiteCommand(rest);
}

process.exitCode = await main();
