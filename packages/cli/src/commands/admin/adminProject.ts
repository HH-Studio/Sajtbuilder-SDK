import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ENV_FILE,
  type TokenWriteResult,
  readEnvVar,
  writeEnvVar,
} from "../connect/project";

// ---------------------------------------------------------------------------
// Where an `admin`-paired project keeps its wiring.
//
// The write credential gets its OWN variable and its OWN file, both separate
// from `connect`'s:
//
//   .snabbsajt-admin.json  appUrl + siteId + the granted scopes. Not a secret;
//                          commit it if you like. Kept apart from
//                          `.snabbsajt.json` so `connect` stays the sole owner
//                          of that file.
//   .env.local             SNABBSAJT_ADMIN_TOKEN. A secret with write power.
//                          Deliberately NOT SNABBSAJT_DELIVERY_TOKEN: putting a
//                          capability-scoped token in the read-only variable
//                          would silently escalate what `pull` holds.
// ---------------------------------------------------------------------------

export const ADMIN_PROJECT_FILE = ".snabbsajt-admin.json";
export const ADMIN_TOKEN_ENV_VAR = "SNABBSAJT_ADMIN_TOKEN";
export const ADMIN_TOKEN_PREFIX = "sajt_live_";
export { ENV_FILE };

export type AdminConfig = {
  /** App origin the MCP endpoint lives on. */
  appUrl: string;
  /** Convex site origin the pairing endpoints live on. */
  apiUrl: string;
  siteId: string;
  /** What the owner actually granted, so `admin` can report it later. */
  scopes: string[];
  siteName?: string;
  slug?: string;
  pairedAt: string;
};

export function adminConfigPath(cwd: string): string {
  return join(cwd, ADMIN_PROJECT_FILE);
}

export function readAdminConfig(cwd: string): AdminConfig | undefined {
  const path = adminConfigPath(cwd);
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<AdminConfig>;
    if (!parsed.appUrl || !parsed.siteId) return undefined;
    return {
      appUrl: parsed.appUrl,
      apiUrl: parsed.apiUrl ?? "",
      siteId: parsed.siteId,
      scopes: Array.isArray(parsed.scopes)
        ? parsed.scopes.filter((s): s is string => typeof s === "string")
        : [],
      ...(parsed.siteName ? { siteName: parsed.siteName } : {}),
      ...(parsed.slug ? { slug: parsed.slug } : {}),
      pairedAt: parsed.pairedAt ?? "",
    };
  } catch {
    return undefined;
  }
}

export function writeAdminConfig(cwd: string, config: AdminConfig): void {
  writeFileSync(adminConfigPath(cwd), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function writeAdminToken(cwd: string, token: string): TokenWriteResult {
  return writeEnvVar(cwd, ADMIN_TOKEN_ENV_VAR, token);
}

/** The admin token: environment first (CI sets it there and must win), then
 *  `.env.local`. Returns undefined for a value that cannot be an admin token, so
 *  the caller says "pair" instead of sending a delivery token to the MCP
 *  endpoint and reporting the resulting 401 as a revocation. */
export function readAdminToken(cwd: string): string | undefined {
  const value = readEnvVar(cwd, ADMIN_TOKEN_ENV_VAR);
  if (!value) return undefined;
  return value.startsWith(ADMIN_TOKEN_PREFIX) ? value : undefined;
}

/** True when the variable holds something that is not an admin token, which is
 *  a different message from "you have not paired". */
export function adminTokenIsMalformed(cwd: string): boolean {
  const value = readEnvVar(cwd, ADMIN_TOKEN_ENV_VAR);
  return value !== undefined && !value.startsWith(ADMIN_TOKEN_PREFIX);
}
