import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { consoleOutput, type Output } from "../output";
import { runLinkCommand } from "./link";
import { runAdminCommand } from "./admin";
import { runSkillsCommand } from "./skills";
import {
  BLOCKS_FILE,
  COLLECTIONS_FILE,
  COMPONENTS_FILE,
  PAGE_FILE,
  REVALIDATE_ROUTE_FILE,
  SITE_KIT,
} from "./initTemplates";

// ---------------------------------------------------------------------------
// `snabbsajt init --agency`: one command, one pairing.
//
// Plan: docs/plans/doing/P0-2026-08-19-agency-program-master.md slice 1.5.
//
// An agency already has a Next.js repository. What they do not have is an hour
// to spend reading three docs to learn which four commands to run in which
// order, and the order matters: a pairing before the scaffold leaves a repo
// that pairs but cannot render, and a scaffold before the dependency leaves an
// import nothing resolves.
//
// So this runs the steps and says what it did. It ORCHESTRATES the existing
// commands rather than reimplementing them: `link` still mints the read token,
// `admin pair` still mints the write one, `skills install` still writes the
// skills. Every one of those keeps working on its own, and a bug fixed there is
// fixed here.
//
// Two rules it never breaks:
//
//  * **It never overwrites a file it did not write.** An agency runs this in a
//    repository that already earns them money. A scaffold that clobbers their
//    `app/[[...slug]]/page.tsx` is worse than one that refuses, so an existing
//    file is reported as kept, and `--force` is the only way past it.
//  * **It never installs packages behind your back.** The dependency is written
//    into `package.json` and the install is named, because an agency's lockfile
//    is theirs and a CLI that silently runs their package manager is a CLI they
//    stop trusting.
// ---------------------------------------------------------------------------

export class InitError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "InitError";
  }
}

export type ScaffoldResult = {
  /** Files this run created. */
  written: string[];
  /** Files that were already there, left exactly as they were. */
  kept: string[];
  /** True when `package.json` gained the dependency. */
  addedDependency: boolean;
};

/** Where a Next.js app's routes live in THIS repository.
 *
 *  `src/app` and `app` are both idiomatic, and mixing them silently produces a
 *  route Next.js never serves, which is a bad first five minutes. An existing
 *  layout wins; a repo with neither gets `app`, the current default. */
export function appDirectoryFor(cwd: string): string {
  if (existsSync(join(cwd, "src", "app"))) return join(cwd, "src", "app");
  return join(cwd, "app");
}

