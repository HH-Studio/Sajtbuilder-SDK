import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Where a paired project keeps its wiring.
//
// Two files, split by secrecy, because conflating them is how tokens end up in
// public repos:
//
//   .snabbsajt.json  siteId + apiUrl. Not a secret. Commit it — a teammate who
//                    clones the repo then only needs their own token.
//   .env.local       SNABBSAJT_DELIVERY_TOKEN. A secret. Must be gitignored,
//                    and we refuse to write it quietly if it is not.
// ---------------------------------------------------------------------------

export const PROJECT_FILE = ".snabbsajt.json";
export const ENV_FILE = ".env.local";
export const TOKEN_ENV_VAR = "SNABBSAJT_DELIVERY_TOKEN";

export type ProjectConfig = {
  siteId: string;
  apiUrl: string;
  /** Display-only, so `pull` can say which site it is talking about. */
  siteName?: string;
  slug?: string;
};

export function projectConfigPath(cwd: string): string {
  return join(cwd, PROJECT_FILE);
}

export function readProjectConfig(cwd: string): ProjectConfig | undefined {
  const path = projectConfigPath(cwd);
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<ProjectConfig>;
    if (!parsed.siteId || !parsed.apiUrl) return undefined;
    return {
      siteId: parsed.siteId,
      apiUrl: parsed.apiUrl,
      ...(parsed.siteName ? { siteName: parsed.siteName } : {}),
      ...(parsed.slug ? { slug: parsed.slug } : {}),
    };
  } catch {
    return undefined;
  }
}

