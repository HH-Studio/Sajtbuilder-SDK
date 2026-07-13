import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PORTABLE_CAPS } from "../src/lib/portability/caps";
import { SECTION_REGISTRY } from "../src/lib/sections/registry";
import { SECTION_TYPES } from "../src/convex/model/sections";
import { PORTABLE_FORMAT, PORTABLE_VERSION, portableSiteV1 } from "../src/convex/model/portable";
import { buildImportReportJsonContract } from "../src/import/jsonContract";

const CONTRACT_URL = new URL("../contract/portable-v1.json", import.meta.url);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(object).sort().map((key) => [key, canonicalize(object[key])]));
}

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

export async function buildSdkContract() {
  const unsigned = {
    format: "snabbsajt-site-kit-contract" as const,
    revision: 1 as const,
    provenance: {
      repository: "HH-Studio/simple-site-builder" as const,
      generator: "scripts/export-site-kit-contract.ts" as const,
    },
    portable: {
      format: PORTABLE_FORMAT,
      version: PORTABLE_VERSION,
      schema: (portableSiteV1 as unknown as { json: unknown }).json,
    },
    caps: PORTABLE_CAPS,
    sections: {
      types: [...SECTION_TYPES],
      variants: Object.fromEntries(
        [...SECTION_TYPES].sort().map((type) => [
          type,
          SECTION_REGISTRY[type].variants.map((variant) => variant.key).sort(),
        ]),
      ),
    },
    importReport: buildImportReportJsonContract(),
  };
  const hash = `sha256:${createHash("sha256").update(canonicalJson(unsigned)).digest("hex")}`;
  return { ...unsigned, hash };
}

export function serializeSdkContract(contract: Awaited<ReturnType<typeof buildSdkContract>>): string {
  return canonicalJson(contract);
}

async function main() {
  const generated = serializeSdkContract(await buildSdkContract());
  const syncIndex = process.argv.indexOf("--sync-from-app");
  if (syncIndex >= 0) {
    const appRoot = process.argv[syncIndex + 1];
    if (!appRoot) throw new Error("--sync-from-app requires the app repository path");
    const canonicalPath = resolve(appRoot, "contract/site-kit-portable-v1.json");
    const canonical = readFileSync(canonicalPath, "utf8");
    if (canonical !== generated) {
      throw new Error("SDK mirrors do not match the canonical app contract");
    }
    writeFileSync(CONTRACT_URL, canonical);
    return;
  }
  if (process.argv.includes("--check")) {
    const checkedIn = readFileSync(CONTRACT_URL, "utf8");
    if (generated !== checkedIn) {
      throw new Error("contract/portable-v1.json is stale; run `bun scripts/sync-contract.ts --sync-from-app <appRoot>`");
    }
    return;
  }
  process.stdout.write(generated);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
