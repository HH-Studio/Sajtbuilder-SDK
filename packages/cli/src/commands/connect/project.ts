import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
 *  Intentionally a plain check of the local `.gitignore` rather than shelling
 *  out to `git check-ignore`: the CLI must work in a directory that is not a
 *  git repository yet, and a wrong "yes it is ignored" is far more dangerous
 *  than a wrong "I could not tell". Anything ambiguous reads as NOT ignored. */
export function envFileIsGitIgnored(cwd: string): boolean {
  const gitignore = join(cwd, ".gitignore");
  if (!existsSync(gitignore)) return false;
  let contents: string;
  try {
    contents = readFileSync(gitignore, "utf8");
  } catch {
    return false;
  }
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .some(
      (line) =>
        line === ENV_FILE ||
        line === `/${ENV_FILE}` ||
        line === ".env*" ||
        line === ".env*.local" ||
        line === "*.local",
    );
}

export type TokenWriteResult = {
  /** "created" | "replaced" | "appended" — what happened to .env.local. */
  action: "created" | "replaced" | "appended";
  /** True when the token landed in a file git would track. The caller MUST
   *  surface this; it is the difference between a secret and a published one. */
  unignored: boolean;
};

/** Put the delivery token in `.env.local`, replacing any previous value of the
 *  same key rather than stacking duplicates (the last assignment wins in every
 *  dotenv loader, so a stale first line is a confusing no-op). */
export function writeDeliveryToken(cwd: string, token: string): TokenWriteResult {
  const path = join(cwd, ENV_FILE);
  const line = `${TOKEN_ENV_VAR}=${token}`;
  const unignored = !envFileIsGitIgnored(cwd);

  if (!existsSync(path)) {
    writeFileSync(path, `${line}\n`, { encoding: "utf8", mode: 0o600 });
    return { action: "created", unignored };
  }

  const existing = readFileSync(path, "utf8");
  const lines = existing.split(/\r?\n/);
  const index = lines.findIndex((l) => l.trimStart().startsWith(`${TOKEN_ENV_VAR}=`));
  if (index >= 0) {
    lines[index] = line;
    writeFileSync(path, `${lines.join("\n").replace(/\n*$/, "")}\n`, "utf8");
    return { action: "replaced", unignored };
  }

  const separator = existing.endsWith("\n") || existing === "" ? "" : "\n";
  writeFileSync(path, `${existing}${separator}${line}\n`, "utf8");
  return { action: "appended", unignored };
}

/** The token for the current project: the environment first (CI sets it there
 *  and must win), then `.env.local` as the local-development convenience. */
export function readDeliveryToken(cwd: string): string | undefined {
  const fromEnv = process.env[TOKEN_ENV_VAR];
  if (fromEnv) return fromEnv;
  const path = join(cwd, ENV_FILE);
  if (!existsSync(path)) return undefined;
  try {
    const line = readFileSync(path, "utf8")
      .split(/\r?\n/)
      .reverse() // last assignment wins, matching dotenv
      .find((l) => l.trimStart().startsWith(`${TOKEN_ENV_VAR}=`));
    if (!line) return undefined;
    const value = line.slice(line.indexOf("=") + 1).trim();
    return value.replace(/^["']|["']$/g, "") || undefined;
  } catch {
    return undefined;
  }
}