export function writeProjectConfig(cwd: string, config: ProjectConfig): void {
  writeFileSync(
    projectConfigPath(cwd),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
}

/** True when `.env.local` is covered by a gitignore rule in this directory.
 *
 *  Asks git first, because git is the only thing that actually decides this:
 *  it understands globs, negations, parent-directory `.gitignore` files, nested
 *  rules and `.git/info/exclude`, and our literal matcher understands none of
 *  them. When git cannot answer — not installed, or this is not a repository
 *  yet, which is a normal state for a fresh project — we fall back to reading
 *  the local `.gitignore` literally.
 *
 *  Either way, a wrong "yes it is ignored" is far more dangerous than a wrong
 *  "I could not tell", so everything ambiguous still reads as NOT ignored. */
export function envFileIsGitIgnored(cwd: string): boolean {
  const fromGit = gitSaysIgnored(cwd);
  if (fromGit !== undefined) return fromGit;

  const gitignore = join(cwd, ".gitignore");
  if (!existsSync(gitignore)) return false;
  let contents: string;
  try {
    contents = readFileSync(gitignore, "utf8");
  } catch {
    return false;
  }
  const lines = contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  // A negation that could re-include this file means we cannot reason about it
  // with literal matching: `.env*` followed by `!.env.local` re-includes the
  // very file we are protecting. Give up and report NOT ignored.
  //
  // Only negations that could plausibly match `.env.local` count. An earlier
  // version bailed on ANY `!` line, which made the default create-next-app
  // `.gitignore` — it negates four `.yarn/` paths — warn on every single
  // Next.js project, about a file git was ignoring perfectly well. A security
  // warning that fires on healthy projects is one people learn to skip.
  if (lines.some((line) => line.startsWith("!") && couldMatchEnvFile(line.slice(1))))
    return false;
  return lines.some((line) => literallyCoversEnvFile(line));
}

/** git's own verdict: `true`/`false` when it answered, `undefined` when it
 *  could not be asked (no git, not a repository). Never throws. */
function gitSaysIgnored(cwd: string): boolean | undefined {
  let result: ReturnType<typeof spawnSync>;
  try {
    // Deliberately WITHOUT --no-index. If `.env.local` is already tracked, git
    // reports it as not-ignored, and that is exactly right: a tracked token is
    // the worst case here, and it must still produce the warning even though an
    // ignore rule matches the path.
    result = spawnSync("git", ["check-ignore", "--quiet", ENV_FILE], {
      cwd,
      stdio: "ignore",
      timeout: 2000,
    });
  } catch {
    return undefined;
  }
  if (result.error || result.signal) return undefined;
  // Documented exit codes: 0 = ignored, 1 = not ignored, 128 = fatal (most
  // often "not a git repository"). Anything else, we do not interpret.
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  return undefined;
}

/** Literal patterns we are confident cover `.env.local`. */
function literallyCoversEnvFile(line: string): boolean {
  return (
    line === ENV_FILE ||
    line === `/${ENV_FILE}` ||
    line === ".env*" ||
    line === ".env*.local" ||
    line === "*.local"
  );
}

/** Would this pattern plausibly match `.env.local`? Used only to decide whether
 *  a negation is worth surrendering to, so it errs toward "yes". */
function couldMatchEnvFile(pattern: string): boolean {
  const trimmed = pattern.trim().replace(/^\//, "");
  if (!trimmed) return false;
  if (literallyCoversEnvFile(trimmed)) return true;
  // A leading-wildcard pattern like `*` or `*.local` can reach it; a path
  // segment that does not start with `.env` cannot.
  if (trimmed.startsWith("*")) return true;
  return trimmed.startsWith(".env");
}

export type TokenWriteResult = {
  /** "created" | "replaced" | "appended" — what happened to .env.local. */
  action: "created" | "replaced" | "appended";
  /** True when the token landed in a file git would track. The caller MUST
   *  surface this; it is the difference between a secret and a published one. */
  unignored: boolean;
};

/** Put one variable in `.env.local`, replacing any previous value of the same key
 *  rather than stacking duplicates (the last assignment wins in every dotenv
 *  loader, so a stale first line is a confusing no-op).
 *
 *  Key-agnostic on purpose: the read-only delivery token and the `admin`
 *  namespace's separate write token are different credentials in different
 *  variables, and dotenv line editing is not a thing to keep two copies of. */
export function writeEnvVar(
  cwd: string,
  key: string,
  value: string,
): TokenWriteResult {
  const path = join(cwd, ENV_FILE);
  const line = `${key}=${value}`;
  const unignored = !envFileIsGitIgnored(cwd);

  if (!existsSync(path)) {
    writeFileSync(path, `${line}\n`, { encoding: "utf8", mode: 0o600 });
    return { action: "created", unignored };
  }

  const existing = readFileSync(path, "utf8");
  const lines = existing.split(/\r?\n/);
  const index = lines.findIndex((l) => l.trimStart().startsWith(`${key}=`));
  if (index >= 0) {
    lines[index] = line;
    writeFileSync(path, `${lines.join("\n").replace(/\n*$/, "")}\n`, "utf8");
    return { action: "replaced", unignored };
  }

  const separator = existing.endsWith("\n") || existing === "" ? "" : "\n";
  writeFileSync(path, `${existing}${separator}${line}\n`, "utf8");
  return { action: "appended", unignored };
}

/** One variable for the current project: the environment first (CI sets it there
 *  and must win), then `.env.local` as the local-development convenience. */
export function readEnvVar(cwd: string, key: string): string | undefined {
  const fromEnv = process.env[key];
  if (fromEnv) return fromEnv;
  const path = join(cwd, ENV_FILE);
  if (!existsSync(path)) return undefined;
  try {
    const line = readFileSync(path, "utf8")
      .split(/\r?\n/)
      .reverse() // last assignment wins, matching dotenv
      .find((l) => l.trimStart().startsWith(`${key}=`));
    if (!line) return undefined;
    const value = line.slice(line.indexOf("=") + 1).trim();
    return value.replace(/^["']|["']$/g, "") || undefined;
  } catch {
    return undefined;
  }
}

export function writeDeliveryToken(cwd: string, token: string): TokenWriteResult {
  return writeEnvVar(cwd, TOKEN_ENV_VAR, token);
}

export function readDeliveryToken(cwd: string): string | undefined {
  return readEnvVar(cwd, TOKEN_ENV_VAR);
}

/** Drop one variable from `.env.local`, leaving every other line — and the
 *  file's own permissions — untouched.
 *
 *  `unlink` needs this. Rewriting the file wholesale, or deleting it, would
 *  take the developer's other secrets with it. */
export function removeEnvVar(cwd: string, key: string): boolean {
  const path = join(cwd, ENV_FILE);
  if (!existsSync(path)) return false;
  const existing = readFileSync(path, "utf8");
  const lines = existing.split(/\r?\n/);
  const kept = lines.filter((line) => !line.trimStart().startsWith(`${key}=`));
  if (kept.length === lines.length) return false;
  // Preserve whether the file ended with a newline: a diff that only moves the
  // last byte is noise in someone else's review.
  const joined = kept.join("\n").replace(/\n+$/, "");
  writeFileSync(path, joined === "" ? "" : `${joined}\n`, "utf8");
  return true;
}

/** Remove `.snabbsajt.json`. Returns false when there was nothing to remove, so
 *  `unlink` can be idempotent without pretending it did something. */
export function removeProjectConfig(cwd: string): boolean {
  const path = projectConfigPath(cwd);
  if (!existsSync(path)) return false;
  rmSync(path);
  return true;
}

/** The nearest `.snabbsajt.json` in a PARENT directory, if any.
 *
 *  Not a root-walk that would then act on it — `link` deliberately only ever
 *  writes to the directory you ran it in. This exists so the one genuinely
 *  confusing monorepo case ("I linked the repo root last week and I am now in
 *  apps/web") produces a sentence instead of a second config nobody expected.
 *  Stops at the filesystem root and at any `.git`, which is where a repo ends. */
export function findAncestorProjectConfig(cwd: string): string | undefined {
  let dir = dirname(cwd);
  let previous = cwd;
  while (dir !== previous) {
    if (existsSync(join(dir, PROJECT_FILE))) return dir;
    if (existsSync(join(dir, ".git"))) return undefined;
    previous = dir;
    dir = dirname(dir);
  }
  return undefined;
}
