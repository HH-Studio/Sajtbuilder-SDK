import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REGISTRY_ORIGIN = "https://registry.npmjs.org";
const PROVENANCE_PREFIX = "https://slsa.dev/provenance/";
const EXPECTED_REPOSITORY = "https://github.com/HH-Studio/Sajtbuilder-SDK";
const EXPECTED_WORKFLOW = ".github/workflows/release.yml";

type PackageManifest = {
  name?: unknown;
  version?: unknown;
  dist?: {
    integrity?: unknown;
    attestations?: {
      url?: unknown;
      provenance?: { predicateType?: unknown };
    };
  };
};

type ProvenanceStatement = {
  subject?: Array<{ name?: unknown; digest?: { sha512?: unknown } }>;
  predicate?: {
    buildDefinition?: {
      externalParameters?: {
        workflow?: { ref?: unknown; repository?: unknown; path?: unknown };
      };
      resolvedDependencies?: Array<{ digest?: { gitCommit?: unknown } }>;
    };
  };
};

type AttestationResponse = {
  attestations?: Array<{
    predicateType?: unknown;
    bundle?: { dsseEnvelope?: { payload?: unknown } };
  }>;
};

export type PublishedPackageState = "missing" | "verified";

/** A retry may skip only the exact version when npm records valid provenance metadata. */
export async function inspectPublishedPackage(
  name: string,
  version: string,
  fetchImpl: typeof fetch = fetch,
  expectedCommit = process.env.GITHUB_SHA,
): Promise<PublishedPackageState> {
  const url = `${REGISTRY_ORIGIN}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
  const response = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (response.status === 404) return "missing";
  if (!response.ok) {
    throw new Error(`npm registry check failed for ${name}@${version}: HTTP ${response.status}`);
  }

  const manifest = (await response.json()) as PackageManifest;
  if (manifest.name !== name || manifest.version !== version) {
    throw new Error(`npm registry returned the wrong package identity for ${name}@${version}`);
  }
  const attestations = manifest.dist?.attestations;
  const integrity = manifest.dist?.integrity;
  const predicate = attestations?.provenance?.predicateType;
  const attestationUrl = attestations?.url;
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = typeof attestationUrl === "string" ? new URL(attestationUrl) : null;
  } catch {
    parsedUrl = null;
  }
  if (
    typeof predicate !== "string" ||
    !predicate.startsWith(PROVENANCE_PREFIX) ||
    typeof integrity !== "string" ||
    !integrity.startsWith("sha512-") ||
    typeof expectedCommit !== "string" ||
    !/^[0-9a-f]{40}$/.test(expectedCommit) ||
    parsedUrl?.origin !== REGISTRY_ORIGIN ||
    !parsedUrl.pathname.startsWith("/-/npm/v1/attestations/")
  ) {
    throw new Error(
      `${name}@${version} already exists without the expected npm provenance; refusing to skip or overwrite it`,
    );
  }

  const attestationResponse = await fetchImpl(parsedUrl.toString(), {
    headers: { accept: "application/json" },
  });
  if (!attestationResponse.ok) {
    throw new Error(
      `npm attestation check failed for ${name}@${version}: HTTP ${attestationResponse.status}`,
    );
  }
  const body = (await attestationResponse.json()) as AttestationResponse;
  const encodedName = name.startsWith("@")
    ? `${encodeURIComponent(name.split("/")[0])}/${encodeURIComponent(name.split("/")[1] ?? "")}`
    : encodeURIComponent(name);
  const expectedSubject = `pkg:npm/${encodedName}@${version}`;
  const expectedDigest = Buffer.from(integrity.slice("sha512-".length), "base64").toString("hex");
  if (!/^[0-9a-f]{128}$/.test(expectedDigest)) {
    throw new Error(`${name}@${version} has an invalid sha512 integrity value`);
  }
  const expectedRef = `refs/tags/v${version}`;
  const verified = body.attestations?.some((entry) => {
    if (entry.predicateType !== "https://slsa.dev/provenance/v1") return false;
    const payload = entry.bundle?.dsseEnvelope?.payload;
    if (typeof payload !== "string") return false;
    let statement: ProvenanceStatement;
    try {
      statement = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as ProvenanceStatement;
    } catch {
      return false;
    }
    const build = statement.predicate?.buildDefinition;
    const workflow = build?.externalParameters?.workflow;
    return statement.subject?.some((subject) =>
      subject.name === expectedSubject && subject.digest?.sha512 === expectedDigest
    ) === true &&
      workflow?.repository === EXPECTED_REPOSITORY &&
      workflow.path === EXPECTED_WORKFLOW &&
      workflow.ref === expectedRef &&
      build?.resolvedDependencies?.some((dependency) =>
        dependency.digest?.gitCommit === expectedCommit
      ) === true;
  });
  if (!verified) {
    throw new Error(
      `${name}@${version} provenance does not match this repository, release workflow, tag, commit, and tarball digest`,
    );
  }
  return "verified";
}

export async function publishPackage(
  packageDir: string,
  dependencies: {
    fetchImpl?: typeof fetch;
    publish?: (directory: string) => void;
    expectedCommit?: string;
  } = {},
): Promise<PublishedPackageState> {
  const directory = resolve(packageDir);
  const manifest = JSON.parse(readFileSync(resolve(directory, "package.json"), "utf8")) as {
    name?: unknown;
    version?: unknown;
  };
  if (typeof manifest.name !== "string" || typeof manifest.version !== "string") {
    throw new Error(`${directory}/package.json must declare name and version`);
  }

  const state = await inspectPublishedPackage(
    manifest.name,
    manifest.version,
    dependencies.fetchImpl,
    dependencies.expectedCommit,
  );
  if (state === "verified") {
    process.stdout.write(
      `Verified ${manifest.name}@${manifest.version} already exists with provenance; skipping publish.\n`,
    );
    return state;
  }

  const publish = dependencies.publish ?? ((target: string) => {
    execFileSync("npm", ["publish", "--provenance", "--access", "public", target], {
      stdio: "inherit",
    });
  });
  publish(directory);
  return state;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const packageDir = process.argv[2];
  if (!packageDir) throw new Error("usage: bun scripts/publish-package.ts <package-directory>");
  await publishPackage(packageDir);
}
