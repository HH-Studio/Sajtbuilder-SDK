import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  agencyContractChecks,
  looksLikeAgencyProject,
} from "../src/commands/agencyDoctor";

// The contract walk (plan P0-2026-08-19 slice 1.5).
//
// Each of these breaks far from its cause, which is why they are worth naming:
// pictures that 404, an editor frame that is blank, a client's page that is a
// 404, and a repo where nothing is editable at all.

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "snabbsajt-doctor-"));
  for (const [path, contents] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, contents);
  }
  return dir;
}

const find = (dir: string, id: string) =>
  agencyContractChecks(dir).find((finding) => finding.id === id)!;

describe("the contract walk", () => {
  it("stays quiet in a directory that is not an agency project", () => {
    const dir = project({ "package.json": "{}" });
    expect(looksLikeAgencyProject(dir)).toBe(false);
  });

  it("names the missing pieces rather than passing them", () => {
    const dir = project({ ".snabbsajt-admin.json": "{}" });
    expect(find(dir, "blocks").status).toBe("problem");
    expect(find(dir, "catch-all").status).toBe("problem");
  });

  it("passes a repository that init set up", () => {
    const dir = project({
      "snabbsajt/blocks.ts": "export const library = {};",
      "app/[[...slug]]/page.tsx": "export default function Page() { return null }",
      "next.config.ts": "export default { images: { remotePatterns: [{ hostname: 'assets.snabbsajt.com' }] } }",
    });
    for (const id of ["blocks", "catch-all", "remote-images", "framing"]) {
      expect(find(dir, id).status, id).toBe("ok");
    }
  });

  it("says it cannot tell rather than guessing", () => {
    // remotePatterns naming somebody else is not a pass and not a failure: the
    // agency may serve their own images and still be fine.
    const dir = project({
      "snabbsajt/blocks.ts": "export const library = {};",
      "next.config.ts": "export default { images: { remotePatterns: [{ hostname: 'cdn.example.com' }] } }",
    });
    expect(find(dir, "remote-images").status).toBe("unknown");
  });

  it("catches a framing policy that would blank the editor", () => {
    const dir = project({
      "snabbsajt/blocks.ts": "export const library = {};",
      "middleware.ts": "const csp = \"frame-ancestors 'self'\";",
    });
    expect(find(dir, "framing").status).toBe("problem");
  });

  it("treats no policy at all as fine, because it is", () => {
    const dir = project({ "snabbsajt/blocks.ts": "export const library = {};" });
    expect(find(dir, "framing").status).toBe("ok");
  });
});
