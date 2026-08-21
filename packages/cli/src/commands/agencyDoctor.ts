import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// The contract an agency's own app has to keep.
//
// Plan: docs/plans/doing/P0-2026-08-19-agency-program-master.md slice 1.5.
//
// Four things break a first agency setup, and each of them breaks somewhere far
// from its cause: the client's images 404 because the host is not allowed, the
// editor shows a blank frame because a CSP forbids framing, the catch-all is
// missing so a page the client made is a 404, and the blocks file was never
// written so nothing is editable at all.
//
// **This reads text, so it never claims a pass it cannot prove.** A finding is
// `ok`, `problem` or `unknown`, and `unknown` is a real answer here: a config
// that computes its values at runtime is not something a reader can decide, and
// saying "fine" about it would be worse than saying "look yourself".
// ---------------------------------------------------------------------------

export type ContractFinding = {
  id: string;
  status: "ok" | "problem" | "unknown";
  /** What to do, in one sentence. Empty when the status is ok. */
  advice: string;
};

const ASSET_HOST_HINTS = ["snabbsajt", "convex.cloud"];

function readIfPresent(paths: string[]): string | undefined {
  for (const path of paths) {
    if (existsSync(path)) return readFileSync(path, "utf8");
  }
  return undefined;
}

/** Walk the contract in `cwd`. Pure apart from the reads, so it is testable
 *  against a fixture directory rather than against somebody's real app. */
export function agencyContractChecks(cwd: string): ContractFinding[] {
  const findings: ContractFinding[] = [];

  const blocks = join(cwd, "snabbsajt", "blocks.ts");
  findings.push(
    existsSync(blocks)
      ? { id: "blocks", status: "ok", advice: "" }
      : {
          id: "blocks",
          status: "problem",
          advice:
            "No snabbsajt/blocks.ts, so nothing is editable. Run `snabbsajt init --agency`.",
        },
  );

  const catchAll =
    existsSync(join(cwd, "app", "[[...slug]]", "page.tsx")) ||
    existsSync(join(cwd, "src", "app", "[[...slug]]", "page.tsx"));
  findings.push(
    catchAll
      ? { id: "catch-all", status: "ok", advice: "" }
      : {
          id: "catch-all",
          status: "problem",
          advice:
            "No catch-all route, so a page your client creates is a 404. Run `snabbsajt init --agency`.",
        },
  );

  const config = readIfPresent([
    join(cwd, "next.config.ts"),
    join(cwd, "next.config.js"),
    join(cwd, "next.config.mjs"),
  ]);
  if (config === undefined) {
    findings.push({
      id: "remote-images",
      status: "unknown",
      advice:
        "No next.config found. Make sure your image host allows the SnabbSajt asset host.",
    });
  } else if (!config.includes("remotePatterns")) {
    findings.push({
      id: "remote-images",
      status: "problem",
      advice:
        "next.config has no images.remotePatterns, so every picture your client uploads will fail to load.",
    });
  } else if (ASSET_HOST_HINTS.some((hint) => config.includes(hint))) {
    findings.push({ id: "remote-images", status: "ok", advice: "" });
  } else {
    findings.push({
      id: "remote-images",
      status: "unknown",
      advice:
        "images.remotePatterns is set but names no SnabbSajt host. Check that your client's uploads are allowed.",
    });
  }

  // Framing is the one that reads as a product bug: the editor shows an empty
  // rectangle and nobody suspects a header. A missing policy is fine, because
  // no policy means no restriction; a policy that names frame-ancestors without
  // naming us is the dangerous shape.
  const framingSource = [
    config ?? "",
    readIfPresent([
      join(cwd, "middleware.ts"),
      join(cwd, "src", "middleware.ts"),
    ]) ?? "",
  ].join("\n");
  if (!framingSource.includes("frame-ancestors")) {
    findings.push({ id: "framing", status: "ok", advice: "" });
  } else if (framingSource.includes("snabbsajt")) {
    findings.push({ id: "framing", status: "ok", advice: "" });
  } else {
    findings.push({
      id: "framing",
      status: "problem",
      advice:
        "A frame-ancestors policy does not name SnabbSajt, so your client will see a blank frame in the editor.",
    });
  }

  return findings;
}

/** True when this directory is an agency project at all. Doctor stays quiet in
 *  a plain package directory, where none of the above applies. */
export function looksLikeAgencyProject(cwd: string): boolean {
  return (
    existsSync(join(cwd, "snabbsajt", "blocks.ts")) ||
    existsSync(join(cwd, ".snabbsajt-admin.json")) ||
    existsSync(join(cwd, "app", "[[...slug]]", "page.tsx")) ||
    existsSync(join(cwd, "src", "app", "[[...slug]]", "page.tsx"))
  );
}
