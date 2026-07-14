import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { copyFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSdkContract,
  serializeSdkContract,
  verifyCanonicalAppContract,
} from "../scripts/sync-contract";

describe("canonical app contract", () => {
  it("matches the SDK mirror byte-for-byte", async () => {
    const checkedIn = readFileSync(new URL("../contract/portable-v1.json", import.meta.url), "utf8");
    const generated = serializeSdkContract(await buildSdkContract());
    expect(generated).toBe(checkedIn);
    const parsed = JSON.parse(generated);
    expect(parsed.portable.schema).toMatchObject({
      type: "object",
      value: { redirects: { optional: true } },
    });
    expect(parsed.importReport).toMatchObject({
      additionalProperties: false,
      required: expect.arrayContaining(["evidence", "items", "summary"]),
      properties: {
        revision: { const: "snabbsajt.import-report/v1" },
        adapter: { properties: { version: { pattern: "\\S" } } },
        timestamps: { properties: { startedAt: { format: "date-time" } } },
        summary: { properties: { total: { maximum: Number.MAX_SAFE_INTEGER } } },
      },
    });
  });

  it("rejects a divergent contract from the pinned app checkout", () => {
    const appRoot = mkdtempSync(join(tmpdir(), "snabbsajt-contract-"));
    mkdirSync(join(appRoot, "contract"));
    writeFileSync(join(appRoot, "contract/site-kit-portable-v1.json"), "{}\n");

    expect(() => verifyCanonicalAppContract(appRoot)).toThrow(/hash mismatch/);
  });

  it("rejects a divergent SDK mirror even when the pinned app artifact is authentic", () => {
    const appRoot = mkdtempSync(join(tmpdir(), "snabbsajt-canonical-app-"));
    const mirrorRoot = mkdtempSync(join(tmpdir(), "snabbsajt-contract-mirror-"));
    mkdirSync(join(appRoot, "contract"));
    copyFileSync(
      new URL("../contract/portable-v1.json", import.meta.url),
      join(appRoot, "contract/site-kit-portable-v1.json"),
    );
    const divergentMirror = join(mirrorRoot, "portable-v1.json");
    writeFileSync(divergentMirror, "{}\n");

    expect(() => verifyCanonicalAppContract(appRoot, new URL(`file://${divergentMirror}`))).toThrow(
      /SDK contract does not match/,
    );
  });
});
