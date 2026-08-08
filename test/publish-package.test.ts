import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { inspectPublishedPackage, publishPackage } from "../scripts/publish-package";

const name = "@snabbsajt/site-kit";
const version = "0.4.0";
const commit = "a".repeat(40);
const integrityBytes = createHash("sha512").update("expected-tarball").digest();
const integrity = `sha512-${integrityBytes.toString("base64")}`;

function provenancePayload(overrides: Record<string, unknown> = {}) {
  return Buffer.from(JSON.stringify({
    subject: [{
      name: "pkg:npm/%40snabbsajt/site-kit@0.4.0",
      digest: { sha512: integrityBytes.toString("hex") },
    }],
    predicate: {
      buildDefinition: {
        externalParameters: {
          workflow: {
            ref: "refs/tags/v0.4.0",
            repository: "https://github.com/HH-Studio/Sajtbuilder-SDK",
            path: ".github/workflows/release.yml",
          },
        },
        resolvedDependencies: [{ digest: { gitCommit: commit } }],
      },
    },
    ...overrides,
  })).toString("base64");
}

function publishedFetch(payload = provenancePayload()) {
  return vi.fn(async (input: string | URL | Request) =>
    String(input).includes("/-/npm/v1/attestations/")
      ? response(200, {
          attestations: [{
            predicateType: "https://slsa.dev/provenance/v1",
            bundle: { dsseEnvelope: { payload } },
          }],
        })
      : response(200, {
          name,
          version,
          dist: {
            integrity,
            attestations: {
              url: "https://registry.npmjs.org/-/npm/v1/attestations/@snabbsajt%2fsite-kit@0.4.0",
              provenance: { predicateType: "https://slsa.dev/provenance/v1" },
            },
          },
        })) as unknown as typeof fetch;
}

function response(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function packageDir() {
  const directory = mkdtempSync(join(tmpdir(), "snabbsajt-publish-"));
  writeFileSync(join(directory, "package.json"), JSON.stringify({ name, version }));
  return directory;
}

describe("retry-safe package publishing", () => {
  it("publishes only when the exact version is absent", async () => {
    const publish = vi.fn();
    const state = await publishPackage(packageDir(), {
      fetchImpl: vi.fn(async () => response(404)) as unknown as typeof fetch,
      publish,
    });

    expect(state).toBe("missing");
    expect(publish).toHaveBeenCalledOnce();
  });

  it("skips an exact version only when npm records provenance", async () => {
    const publish = vi.fn();
    const state = await publishPackage(packageDir(), {
      fetchImpl: publishedFetch(),
      publish,
      expectedCommit: commit,
    });

    expect(state).toBe("verified");
    expect(publish).not.toHaveBeenCalled();
  });

  it("fails closed when signed provenance identifies another source or digest", async () => {
    const wrongSource = provenancePayload({
      subject: [{
        name: "pkg:npm/%40snabbsajt/site-kit@0.4.0",
        digest: { sha512: "0".repeat(128) },
      }],
    });
    await expect(inspectPublishedPackage(
      name,
      version,
      publishedFetch(wrongSource),
      commit,
    )).rejects.toThrow(/does not match this repository/);
  });

  it("fails closed when an existing version lacks expected provenance", async () => {
    await expect(inspectPublishedPackage(
      name,
      version,
      vi.fn(async () => response(200, { name, version, dist: {} })) as unknown as typeof fetch,
    )).rejects.toThrow(/without the expected npm provenance/);
  });

  it("fails closed on registry errors and identity mismatches", async () => {
    await expect(inspectPublishedPackage(
      name,
      version,
      vi.fn(async () => response(503)) as unknown as typeof fetch,
    )).rejects.toThrow(/HTTP 503/);
    await expect(inspectPublishedPackage(
      name,
      version,
      vi.fn(async () => response(200, { name, version: "9.9.9" })) as unknown as typeof fetch,
    )).rejects.toThrow(/wrong package identity/);
  });

  it("keeps manual dispatch non-publishing and routes tag retries through the guard", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/release.yml", import.meta.url),
      "utf8",
    );
    expect(workflow).toContain("if: ${{ github.event_name == 'workflow_dispatch' }}");
    expect(workflow).toContain("if: ${{ github.event_name == 'push' }}");
    expect(workflow.match(/bun scripts\/publish-package\.ts/g)).toHaveLength(2);
    expect(workflow).toContain("uses: actions/setup-node@v7");
    expect(workflow).toContain("npm config set //registry.npmjs.org/:_authToken");
    expect(workflow.match(/sync-contract\.ts --check-app-contract/g)).toHaveLength(3);
    expect(workflow).toContain("npm audit signatures");
    expect(workflow).not.toContain("NODE_AUTH_TOKEN:");
    const manualJob = workflow.slice(workflow.indexOf("  verify:"), workflow.indexOf("  # The skill archives"));
    expect(manualJob).not.toContain("id-token: write");
    expect(manualJob).not.toContain("NPM_TOKEN");
    expect(manualJob).toContain("contents: read");
    expect(workflow).toContain("if: ${{ github.event_name == 'push' && !startsWith(github.ref_name, 'skills-v') }}");
    expect(workflow).toContain(
      '[[ "$version" =~ ^[0-9]+\\.[0-9]+\\.[0-9]+$ ]] || { echo "package version must be stable semver"',
    );
    expect(workflow.match(/cli depends on site-kit '\$dep', expected \$\{[^}]+\}/g)).toHaveLength(2);
  });
});