function writeIfAbsent(
  path: string,
  contents: string,
  force: boolean,
  result: ScaffoldResult,
): void {
  if (existsSync(path) && !force) {
    result.kept.push(path);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  result.written.push(path);
}

/** Put the four files and the dependency in place. Pure filesystem work, so the
 *  scaffold can be tested without a network, a token or a browser. */
export function scaffoldAgencyProject(cwd: string, force = false): ScaffoldResult {
  const packageJsonPath = join(cwd, "package.json");
  if (!existsSync(packageJsonPath)) {
    throw new InitError(
      "not_a_project",
      "no package.json here; run this inside your app's repository",
    );
  }
  const result: ScaffoldResult = { written: [], kept: [], addedDependency: false };

  writeIfAbsent(join(cwd, "snabbsajt", "blocks.ts"), BLOCKS_FILE, force, result);
  writeIfAbsent(join(cwd, "snabbsajt", "collections.ts"), COLLECTIONS_FILE, force, result);
  writeIfAbsent(join(cwd, "snabbsajt", "components.ts"), COMPONENTS_FILE, force, result);
  writeIfAbsent(
    join(appDirectoryFor(cwd), "[[...slug]]", "page.tsx"),
    PAGE_FILE,
    force,
    result,
  );

  // The receiving end of "publishing pokes their host, cheaply first". Written
  // by init rather than left to the agency: it is not optional wiring, it is
  // the difference between a publish appearing in seconds and a paid rebuild.
  writeIfAbsent(
    join(appDirectoryFor(cwd), "api", "snabbsajt", "revalidate", "route.ts"),
    REVALIDATE_ROUTE_FILE,
    force,
    result,
  );

  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  if (!pkg.dependencies?.[SITE_KIT]) {
    pkg.dependencies = { ...(pkg.dependencies ?? {}), [SITE_KIT]: "latest" };
    writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
    result.addedDependency = true;
  }
  return result;
}

export type InitDeps = {
  link?: (args: string[], output: Output) => Promise<number>;
  pair?: (args: string[], output: Output) => Promise<number>;
  skills?: (args: string[], output: Output) => Promise<number>;
};

/** The whole command. Steps that touch the network are skippable, because the
 *  scaffold is useful on its own and an agency behind a proxy should not be
 *  stopped at step three with two files already written. */
export async function runInitCommand(
  rawArgs: string[],
  output: Output = consoleOutput,
  deps: InitDeps = {},
): Promise<number> {
  const asJson = rawArgs.includes("--json");
  const args = rawArgs.filter((arg) => arg !== "--json");
  if (args.includes("--help") || args.includes("-h")) {
    output.stdout(
      [
        "Usage: snabbsajt init --agency [--no-pair] [--no-skills] [--force] [--json]",
        "",
        "Sets your existing Next.js app up as an agency site: writes snabbsajt/blocks.ts, collections.ts and components.ts",
        "and the catch-all route, adds @snabbsajt/site-kit, links this directory to one",
        "of your sites, pairs a write token, and installs the skills.",
        "",
        "Nothing you already wrote is overwritten. --force is the only way past that.",
      ].join("\n"),
    );
    return 0;
  }
  if (!args.includes("--agency")) {
    output.stderr(
      "snabbsajt: init needs --agency (a new empty package is `snabbsajt site init <dir>`)",
    );
    return 1;
  }

  const cwd = resolve(process.cwd());
  let scaffold: ScaffoldResult;
  try {
    scaffold = scaffoldAgencyProject(cwd, args.includes("--force"));
  } catch (error) {
    if (error instanceof InitError) {
      if (asJson) output.stdout(JSON.stringify({ ok: false, code: error.code, error: error.message }));
      else output.stderr(`snabbsajt: ${error.message}`);
      return 1;
    }
    throw error;
  }

  const link = deps.link ?? ((a, o) => runLinkCommand(a, o));
  const pair = deps.pair ?? ((a, o) => runAdminCommand(a, o));
  const skills = deps.skills ?? ((a, o) => runSkillsCommand(a, o));

  const steps: Array<{ step: string; code: number }> = [];
  if (!args.includes("--no-pair")) {
    // Read first, then write. A read token is enough to render, so an agency
    // that abandons the pairing halfway still has a repository that works.
    steps.push({ step: "link", code: await link(["link"], output) });
    steps.push({ step: "pair", code: await pair(["pair"], output) });
  }
  if (!args.includes("--no-skills")) {
    steps.push({
      step: "skills",
      code: await skills(["install", "--agent", "auto"], output),
    });
  }
  const failed = steps.find((step) => step.code !== 0);

  if (asJson) {
    output.stdout(
      JSON.stringify({
        ok: !failed,
        command: "init",
        written: scaffold.written,
        kept: scaffold.kept,
        addedDependency: scaffold.addedDependency,
        steps,
      }),
    );
    return failed ? failed.code : 0;
  }

  for (const path of scaffold.written) output.stdout(`wrote ${path}`);
  for (const path of scaffold.kept) output.stdout(`kept ${path} (already yours)`);
  if (scaffold.addedDependency) {
    output.stdout(
      `added ${SITE_KIT} to package.json. Install it with your package manager.`,
    );
  }
  if (failed) {
    output.stderr(`snabbsajt: ${failed.step} did not finish; the files above are in place`);
    return failed.code;
  }
  output.stdout("");
  output.stdout("Next:");
  output.stdout("  1. install the dependency");
  output.stdout("  2. describe your components in snabbsajt/blocks.ts, and your client's lists in snabbsajt/collections.ts");
  // `link` above already paired this directory to a website, so an ordinary
  // init has a target and the first push needs no flag at all. With --no-pair
  // there is nothing to push into, so the first one has to make the site.
  output.stdout(
    args.includes("--no-pair")
      ? "  3. snabbsajt push . --create"
      : "  3. snabbsajt push .",
  );
  output.stdout("  4. snabbsajt site doctor");
  return 0;
}
