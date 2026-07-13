import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSdkContract, serializeSdkContract } from "../scripts/sync-contract";

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
});
